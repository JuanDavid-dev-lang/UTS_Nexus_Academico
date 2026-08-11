import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.routes.js';
import { studentRouter } from '../modules/students/student.routes.js';
import { subjectRouter } from '../modules/subjects/subject.routes.js';
import { groupRouter } from '../modules/groups/group.routes.js';
import { analyticsRouter } from '../modules/analytics/analytics.routes.js';
import { aiRouter } from '../modules/ai/ai.routes.js';
import { gradeRouter } from '../modules/grades/grade.routes.js';
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

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/students', studentRouter);
apiRouter.use('/subjects', subjectRouter);
apiRouter.use('/groups', groupRouter);
apiRouter.use('/analytics', analyticsRouter);
apiRouter.use('/ai', aiRouter);
apiRouter.use('/grades', gradeRouter);
apiRouter.use('/enrollments', enrollmentRouter);
// El escáner va antes: sus rutas son más específicas y si `attendanceRouter`
// llegara a definir un comodín, se las tragaría.
// El registro va sin auth en sus dos primeras rutas; el propio router aplica
// el middleware a partir de la parte de administracion.
apiRouter.use('/registro', registrationRouter);
apiRouter.use('/avisos', announcementRouter);
apiRouter.use('/attendance', attendanceScanRouter);
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
