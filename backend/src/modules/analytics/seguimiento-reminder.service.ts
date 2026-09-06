/**
 * Recordatorio de seguimientos abiertos.
 *
 * Abrir un seguimiento es un compromiso —«voy a llamar», «lo mando a
 * tutoría»— y un compromiso sin recordatorio se pierde entre semana y semana.
 * Un día después de abrirlo, si sigue EN_CURSO, se le avisa al docente que
 * registre cómo fue: bien, negado, o cómo va el progreso.
 *
 * El aviso se envía UNA vez por episodio (`recordatorioEnviado`), y además el
 * `dedupeKey` lo fija por identidad del hecho: aunque dos instancias corran el
 * escaneo, la campana no suena dos veces.
 */
import { RiskFeedbackModel } from '../../models/risk-feedback.model.js';
import { StudentModel } from '../../models/student.model.js';
import { crearNotificacion } from '../../shared/notify.js';

const UN_DIA_MS = 24 * 60 * 60 * 1000;

export async function recordarSeguimientosPendientes(): Promise<{ recordatorios: number }> {
  const limite = new Date(Date.now() - UN_DIA_MS);

  const casos = await RiskFeedbackModel.find({
    seguimientos: {
      $elemMatch: {
        estado: 'EN_CURSO',
        recordatorioEnviado: false,
        creadoEn: { $lt: limite },
      },
    },
  }).lean();

  /**
   * Los nombres, en una consulta y no en una por caso.
   *
   * Esto era un `StudentModel.findById` dentro del bucle: con doscientos casos
   * pendientes eran doscientos viajes encadenados a Atlas para leer doscientos
   * nombres que caben en una sola consulta. Es el mismo patrón que
   * `attendance-patterns.service.ts` ya aplicaba —«Nombres en dos consultas, no
   * en dos por caso»— y que aquí faltaba.
   */
  const idsEstudiante = [...new Set(casos.map(caso => String(caso.studentId)).filter(Boolean))];
  const estudiantes = idsEstudiante.length
    ? await StudentModel.find({ _id: { $in: idsEstudiante } }).select('fullName').lean()
    : [];
  const nombrePorId = new Map(estudiantes.map(e => [String(e._id), String(e.fullName ?? '')]));

  /** Marcas de «recordatorio ofrecido», acumuladas para escribirlas de una vez. */
  const marcas: Parameters<typeof RiskFeedbackModel.bulkWrite>[0] = [];

  let enviados = 0;
  for (const caso of casos) {
    if (!caso.teacherId) continue;
    const pendientes = (caso.seguimientos ?? []).filter(
      episodio =>
        episodio.estado === 'EN_CURSO' &&
        !episodio.recordatorioEnviado &&
        episodio.creadoEn &&
        new Date(episodio.creadoEn) < limite,
    );
    if (pendientes.length === 0) continue;

    const nombre = nombrePorId.get(String(caso.studentId)) || 'el estudiante';

    for (const episodio of pendientes) {
      const resultado = await crearNotificacion({
        userId: String(caso.teacherId),
        title: 'Actualiza el seguimiento',
        message:
          `¿Cómo fue el acompañamiento de ${nombre}? ` +
          'Registra si fue bien, si fue negado, o evalúa el progreso.',
        type: 'RISK',
        dedupeKey: `seguimiento:${String(episodio._id)}:recordatorio`,
        link: '/riesgo',
      });
      // La marca se pone aunque la notificación se haya omitido por
      // preferencias: el recordatorio se OFRECIÓ; insistir cada pasada sería
      // desobedecer la preferencia del docente.
      //
      // Se acumula en vez de escribirse aquí: era una escritura por episodio
      // dentro de un bucle anidado, o sea el mismo N+1 que los nombres pero en
      // el lado de la escritura, que es el caro.
      marcas.push({
        updateOne: {
          filter: { _id: caso._id, 'seguimientos._id': episodio._id },
          update: { $set: { 'seguimientos.$.recordatorioEnviado': true } },
        },
      });
      if (resultado.creada) enviados += 1;
    }
  }

  // Una escritura para todas las marcas. `ordered: false` porque son
  // independientes: que una falle no debe impedir las demás.
  if (marcas.length > 0) await RiskFeedbackModel.bulkWrite(marcas, { ordered: false });

  return { recordatorios: enviados };
}
