import { lazy } from 'react';
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { AppShell } from '@/shared/layouts/app-shell';
import { useSession } from '@/state/session.store';
import { BootScreen } from '@/app/boot-screen';

/**
 * Routes.
 *
 * Every page is code-split. The v1 client built all nine screens up front, which
 * is why it took seconds to open; here only the shell and the current route are
 * ever downloaded and executed.
 */
const LoginPage = lazy(() => import('@/features/auth/login-page'));
const AnnouncementsPage = lazy(() => import('@/features/announcements/announcements-page'));
const RegisterPage = lazy(() => import('@/features/auth/register-page'));
const RecoveryPage = lazy(() => import('@/features/auth/recovery-page'));
const DashboardPage = lazy(() => import('@/features/dashboard/dashboard-page'));
const AgendaPage = lazy(() => import('@/features/agenda/agenda-page'));
const StudentsPage = lazy(() => import('@/features/students/students-page'));
const SubjectsPage = lazy(() => import('@/features/subjects/subjects-page'));
const GradesPage = lazy(() => import('@/features/grades/grades-page'));
const AttendancePage = lazy(() => import('@/features/attendance/attendance-page'));
const RiskPage = lazy(() => import('@/features/risk/risk-page'));
const AssistantPage = lazy(() => import('@/features/assistant/assistant-page'));
const ReportsPage = lazy(() => import('@/features/reports/reports-page'));
const NotificationsPage = lazy(() => import('@/features/notifications/notifications-page'));
const SettingsPage = lazy(() => import('@/features/settings/settings-page'));
const FeedbackPage = lazy(() => import('@/features/feedback/feedback-page'));
const ProfessorsPage = lazy(() => import('@/features/professors/professors-page'));
const ThesisFormatsPage = lazy(() => import('@/features/thesis/thesis-formats-page'));
const ActivitiesPage = lazy(() => import('@/features/activities/activities-page'));
const PeriodsPage = lazy(() => import('@/features/periods/periods-page'));
const AuditPage = lazy(() => import('@/features/audit/audit-page'));
const HealthPage = lazy(() => import('@/features/system/health-page'));

/** Blocks the app routes until the session is known to be valid. */
function RequireAuth() {
  const status = useSession((state) => state.status);

  if (status === 'booting') return <BootScreen />;
  if (status === 'anonymous') return <Navigate to="/login" replace />;
  return <Outlet />;
}

/** Keeps an authenticated user out of the login screen. */
function RedirectIfAuthenticated() {
  const status = useSession((state) => state.status);

  if (status === 'booting') return <BootScreen />;
  if (status === 'authenticated') return <Navigate to="/" replace />;
  return <Outlet />;
}

export const router = createBrowserRouter([
  {
    element: <RedirectIfAuthenticated />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/registro', element: <RegisterPage /> },
      { path: '/recuperar', element: <RecoveryPage /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/', element: <DashboardPage /> },
          { path: '/estudiantes', element: <StudentsPage /> },
          { path: '/materias', element: <SubjectsPage /> },
          { path: '/notas', element: <GradesPage /> },
          { path: '/asistencia', element: <AttendancePage /> },
          { path: '/agenda', element: <AgendaPage /> },
          { path: '/riesgo', element: <RiskPage /> },
          { path: '/asistente', element: <AssistantPage /> },
          { path: '/reportes', element: <ReportsPage /> },
          { path: '/avisos', element: <AnnouncementsPage /> },
          { path: '/sugerencias', element: <FeedbackPage /> },
          { path: '/docentes', element: <ProfessorsPage /> },
          { path: '/trabajos-grado', element: <ThesisFormatsPage /> },
          { path: '/actividades', element: <ActivitiesPage /> },
          { path: '/periodos', element: <PeriodsPage /> },
          { path: '/auditoria', element: <AuditPage /> },
          { path: '/estado-sistema', element: <HealthPage /> },
          { path: '/notificaciones', element: <NotificationsPage /> },
          { path: '/configuracion', element: <SettingsPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
