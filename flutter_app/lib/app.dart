import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'core/data/providers.dart';
import 'core/services/auth_controller.dart';
import 'core/services/realtime_service.dart';
import 'core/theme/app_theme.dart';
import 'core/theme/theme_controller.dart';
import 'core/widgets/app_scaffold.dart';
import 'core/widgets/update_prompt.dart';
import 'core/services/local_notifications_service.dart';
import 'core/services/push_service.dart';
import 'features/agenda/agenda_page.dart';
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
import 'features/feedback/feedback_page.dart';
import 'features/thesis/thesis_formats_page.dart';

/// Navigator raíz. Lo necesita [UpdateGate]: el `builder` de `MaterialApp` se
/// dibuja por encima del Navigator del router, así que desde su contexto no hay
/// ninguno al que pedirle un diálogo.
final rootNavigatorKey = GlobalKey<NavigatorState>();

final router = GoRouter(
  navigatorKey: rootNavigatorKey,
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
        GoRoute(path: '/sugerencias', builder: (_, __) => const FeedbackPage()),
        GoRoute(path: '/trabajos-grado', builder: (_, __) => const ThesisFormatsPage()),
        GoRoute(path: '/schedule', builder: (_, __) => const SchedulePage()),
        // `?item=` lo pone la notificación: al tocarla se abre esa clase, no la
        // agenda genérica. Sin eso, el aviso obliga a repetir a mano la
        // búsqueda que él mismo ya había hecho.
        GoRoute(
          path: '/agenda',
          builder: (_, state) => AgendaPage(itemDestacado: state.uri.queryParameters['item']),
        ),
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
  /// Evita que dos eventos seguidos disparen dos reprogramaciones solapadas.
  bool _reprogramando = false;

  @override
  void initState() {
    super.initState();

    // Al tocar una notificación —incluida la que abrió la app desde cero— se
    // navega a lo que apuntaba. `rutaPendiente` cubre el arranque en frío: en
    // ese momento el router todavía no existía.
    LocalNotificationsService.instance.onAbrirRuta = (ruta) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) router.go(ruta);
      });
    };

    final pendiente = LocalNotificationsService.instance.rutaPendiente;
    if (pendiente != null) {
      LocalNotificationsService.instance.rutaPendiente = null;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) router.go(pendiente);
      });
    }
  }

  /// Vuelve a programar las alarmas del teléfono con la agenda vigente.
  ///
  /// Se llama cuando cambia el horario, el calendario o las preferencias. Es
  /// idempotente —cancela y rehace—, así que llamarla de más no duplica nada;
  /// el candado solo evita el trabajo repetido.
  Future<void> _reprogramarRecordatorios() async {
    if (_reprogramando) return;
    _reprogramando = true;
    try {
      final agenda = await ref.read(agendaProximaProvider.future);
      final preferencias = await ref.read(notificationPrefsProvider.future);
      await LocalNotificationsService.instance.reprogramar(
        items: agenda.items,
        preferencias: preferencias.preferencias,
        offsetCampusMinutos: agenda.offsetCampusMinutos,
      );
    } catch (_) {
      // Sin red no se reprograma: las alarmas que ya estaban puestas siguen
      // siendo válidas, y borrarlas por no poder confirmarlas dejaría al
      // docente sin avisos justo cuando no tiene conexión.
    } finally {
      _reprogramando = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    // Un aviso que llega por Socket.IO con la app en segundo plano no se ve si
    // solo se invalida una caché: se muestra como notificación del sistema. La
    // clave la pone el servidor (`_id`), así que Android reemplaza en vez de
    // apilar si el mismo aviso llegara dos veces.
    ref.listen(realtimeNotificationsProvider, (previous, next) {
      next.whenData((carga) {
        final titulo = carga['title']?.toString();
        if (titulo == null || titulo.isEmpty) return;

        final prioridad = carga['priority']?.toString() ?? 'INFO';
        final enlace = carga['link']?.toString();

        unawaited(LocalNotificationsService.instance.mostrarAhora(
          clave: carga['_id']?.toString() ?? titulo,
          titulo: titulo,
          mensaje: carga['message']?.toString() ?? '',
          canalId: switch (prioridad) {
            'URGENT' => 'uts_urgente',
            'IMPORTANT' => 'uts_importante',
            'SYSTEM' => 'uts_sistema',
            _ => 'uts_informativa',
          },
          ruta: (enlace != null && enlace.startsWith('/')) ? enlace : '/notifications',
        ));

        ref.invalidate(notificationsProvider);
      });
    });

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
          // Un grupo es la unidad que agrupa a los estudiantes dentro de una
          // materia: cambiarlo mueve quién aparece en cada listado.
          case 'group':
            ref.invalidate(subjectsProvider);
            ref.invalidate(subjectRosterProvider);
          case 'grade':
            ref.invalidate(consolidatedGradesProvider);
            // Guardar o borrar una nota cambia lo que falta por calificar.
            ref.invalidate(pendingGradesProvider);
            ref.invalidate(dashboardProvider);
          case 'attendance':
            ref.invalidate(dashboardProvider);
          // El horario alimenta la agenda: cambiarlo mueve las clases y, con
          // ellas, los recordatorios que el teléfono tenía programados.
          case 'schedule':
            ref.invalidate(scheduleProvider);
            ref.invalidate(agendaResumenProvider);
            ref.invalidate(agendaSemanaProvider);
            ref.invalidate(agendaProximaProvider);
            unawaited(_reprogramarRecordatorios());
          case 'calendar':
          case 'activity':
            ref.invalidate(agendaResumenProvider);
            ref.invalidate(agendaSemanaProvider);
            ref.invalidate(agendaProximaProvider);
            unawaited(_reprogramarRecordatorios());
          // Cambiar la antelación en el escritorio tiene que reprogramar las
          // alarmas de este teléfono; si no, seguiría avisando con la vieja.
          case 'preferences':
            ref.invalidate(notificationPrefsProvider);
            unawaited(_reprogramarRecordatorios());
          // Sin este caso el aviso caía en `default`, que solo recarga el
          // panel: el docente con la pantalla de avisos abierta no lo veía
          // aparecer hasta que la recargara a mano.
          case 'announcement':
            ref.invalidate(avisosProvider);
          // El cambio de estado que hace el admin en el escritorio se refleja
          // en la lista del docente sin recargar a mano.
          case 'feedback':
            ref.invalidate(feedbackProvider);
          // Activar el flag de director enciende la sección de trabajos de
          // grado sin cerrar sesión: el gate lee la ficha, no el token.
          case 'professor':
            ref.invalidate(miPerfilProvider);
          case 'thesisFormat':
            ref.invalidate(thesisFormatsProvider);
          case 'notification':
            ref.invalidate(notificationsProvider);
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
          // Al entrar se piden los permisos, se registra el teléfono para el
          // push y se programan los avisos de la semana. Es el único momento en
          // que el docente entiende para qué se le pide el permiso, y las
          // alarmas quedan puestas aunque cierre la aplicación a continuación.
          unawaited(LocalNotificationsService.instance.pedirPermisos().then((_) async {
            // El token se ata al usuario que acaba de entrar: en un teléfono
            // compartido, el docente nuevo no puede heredar las alertas del
            // anterior.
            await PushService.instance.registrar();
            await _reprogramarRecordatorios();
          }));
        } else {
          // Al cerrar sesión no pueden quedar alarmas con el nombre de las
          // clases del docente anterior, ni un token que le siga empujando sus
          // alertas a un teléfono que ya no es suyo.
          unawaited(PushService.instance.darDeBaja());
          unawaited(LocalNotificationsService.instance.cancelarTodo());
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
      // Envuelve todas las rutas: la versión nueva se avisa también en el
      // login, que es donde se queda quien no puede entrar por culpa de la
      // vieja. Va aquí y no dentro del shell porque necesita un Navigator.
      builder: (_, child) => UpdateGate(
        navigatorKey: rootNavigatorKey,
        child: child ?? const SizedBox.shrink(),
      ),
    );
  }
}
