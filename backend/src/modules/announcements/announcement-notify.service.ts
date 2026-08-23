import { AnnouncementModel } from '../../models/announcement.model.js';
import { ProfessorModel } from '../../models/professor.model.js';
import { crearNotificacion, type Prioridad } from '../../shared/notify.js';

/**
 * Aviso publicado → notificación a quien lo recibe.
 *
 * Hasta ahora publicar un aviso no avisaba a nadie: se guardaba y el docente
 * solo se enteraba si entraba a la pantalla de Avisos por su cuenta. Un cambio
 * de fechas de entrega podía pasar días sin que nadie lo viera, que es
 * justamente lo que un aviso urgente no puede permitirse.
 *
 * El reparto reutiliza `crearNotificacion`, así que hereda de una sola vez el
 * control de duplicados, las preferencias del usuario, las horas de silencio y
 * el envío al teléfono. Aquí solo se decide QUIÉN y con qué prioridad.
 */

/** Aviso urgente → notificación urgente. El color del aviso ya lo decía. */
const PRIORIDAD_POR_TIPO: Record<string, Prioridad> = {
  URGENTE: 'URGENT',
  IMPORTANTE: 'IMPORTANT',
  INFORMATIVO: 'INFO',
};

export type AvisoNotificable = {
  id: string;
  titulo: string;
  cuerpo: string;
  tipo: string;
  autorId?: string | null;
  sedes: string[];
  facultades: string[];
  programas: string[];
  publicadoEn: Date;
  expiraEn: Date | null;
};

export type ResultadoReparto = {
  notificados: number;
  omitidos: number;
  motivo: 'programado' | 'caducado' | null;
};

/**
 * Resumen del aviso para el cuerpo de la notificación.
 *
 * El aviso entero puede tener 4000 caracteres y una notificación de Android
 * muestra dos líneas. Se corta por palabra y no a mitad de una: «Se aplaza la
 * entr…» no dice nada que «Se aplaza la…» no diga ya.
 */
export function resumirCuerpo(cuerpo: string, limite = 140): string {
  const limpio = cuerpo.replace(/\s+/g, ' ').trim();
  if (limpio.length <= limite) return limpio;
  const cortado = limpio.slice(0, limite);
  const ultimoEspacio = cortado.lastIndexOf(' ');
  return `${(ultimoEspacio > limite * 0.6 ? cortado.slice(0, ultimoEspacio) : cortado).trimEnd()}…`;
}

/** Filtro sobre fichas de docente equivalente al alcance de un aviso. */
function docentesEnAlcance(aviso: AvisoNotificable): Record<string, unknown> {
  const filtro: Record<string, unknown> = {
    deletedAt: null,
    estado: { $nin: ['PENDIENTE', 'RECHAZADO'] },
  };
  if (aviso.sedes.length) filtro.sede = { $in: aviso.sedes };
  if (aviso.facultades.length) filtro.facultad = { $in: aviso.facultades };
  if (aviso.programas.length) filtro.programas = { $in: aviso.programas };
  return filtro;
}

/**
 * Reparte la notificación del aviso entre los docentes de su alcance.
 *
 * No lanza: que un aviso no se pueda repartir no puede deshacer su publicación,
 * que ya ocurrió y es lo que de verdad importa. El fallo se registra.
 */
export async function notificarAviso(
  aviso: AvisoNotificable,
  ahora = new Date(),
): Promise<ResultadoReparto> {
  // Un aviso con fecha futura todavía no existe para nadie. Notificarlo ahora
  // adelantaría su contenido antes de que sea visible en la lista.
  if (aviso.publicadoEn > ahora) {
    return { notificados: 0, omitidos: 0, motivo: 'programado' };
  }
  if (aviso.expiraEn && aviso.expiraEn <= ahora) {
    return { notificados: 0, omitidos: 0, motivo: 'caducado' };
  }

  const docentes = await ProfessorModel.find(docentesEnAlcance(aviso))
    .select('userId')
    .lean();

  const prioridad = PRIORIDAD_POR_TIPO[aviso.tipo] ?? 'INFO';
  const resumen = resumirCuerpo(aviso.cuerpo);

  let notificados = 0;
  let omitidos = 0;

  for (const docente of docentes) {
    const userId = String(docente.userId);
    // Quien lo escribió no necesita que se lo cuenten.
    if (aviso.autorId && userId === String(aviso.autorId)) continue;

    try {
      const resultado = await crearNotificacion({
        userId,
        title: aviso.titulo,
        message: resumen,
        type: 'AVISO',
        priority: prioridad,
        // La identidad del hecho es el aviso, no el envío: editarlo y volver a
        // repartirlo no debe dejar dos campanas del mismo aviso a la misma
        // persona.
        dedupeKey: `aviso:${aviso.id}`,
        link: '/avisos',
        metadata: { announcementId: aviso.id, tipo: aviso.tipo },
      });
      if (resultado.creada) notificados += 1;
      else omitidos += 1;
    } catch (error) {
      omitidos += 1;
      console.error(`[avisos] no se pudo notificar a ${userId}:`, error);
    }
  }

  return { notificados, omitidos, motivo: null };
}

export type ResultadoPendientes = {
  avisos: number;
  notificados: number;
};

/**
 * Reparte los avisos programados a los que ya les llegó su fecha.
 *
 * Un aviso escrito el lunes para publicarse el viernes no puede notificarse al
 * crearlo: adelantaría justo lo que programar la publicación intenta retrasar.
 * Sin algo que lo recoja el viernes, la campana no sonaba nunca y el aviso solo
 * aparecía a quien entrara a la pantalla por su cuenta.
 *
 * La marca se pone ANTES de repartir y de forma condicional. Si dos instancias
 * del backend corren la tarea a la vez, la escritura condicional solo la gana
 * una: la otra no encuentra el documento y no reparte nada. Sin eso, un aviso a
 * toda la institución llegaría por duplicado.
 */
export async function repartirAvisosPendientes(ahora = new Date()): Promise<ResultadoPendientes> {
  const pendientes = await AnnouncementModel.find({
    deletedAt: null,
    notificadoEn: null,
    publicadoEn: { $lte: ahora },
    $or: [{ expiraEn: null }, { expiraEn: { $gt: ahora } }],
  })
    .select('titulo cuerpo tipo autorId sedes facultades programas publicadoEn expiraEn')
    .limit(50)
    .lean();

  let notificados = 0;
  let avisos = 0;

  for (const documento of pendientes) {
    const reclamado = await AnnouncementModel.findOneAndUpdate(
      { _id: documento._id, notificadoEn: null },
      { $set: { notificadoEn: ahora } },
    ).lean();
    if (!reclamado) continue;

    try {
      const resultado = await notificarAviso(
        {
          id: String(documento._id),
          titulo: String(documento.titulo ?? ''),
          cuerpo: String(documento.cuerpo ?? ''),
          tipo: String(documento.tipo ?? 'INFORMATIVO'),
          autorId: documento.autorId ? String(documento.autorId) : null,
          sedes: (documento.sedes ?? []).map(String),
          facultades: (documento.facultades ?? []).map(String),
          programas: (documento.programas ?? []).map(String),
          publicadoEn: new Date(documento.publicadoEn as unknown as string),
          expiraEn: documento.expiraEn ? new Date(documento.expiraEn as unknown as string) : null,
        },
        ahora,
      );
      avisos += 1;
      notificados += resultado.notificados;
    } catch (error) {
      // La marca se queda puesta. Reintentar el reparto entero arriesga
      // duplicar a quien ya lo recibió, y el aviso sigue visible en la lista:
      // se pierde la campana, no el aviso.
      console.error(`[avisos] fallo al repartir ${String(documento._id)}:`, error);
    }
  }

  return { avisos, notificados };
}
