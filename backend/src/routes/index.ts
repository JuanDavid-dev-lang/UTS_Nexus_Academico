import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.routes.js';
import { studentRouter } from '../modules/students/student.routes.js';
import { subjectRouter } from '../modules/subjects/subject.routes.js';
import { groupRouter } from '../modules/groups/group.routes.js';
import { analyticsRouter } from '../modules/analytics/analytics.routes.js';
import { aiRouter } from '../modules/ai/ai.routes.js';
import { gradeRouter } from '../modules/grades/grade.routes.js';
import { gradeScanRouter } from '../modules/grades/grade-scan.routes.js';
import { enrollmentRouter } from '../modules/enrollment/enrollment.routes.js';
import { attendanceRouter } from '../modules/attendance/attendance.routes.js';
import { announcementRouter } from '../modules/announcements/announcement.routes.js';
import { registrationRouter } from '../modules/registration/registration.routes.js';
import { attendanceScanRouter } from '../modules/attendance/attendance-scan.routes.js';
import { activityRouter } from '../modules/activities/activity.routes.js';
import { notificationRouter } from '../modules/notifications/notification.routes.js';
import { scheduleRouter } from '../modules/schedules/schedule.routes.js';
import { agendaRouter } from '../modules/agenda/agenda.routes.js';
import { reportsRouter } from '../modules/reports/reports.routes.js';
import { uploadRouter } from '../modules/uploads/upload.routes.js';
import { professorRouter } from '../modules/professors/professor.routes.js';
import { configRouter } from '../modules/settings/config.routes.js';
import { downloadRouter } from '../modules/downloads/download.routes.js';
import { mlRouter } from '../modules/ml/ml.routes.js';
import { feedbackRouter } from '../modules/feedback/feedback.routes.js';
import { thesisRouter } from '../modules/thesis/thesis.routes.js';
import { periodRouter } from '../modules/periods/period.routes.js';
import { attendancePatternRouter } from '../modules/attendance/attendance-patterns.routes.js';
import { auditRouter } from '../modules/audit/audit.routes.js';
import { healthRouter } from '../modules/health/health.routes.js';
import { timelineRouter } from '../modules/timeline/timeline.routes.js';
import { telemetryRouter } from '../modules/telemetry/telemetry.routes.js';
import { coordinationRouter } from '../modules/coordination/coordination.routes.js';
import { userRouter } from '../modules/users/user.routes.js';
import { institutionRouter } from '../modules/institutions/institution.routes.js';
import { identificar, bloquearSoloLectura } from '../middlewares/auth.js';
import { cargarAlcance } from '../middlewares/scope.js';

export const apiRouter = Router();

/**
 * Tres pasos antes de cualquier módulo, en este orden y no en otro:
 *
 * 1. `identificar` — dice quién llama. No corta nada; los módulos lo repiten
 *    porque también se montan sueltos en las pruebas.
 * 2. `bloquearSoloLectura` — cierra la escritura a los perfiles de consulta
 *    (secretaría). Va aquí, y no en cada módulo, porque marcar ruta por ruta
 *    cuál escribe deja abierta la que se añada mañana.
 * 3. `cargarAlcance` — deja en `req.alcance` los programas de coordinación o
 *    secretaría. Global por la misma razón: una ruta que se olvidara de pedirlo
 *    consultaría sin acotar y devolvería datos de otra carrera con un 200.
 */
apiRouter.use(identificar);
apiRouter.use(bloquearSoloLectura);
apiRouter.use(cargarAlcance);

apiRouter.use('/auth', authRouter);
// El historial va antes que el router de estudiantes: `/:id/historial` es más
// específico que el `/:id` del listado y, si fuera después, no se alcanzaría.
apiRouter.use('/students', timelineRouter);
apiRouter.use('/students', studentRouter);
apiRouter.use('/subjects', subjectRouter);
apiRouter.use('/groups', groupRouter);
apiRouter.use('/analytics', analyticsRouter);
apiRouter.use('/ai', aiRouter);
// El importador va antes por la misma razón que el escáner de asistencia: sus
// rutas son más específicas.
apiRouter.use('/grades', gradeScanRouter);
apiRouter.use('/grades', gradeRouter);
apiRouter.use('/enrollments', enrollmentRouter);
// El escáner va antes: sus rutas son más específicas y si `attendanceRouter`
// llegara a definir un comodín, se las tragaría.
// El registro va sin auth en sus dos primeras rutas; el propio router aplica
// el middleware a partir de la parte de administracion.
apiRouter.use('/registro', registrationRouter);
apiRouter.use('/avisos', announcementRouter);
apiRouter.use('/attendance', attendanceScanRouter);
// Los casos de patrón van antes que el router general por la misma razón que
// el escáner: sus rutas son más específicas.
apiRouter.use('/attendance', attendancePatternRouter);
apiRouter.use('/attendance', attendanceRouter);
apiRouter.use('/activities', activityRouter);
apiRouter.use('/notifications', notificationRouter);
apiRouter.use('/schedules', scheduleRouter);
// La agenda LEE el horario y los eventos; no los sustituye. `/schedules` sigue
// siendo el único sitio donde se escribe una franja semanal.
apiRouter.use('/agenda', agendaRouter);
apiRouter.use('/reports', reportsRouter);
apiRouter.use('/uploads', uploadRouter);
apiRouter.use('/professors', professorRouter);
apiRouter.use('/configurations', configRouter);
// Sin `auth` delante: su GET lo consulta la página de descargas, que es un
// sitio estático en otro dominio y no tiene sesión con la que presentarse.
apiRouter.use('/descargas', downloadRouter);
apiRouter.use('/ml', mlRouter);
apiRouter.use('/feedback', feedbackRouter);
apiRouter.use('/trabajos-grado', thesisRouter);
// Ciclo de vida del semestre: quién lo cerró, cuándo, y la fotografía oficial.
apiRouter.use('/periods', periodRouter);
// Lectura de la auditoría (solo ADMIN) y salud profunda (ADMIN/COORDINATOR).
// `/health` a secas sigue siendo la sonda pública y mínima de `app.ts`.
apiRouter.use('/audit', auditRouter);
apiRouter.use('/system/health', healthRouter);
// Telemetría: el alta la hace cualquier sesión, la lectura solo administración.
apiRouter.use('/telemetry', telemetryRouter);
// Vista de coordinación: materias, docentes y grupos de los programas a cargo,
// con sus exportables. Secretaría entra a lo mismo, en solo lectura.
apiRouter.use('/coordinacion', coordinationRouter);
// Alta y gestión del personal: quién es qué rol y de qué programas responde.
apiRouter.use('/usuarios', userRouter);
// Perfiles institucionales: universidades creadas desde el panel, sus cortes
// y ponderados, y qué docente pertenece a cuál. Solo ADMIN escribe.
apiRouter.use('/instituciones', institutionRouter);
