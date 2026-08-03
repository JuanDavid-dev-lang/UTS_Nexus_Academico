import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'core/data/providers.dart';
import 'core/services/auth_controller.dart';
import 'core/services/realtime_service.dart';
import 'core/theme/app_theme.dart';
import 'core/theme/theme_controller.dart';
import 'core/widgets/app_scaffold.dart';
import 'features/ai/ai_page.dart';
import 'features/auth/login_page.dart';
import 'features/auth/recovery_page.dart';
import 'features/dashboard/dashboard_page.dart';
import 'features/notifications/notifications_page.dart';
import 'features/profile/profile_page.dart';
import 'features/attendance/attendance_page.dart';
import 'features/attendance/scan_sheet_page.dart';
import 'features/announcements/announcements_page.dart';
import 'features/auth/register_page.dart';
import 'features/tutorial/tutorial_page.dart';
import 'features/reports/reports_page.dart';
import 'features/schedule/schedule_page.dart';
import 'features/settings/settings_page.dart';
import 'features/students/students_page.dart';
import 'features/subjects/subjects_page.dart';
import 'features/subjects/subject_detail_page.dart';
import 'features/grades/grades_page.dart';

final router = GoRouter(
  initialLocation: '/login',
  routes: [
    GoRoute(path: '/login', builder: (_, __) => const LoginPage()),
    GoRoute(path: '/recovery', builder: (_, __) => const RecoveryPage()),
    // Fuera del shell autenticado: quien se registra todavía no tiene sesión,
    // y el tutorial se abre en pantalla completa sobre cualquier estado.
    GoRoute(path: '/registro', builder: (_, __) => const RegisterPage()),
    GoRoute(path: '/tutorial', builder: (_, __) => const TutorialPage()),
    ShellRoute(
      builder: (_, __, child) => AppScaffold(child: child),
      routes: [
        GoRoute(path: '/', builder: (_, __) => const DashboardPage()),
        GoRoute(path: '/students', builder: (_, __) => const StudentsPage()),
        GoRoute(
          path: '/subjects',
          builder: (_, __) => const SubjectsPage(),
          routes: [
            // Los estudiantes cuelgan de su materia: es como trabaja un docente
            // ("mis estudiantes de Cálculo I"), y la ruta lo refleja.
            GoRoute(
              path: ':subjectId',
              builder: (_, state) => SubjectDetailPage(
                subjectId: state.pathParameters['subjectId']!,
              ),
            ),
          ],
        ),
        GoRoute(path: '/grades', builder: (_, __) => const GradesPage()),
        GoRoute(path: '/attendance', builder: (_, __) => const AttendancePage()),
        GoRoute(path: '/attendance/scan', builder: (_, __) => const ScanSheetPage()),
        GoRoute(path: '/avisos', builder: (_, __) => const AnnouncementsPage()),
        GoRoute(path: '/schedule', builder: (_, __) => const SchedulePage()),
        GoRoute(path: '/ai', builder: (_, __) => const AiPage()),
        GoRoute(path: '/reports', builder: (_, __) => const ReportsPage()),
        GoRoute(path: '/notifications', builder: (_, __) => const NotificationsPage()),
        GoRoute(path: '/settings', builder: (_, __) => const SettingsPage()),
        GoRoute(path: '/profile', builder: (_, __) => const ProfilePage()),
      ],
    ),
  ],
);

class UtsApp extends ConsumerStatefulWidget {
  const UtsApp({super.key});

  @override
  ConsumerState<UtsApp> createState() => _UtsAppState();
}

class _UtsAppState extends ConsumerState<UtsApp> {
  @override
  Widget build(BuildContext context) {
    // El servicio de tiempo real ya filtra por el evento `sync:update` y emite
    // su payload, que es {entity, action, id}. La versión anterior comprobaba
    // `event['type'] == 'sync:update'`, una clave que ese payload nunca tiene,
    // así que la condición jamás se cumplía y nada se refrescaba.
    ref.listen(realtimeEventsProvider, (previous, next) {
      next.whenData((event) {
        final entity = event['entity'] as String?;
        if (entity == null) return;

        // Cada entidad invalida solo lo que realmente depende de ella; recargar
        // todo en cada evento desperdicia red y hace parpadear pantallas
        // que no cambiaron.
        switch (entity) {
          case 'student':
            ref.invalidate(studentsProvider);
            ref.invalidate(filteredStudentsProvider);
            ref.invalidate(dashboardProvider);
          case 'subject':
            ref.invalidate(subjectsProvider);
            ref.invalidate(dashboardProvider);
          case 'grade':
            ref.invalidate(consolidatedGradesProvider);
            ref.invalidate(dashboardProvider);
          case 'attendance':
            ref.invalidate(dashboardProvider);
          case 'schedule':
            ref.invalidate(scheduleProvider);
          case 'enrollment':
            ref.invalidate(studentsProvider);
            // La matrícula es justo lo que define la lista por materia.
            ref.invalidate(filteredStudentsProvider);
            ref.invalidate(subjectRosterProvider);
            ref.invalidate(dashboardProvider);
          default:
            ref.invalidate(dashboardProvider);
        }
      });
    });

    ref.listen<AuthState>(authControllerProvider, (previous, next) {
      if (next.loading) return;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        if (next.isAuthenticated) {
          router.go('/');
        } else {
          router.go('/login');
        }
      });
    });

    final auth = ref.watch(authControllerProvider);
    if (auth.loading) {
      return const MaterialApp(
        home: Scaffold(body: Center(child: CircularProgressIndicator())),
      );
    }

    return MaterialApp.router(
      debugShowCheckedModeBanner: false,
      title: 'UTS Nexus Académico',
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: ref.watch(themeModeProvider),
      routerConfig: router,
    );
  }
}
