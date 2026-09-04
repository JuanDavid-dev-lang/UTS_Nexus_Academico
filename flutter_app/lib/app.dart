import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import './core/data/providers.dart';
import './core/auth/auth_controller.dart';
import './core/network/realtime_service.dart';
import './core/storage/offline_status.dart';
import './core/theme/app_theme.dart';
import './core/theme/theme_controller.dart';
import './core/widgets/app_scaffold.dart';
import './core/widgets/update_prompt.dart';
import './core/notifications/local_notifications_service.dart';
import './core/notifications/push_service.dart';
import './features/activities/activities_page.dart';
import './features/agenda/agenda_page.dart';
import './features/ai/ai_page.dart';
import './features/auth/login_page.dart';
import './features/auth/recovery_page.dart';
import './features/dashboard/dashboard_page.dart';
import './features/notifications/notifications_page.dart';
import './features/profile/profile_page.dart';
import './features/attendance/attendance_page.dart';
import './features/attendance/scan_sheet_page.dart';
import './features/announcements/announcements_page.dart';
import './features/auth/register_page.dart';
import './features/tutorial/tutorial_page.dart';
import './features/reports/reports_page.dart';
import './features/schedule/schedule_page.dart';
import './features/settings/settings_page.dart';
import './features/students/students_page.dart';
import './features/subjects/subjects_page.dart';
import './features/subjects/subject_detail_page.dart';
import './features/grades/grades_page.dart';
import './features/feedback/feedback_page.dart';
import './features/thesis/thesis_formats_page.dart';
import './features/admin/admin_supervision_page.dart';

/// Navigator raíz. Lo necesita [UpdateGate]: el `builder` de `MaterialApp` se
/// dibuja por encima del Navigator del router, así que desde su contexto no hay
/// ninguno al que pedirle un diálogo.
final rootNavigatorKey = GlobalKey<NavigatorState>();

/// Claves de navegador de cada rama del shell.
///
/// Una por rama, y estables entre reconstrucciones: son lo que le permite a
/// `StatefulShellRoute` conservar el navegador —y con él la pila y el estado—
/// de la pestaña que se deja atrás.
final _clavesDeRama = List.generate(
  rutasDeRama.length,
  (i) => GlobalKey<NavigatorState>(debugLabel: 'rama-${rutasDeRama[i]}'),
);

/// Cuenta las ramas construidas hasta ahora: el índice de la siguiente es
/// simplemente su posición en la lista, así que no hace falta escribirlo a
/// mano en cada llamada a `_rama` (y desincronizarlo si alguien reordena o
/// inserta una rama sin renumerar las que siguen).
int _indiceDeRama = 0;

/// Construye una rama del shell con su ruta raíz y, si las tiene, sus hijas.
StatefulShellBranch _rama(
  String ruta,
  Widget Function(BuildContext, GoRouterState) constructor, {
  List<RouteBase> hijas = const [],
}) {
  return StatefulShellBranch(
    navigatorKey: _clavesDeRama[_indiceDeRama++],
    routes: [GoRoute(path: ruta, builder: constructor, routes: hijas)],
  );
}

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
    GoRoute(path: '/admin-supervision', builder: (_, __) => const AdminSupervisionPage()),

    /// Shell con estado por pestaña.
    ///
    /// Antes era un `ShellRoute` normal, y eso significaba que cambiar de
    /// pestaña **destruía la anterior**: al volver, la lista arrancaba desde
    /// arriba, el buscador aparecía vacío y cualquier despliegue a medio
    /// rellenar se había perdido. Los datos sobrevivían —los providers no son
    /// `autoDispose`— pero el árbol de widgets no, así que la pantalla se
    /// reconstruía entera y el docente veía el parpadeo cada vez.
    ///
    /// `indexedStack` mantiene viva cada rama que ya se ha visitado, con su
    /// propio navegador: volver a una pestaña es mostrarla, no rehacerla. Las
    /// ramas se construyen la primera vez que se entra, no al arrancar, así
    /// que abrir la aplicación no cuesta más que antes.
    StatefulShellRoute.indexedStack(
      builder: (_, __, navigationShell) => AppScaffold(navigationShell: navigationShell),
      /*
       * El ORDEN de estas ramas es el contrato con `rutasDeRama` de
       * `app_scaffold.dart`: la rama N atiende a `rutasDeRama[N]`.
       * Reordenarlas aquí sin reordenarlas allí compila igual y manda cada
       * pestaña a la pantalla equivocada, así que `test/router_test.dart` lo
       * fija. Las cuatro primeras son las de la barra inferior.
       */
      branches: [
        _rama('/', (_, __) => const DashboardPage()),
        _rama(
          '/subjects',
          (_, __) => const SubjectsPage(),
          hijas: [
            // Los estudiantes cuelgan de su materia: es como trabaja un docente
            // ("mis estudiantes de Cálculo I"), y la ruta lo refleja. Va dentro
            // de la rama para que el detalle se apile sobre el listado y volver
            // atrás no salga de la pestaña.
            GoRoute(
              path: ':subjectId',
              builder: (_, state) => SubjectDetailPage(
                subjectId: state.pathParameters['subjectId']!,
              ),
            ),
          ],
        ),
        // `?item=` lo pone la notificación: al tocarla se abre esa clase, no la
        // agenda genérica. Sin eso, el aviso obliga a repetir a mano la
        // búsqueda que él mismo ya había hecho.
        _rama('/agenda',
            (_, state) => AgendaPage(itemDestacado: state.uri.queryParameters['item'])),
        _rama('/ai', (_, __) => const AiPage()),

        // ── A partir de aquí, lo que vive dentro de «Más» ──────────────
        _rama('/students', (_, __) => const StudentsPage()),
        _rama('/grades', (_, __) => const GradesPage()),
        _rama(
          '/attendance',
          (_, __) => const AttendancePage(),
          hijas: [
            GoRoute(path: 'scan', builder: (_, __) => const ScanSheetPage()),
          ],
        ),
        // Igual que la agenda, `?item=` lo pone el aviso de vencimiento para
        // abrir exactamente esa entrega.
        _rama('/actividades',
            (_, state) => ActivitiesPage(itemDestacado: state.uri.queryParameters['item'])),
        _rama('/schedule', (_, __) => const SchedulePage()),
        _rama('/reports', (_, __) => const ReportsPage()),
        _rama('/avisos', (_, __) => const AnnouncementsPage()),
        _rama('/sugerencias', (_, __) => const FeedbackPage()),
        _rama('/notifications', (_, __) => const NotificationsPage()),
        _rama('/settings', (_, __) => const SettingsPage()),
        // La rama existe siempre aunque el menú la esconda: las rutas son
        // estáticas y el permiso —`esDirectorProvider`— llega después, al
        // cargar la ficha. Montarla condicionalmente dejaría la sección
        // inaccesible hasta reiniciar.
        _rama('/trabajos-grado', (_, __) => const ThesisFormatsPage()),
        _rama('/profile', (_, __) => const ProfilePage()),
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

        // Notificar que se ha recibido una actualización en tiempo real.
        OfflineStatus.instance.notificarActualizacionEnTiempoReal();

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
            ref.invalidate(agendaResumenProvider);
            ref.invalidate(agendaSemanaProvider);
            ref.invalidate(agendaProximaProvider);
            unawaited(_reprogramarRecordatorios());
          // Una actividad sale en la agenda ADEMÁS de en su propia pantalla.
          // Antes solo caía la agenda, así que crear una entrega desde el
          // escritorio no la hacía aparecer en el listado del teléfono.
          case 'activity':
            ref.invalidate(actividadesProvider);
            ref.invalidate(agendaResumenProvider);
            ref.invalidate(agendaSemanaProvider);
            ref.invalidate(agendaProximaProvider);
            unawaited(_reprogramarRecordatorios());
          /*
           * Cerrar un periodo bloquea notas, asistencia y matrículas. Sin esta
           * entrada, el docente con la pantalla de notas abierta seguiría
           * pudiendo escribir y recibiría un 409 que no espera; con ella, la
           * pantalla se entera y desactiva la captura.
           */
          case 'period':
            ref.invalidate(periodosProvider);
            ref.invalidate(consolidatedGradesProvider);
            ref.invalidate(pendingGradesProvider);
            ref.invalidate(dashboardProvider);
          // Un caso de inasistencia abierto por el escáner del servidor.
          case 'attendanceCase':
            ref.invalidate(casosAsistenciaProvider);
            ref.invalidate(dashboardProvider);
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
          // Alta, edición o desactivación de una institución: lo único que
          // depende de esto en el móvil es la ficha propia (nombre, sigla,
          // si sigue pendiente de aprobación). No hay catálogo de registro
          // cacheado en un provider: esa pantalla se abre sin sesión.
          case 'institution':
            ref.invalidate(miPerfilProvider);
          case 'thesisFormat':
            ref.invalidate(thesisFormatsProvider);
          // Cambiarle el rol o los programas a alguien cambia lo que ve. El
          // perfil se recarga sin cerrar sesion, igual que con el flag de
          // director: el alcance se lee de la ficha, no del token.
          case 'user':
            ref.invalidate(miPerfilProvider);
            ref.invalidate(dashboardProvider);
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
