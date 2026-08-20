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

    const estudiante = await StudentModel.findById(caso.studentId).select('fullName').lean();
    const nombre = estudiante?.fullName ?? 'el estudiante';

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
      await RiskFeedbackModel.updateOne(
        { _id: caso._id, 'seguimientos._id': episodio._id },
        { $set: { 'seguimientos.$.recordatorioEnviado': true } },
      );
      if (resultado.creada) enviados += 1;
    }
  }

  return { recordatorios: enviados };
}
