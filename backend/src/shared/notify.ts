/**
 * Punto único de creación de notificaciones.
 *
 * Antes cada servicio hacía su propio `NotificationModel.create()` y su propio
 * `emitSync`, lo que dejaba tres cosas sin dueño: el control de duplicados, las
 * preferencias del usuario y el envío al teléfono. Aquí las tres pasan una sola
 * vez, en este orden:
 *
 *   1. ¿La quiere? → preferencias por categoría.
 *   2. ¿Ya existe? → `dedupeKey` contra el índice único (userId, dedupeKey).
 *   3. Guardar, avisar por socket, y solo entonces empujar al teléfono.
 *
 * El orden importa: el push se manda DESPUÉS de haber escrito, porque un aviso
 * en el teléfono que abre una pantalla donde no hay nada es peor que no avisar.
 */
import { NotificationModel } from '../models/notification.model.js';
import { DeviceModel } from '../models/device.model.js';
import {
  NotificationPreferenceModel,
  PREFERENCIAS_POR_DEFECTO,
  type PreferenciasResueltas,
} from '../models/notification-preference.model.js';
import { emitToUser } from './socket.js';
import { enviarPush } from './push.js';
import { env } from './env.js';
import { dentroDeFranja, diaLocal, minutoDelDiaLocal } from '../domains/agenda/agenda.service.js';

export type NotificationType =
  | 'CLASS'
  | 'GRADE'
  | 'RISK'
  | 'ATTENDANCE'
  | 'ACTIVITY'
  | 'EXAM'
  | 'DEADLINE'
  | 'EVENT'
  | 'REMINDER'
  | 'SCHEDULE'
  | 'SISTEMA'
  | 'AVISO';

export type Prioridad = 'URGENT' | 'IMPORTANT' | 'INFO' | 'SYSTEM';

export type CategoriaPreferencia = keyof Pick<
  PreferenciasResueltas,
  | 'clases'
  | 'evaluaciones'
  | 'asistencia'
  | 'riesgo'
  | 'intervenciones'
  | 'eventos'
  | 'recordatorios'
  | 'sincronizacion'
  | 'sistema'
>;

/** Qué interruptor de la pantalla de preferencias gobierna cada tipo. */
const CATEGORIA_POR_TIPO: Record<NotificationType, CategoriaPreferencia> = {
  CLASS: 'clases',
  SCHEDULE: 'clases',
  EXAM: 'evaluaciones',
  DEADLINE: 'evaluaciones',
  GRADE: 'evaluaciones',
  ATTENDANCE: 'asistencia',
  RISK: 'riesgo',
  ACTIVITY: 'eventos',
  EVENT: 'eventos',
  REMINDER: 'recordatorios',
  SISTEMA: 'sistema',
  // Los avisos institucionales van por «sistema» y no por una categoría propia
  // para no obligar a un interruptor nuevo en las dos aplicaciones. Tiene un
  // coste que conviene conocer: quien apague «sistema» para silenciar los
  // avisos de versión nueva deja de recibir también los de la administración.
  // Lo que no se pierde nunca es un aviso URGENTE, porque la prioridad urgente
  // se salta las preferencias.
  AVISO: 'sistema',
};

export function categoriaDeTipo(tipo: NotificationType): CategoriaPreferencia {
  return CATEGORIA_POR_TIPO[tipo] ?? 'sistema';
}

export type EntradaNotificacion = {
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  priority?: Prioridad;
  /** Identidad del hecho. Sin ella no hay control de duplicados. */
  dedupeKey?: string;
  /** Ruta interna a la que lleva al tocarla. */
  link?: string;
  metadata?: Record<string, unknown>;
  /** Fuerza el envío al teléfono aunque la categoría sea silenciosa. */
  forzarPush?: boolean;
  /** Salta el envío al teléfono (el cliente ya programó su alarma local). */
  omitirPush?: boolean;
  /**
   * Si la notificación ya existía por `dedupeKey`, actualiza título y mensaje.
   * Lo usa el escáner de riesgo: la alerta es la misma, los motivos cambian.
   */
  actualizarSiExiste?: boolean;
};

export type ResultadoNotificacion = {
  creada: boolean;
  omitida: 'preferencia' | 'duplicada' | null;
  id: string | null;
  push: { enviados: number; fallidos: number } | null;
};

// ── Preferencias ─────────────────────────────────────────────────────────────

/**
 * Preferencias del usuario, creándolas con los valores por defecto la primera
 * vez. Se hace con `upsert` en vez de "leer y si no hay, crear": dos peticiones
 * simultáneas del mismo usuario crearían dos documentos y el índice único
 * rechazaría una de ellas con un 409 que el docente no puede entender.
 */
export async function obtenerPreferencias(userId: string): Promise<PreferenciasResueltas> {
  const documento = await NotificationPreferenceModel.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  return normalizarPreferencias(documento as Record<string, unknown> | null);
}

export function normalizarPreferencias(documento: Record<string, unknown> | null): PreferenciasResueltas {
  if (!documento) return { ...PREFERENCIAS_POR_DEFECTO };
  const leerBool = (clave: keyof PreferenciasResueltas, porDefecto: boolean) =>
    typeof documento[clave] === 'boolean' ? (documento[clave] as boolean) : porDefecto;

  const quiet = (documento.quietHours ?? {}) as { enabled?: boolean; start?: string; end?: string };
  const leads = Array.isArray(documento.classLeadMinutes)
    ? (documento.classLeadMinutes as unknown[]).map(Number).filter(n => Number.isFinite(n) && n >= 0)
    : PREFERENCIAS_POR_DEFECTO.classLeadMinutes;

  return {
    clases: leerBool('clases', true),
    evaluaciones: leerBool('evaluaciones', true),
    asistencia: leerBool('asistencia', true),
    riesgo: leerBool('riesgo', true),
    intervenciones: leerBool('intervenciones', true),
    eventos: leerBool('eventos', true),
    recordatorios: leerBool('recordatorios', true),
    sincronizacion: leerBool('sincronizacion', false),
    sistema: leerBool('sistema', true),
    inApp: leerBool('inApp', true),
    push: leerBool('push', true),
    email: leerBool('email', false),
    classLeadMinutes: leads.length ? [...new Set(leads)].sort((a, b) => b - a) : [],
    quietHours: {
      enabled: quiet.enabled === true,
      start: typeof quiet.start === 'string' ? quiet.start : '21:00',
      end: typeof quiet.end === 'string' ? quiet.end : '06:00',
    },
    urgentBypassesQuietHours: leerBool('urgentBypassesQuietHours', true),
  };
}

/**
 * ¿Estamos dentro de la franja de silencio?
 *
 * La franja cruza la medianoche casi siempre (21:00–06:00), así que no basta
 * con `inicio <= ahora < fin`: cuando el fin es menor que el inicio, la
 * condición se invierte.
 */
export function enHorasDeSilencio(
  preferencias: PreferenciasResueltas,
  ahora: Date,
  offsetMinutos = env.CAMPUS_UTC_OFFSET_MIN,
): boolean {
  if (!preferencias.quietHours.enabled) return false;
  return dentroDeFranja(
    preferencias.quietHours.start,
    preferencias.quietHours.end,
    minutoDelDiaLocal(ahora, offsetMinutos),
  );
}

// ── Creación ─────────────────────────────────────────────────────────────────

/**
 * Crea una notificación respetando preferencias y sin duplicar.
 *
 * Devuelve siempre un resultado, nunca lanza por "no procedía": que el usuario
 * haya apagado una categoría no es un error del llamador.
 */
export async function crearNotificacion(entrada: EntradaNotificacion): Promise<ResultadoNotificacion> {
  const preferencias = await obtenerPreferencias(entrada.userId);
  const categoria = categoriaDeTipo(entrada.type);
  const prioridad = entrada.priority ?? 'INFO';

  // Las urgentes se guardan siempre: apagar "riesgo académico" no puede
  // silenciar que un estudiante entró en riesgo crítico sin que quede rastro.
  if (!preferencias[categoria] && prioridad !== 'URGENT') {
    return { creada: false, omitida: 'preferencia', id: null, push: null };
  }
  if (!preferencias.inApp && prioridad !== 'URGENT') {
    return { creada: false, omitida: 'preferencia', id: null, push: null };
  }

  const base = {
    userId: entrada.userId,
    title: entrada.title,
    message: entrada.message,
    type: entrada.type,
    priority: prioridad,
    link: entrada.link ?? '',
    metadata: entrada.metadata ?? {},
    channel: 'IN_APP' as const,
  };

  let documentoId: string;
  let esNueva: boolean;

  if (entrada.dedupeKey) {
    const previa = await NotificationModel.findOne({
      userId: entrada.userId,
      dedupeKey: entrada.dedupeKey,
    })
      .select('_id')
      .lean();

    if (previa && !entrada.actualizarSiExiste) {
      return { creada: false, omitida: 'duplicada', id: String(previa._id), push: null };
    }

    const documento = await NotificationModel.findOneAndUpdate(
      { userId: entrada.userId, dedupeKey: entrada.dedupeKey },
      {
        $set: previa ? { title: base.title, message: base.message, metadata: base.metadata } : base,
        $setOnInsert: previa ? {} : { dedupeKey: entrada.dedupeKey },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    documentoId = String(documento._id);
    esNueva = !previa;
  } else {
    const documento = await NotificationModel.create(base);
    documentoId = String(documento._id);
    esNueva = true;
  }

  const carga = {
    _id: documentoId,
    title: base.title,
    message: base.message,
    type: base.type,
    priority: prioridad,
    link: base.link,
    metadata: base.metadata,
    createdAt: new Date().toISOString(),
  };

  // Dos eventos con propósitos distintos, a la misma sala privada del usuario:
  // `notification:new` es la campana (el cliente puede sonar o mostrar un
  // aviso nativo) y `sync:update` es lo que invalida la caché de la bandeja.
  emitToUser(entrada.userId, 'notification:new', carga);
  emitToUser(entrada.userId, 'sync:update', { entity: 'notification', action: 'create', id: documentoId });

  // Solo lo nuevo suena. Una alerta de riesgo que se reescribe cada escaneo no
  // debe volver a vibrar en el teléfono cada vez.
  if (!esNueva || entrada.omitirPush) {
    return { creada: esNueva, omitida: null, id: documentoId, push: null };
  }

  const silencio = enHorasDeSilencio(preferencias, new Date());
  const atraviesaSilencio = prioridad === 'URGENT' && preferencias.urgentBypassesQuietHours;
  const puedeEmpujar = (preferencias.push || entrada.forzarPush) && (!silencio || atraviesaSilencio);
  if (!puedeEmpujar) {
    return { creada: true, omitida: null, id: documentoId, push: null };
  }

  const push = await empujarAUsuario(entrada.userId, {
    title: base.title,
    body: base.message,
    data: {
      notificationId: documentoId,
      type: base.type,
      priority: prioridad,
      link: base.link,
      ...Object.fromEntries(
        Object.entries(base.metadata)
          .filter(([, valor]) => valor !== null && valor !== undefined)
          .map(([clave, valor]) => [clave, String(valor)]),
      ),
    },
    collapseKey: entrada.dedupeKey,
    priority: prioridad === 'URGENT' || prioridad === 'IMPORTANT' ? 'high' : 'normal',
    androidChannelId: canalAndroid(prioridad),
  });

  return { creada: true, omitida: null, id: documentoId, push: { enviados: push.enviados, fallidos: push.fallidos } };
}

/** Canal de Android por prioridad: cada uno con su sonido y su importancia. */
export function canalAndroid(prioridad: Prioridad): string {
  switch (prioridad) {
    case 'URGENT':
      return 'uts_urgente';
    case 'IMPORTANT':
      return 'uts_importante';
    case 'SYSTEM':
      return 'uts_sistema';
    default:
      return 'uts_informativa';
  }
}

/**
 * Empuja a todos los dispositivos del usuario y limpia los tokens muertos.
 *
 * Los dispositivos que programan sus propios recordatorios de clase quedan
 * fuera cuando el aviso es de una clase: recibirían el mismo dos veces.
 */
export async function empujarAUsuario(
  userId: string,
  payload: Parameters<typeof enviarPush>[1] & { data?: Record<string, string> },
) {
  const esDeClase = payload.data?.type === 'CLASS';
  const dispositivos = await DeviceModel.find({
    userId,
    deletedAt: null,
    ...(esDeClase ? { localClassReminders: { $ne: true } } : {}),
  })
    .select('token')
    .lean();

  if (dispositivos.length === 0) return { enviados: 0, fallidos: 0, tokensInvalidos: [] as string[] };

  const resultado = await enviarPush(
    dispositivos.map(dispositivo => String(dispositivo.token)),
    payload,
  );

  if (resultado.tokensInvalidos.length > 0) {
    // Baja lógica: el histórico de qué dispositivo tuvo el token sigue siendo
    // útil para diagnosticar, y el índice único es sobre `token`, así que un
    // registro nuevo con el mismo token chocaría. Se borra de verdad.
    await DeviceModel.deleteMany({ token: { $in: resultado.tokensInvalidos } });
  }

  return resultado;
}

/** Fecha local del campus para un instante, útil al construir claves de dedupe. */
export function fechaCampus(instante: Date): string {
  return diaLocal(instante, env.CAMPUS_UTC_OFFSET_MIN).fecha;
}
