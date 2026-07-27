import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'core/services/auth_controller.dart';
import 'core/services/realtime_service.dart';
import 'core/widgets/app_scaffold.dart';
import 'features/ai/ai_page.dart';
import 'features/auth/login_page.dart';
import 'features/auth/recovery_page.dart';
import 'features/dashboard/dashboard_page.dart';
import 'features/notifications/notifications_page.dart';
import 'features/attendance/attendance_page.dart';
import 'features/reports/reports_page.dart';
import 'features/schedule/schedule_page.dart';
import 'features/settings/settings_page.dart';
import 'features/students/students_page.dart';
import 'features/subjects/subjects_page.dart';
import 'features/grades/grades_page.dart';
import 'features/dashboard/dashboard_page.dart' show dashboardProvider;
import 'features/schedule/schedule_page.dart' show scheduleProvider;
import 'features/students/students_page.dart' show studentsProvider;
import 'features/subjects/subjects_page.dart' show subjectsProvider;

final router = GoRouter(
  initialLocation: '/login',
  routes: [
    GoRoute(path: '/login', builder: (_, __) => const LoginPage()),
    GoRoute(path: '/recovery', builder: (_, __) => const RecoveryPage()),
    ShellRoute(
      builder: (_, __, child) => AppScaffold(child: child),
      routes: [
        GoRoute(path: '/', builder: (_, __) => const DashboardPage()),
        GoRoute(path: '/students', builder: (_, __) => const StudentsPage()),
        GoRoute(path: '/subjects', builder: (_, __) => const SubjectsPage()),
        GoRoute(path: '/grades', builder: (_, __) => const GradesPage()),
        GoRoute(path: '/attendance', builder: (_, __) => const AttendancePage()),
        GoRoute(path: '/schedule', builder: (_, __) => const SchedulePage()),
        GoRoute(path: '/ai', builder: (_, __) => const AiPage()),
        GoRoute(path: '/reports', builder: (_, __) => const ReportsPage()),
        GoRoute(path: '/notifications', builder: (_, __) => const NotificationsPage()),
        GoRoute(path: '/settings', builder: (_, __) => const SettingsPage()),
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
    ref.listen(realtimeEventsProvider, (previous, next) {
      next.whenData((event) {
        if (event['type'] == 'sync:update') {
          ref.invalidate(dashboardProvider);
          ref.invalidate(studentsProvider);
          ref.invalidate(subjectsProvider);
          ref.invalidate(scheduleProvider);
          ref.invalidate(consolidatedGradesProvider);
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
      title: 'UTS Académico',
      theme: ThemeData(
        colorSchemeSeed: const Color(0xFF0B5D4D),
        useMaterial3: true,
        brightness: Brightness.light,
      ),
      darkTheme: ThemeData(
        colorSchemeSeed: const Color(0xFF0B5D4D),
        useMaterial3: true,
        brightness: Brightness.dark,
      ),
      routerConfig: router,
    );
  }
}
