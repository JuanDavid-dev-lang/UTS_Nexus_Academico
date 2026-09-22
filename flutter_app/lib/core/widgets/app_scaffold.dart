import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../features/tutorial/tour_overlay.dart';
import '../../features/tutorial/tutorial_page.dart';
import 'package:go_router/go_router.dart';

import '../auth/auth_controller.dart';
import '../data/providers.dart';
import '../navigation/menu_preferences.dart';
import '../telemetry/error_reporter.dart';
import '../theme/app_theme.dart';
import './offline_banner.dart';
import './session_menu.dart';
import '../admin/admin_mode_provider.dart';

/// Estructura de navegación.
///
/// Cinco destinos abajo y el resto en «Más». Material especifica entre tres y
/// cinco: con nueve las etiquetas se recortan y los toques se solapan, y con
/// cuatro —como estaba— sobraba un hueco que obligaba a esconder la agenda
/// dentro de una hoja, cuando es la pantalla que un docente abre a diario.
///
/// La lógica de navegación no está duplicada entre el riel lateral y la barra
/// inferior: hay una sola lista de destinos y los dos la consumen.
class NavDestination {
  final String route;
  final String label;

  /// Siempre en trazo (outline): la selección la comunican el indicador y el
  /// color, no un cambio de estilo de icono.
  final IconData icon;

  /// Roles que lo ven. Vacío = todos.
  final List<String> roles;

  const NavDestination({
    required this.route,
    required this.label,
    required this.icon,
    this.roles = const [],
  });

  bool visiblePara(String? rol) =>
      roles.isEmpty || (rol != null && roles.contains(rol));
}

/// Rutas de las ramas del shell, **en el mismo orden que en `app.dart`**.
///
/// Es el contrato entre el router y este menú: la rama número N atiende a
/// `rutasDeRama[N]`. Se declara aquí y no en el router porque es lo que el
/// menú necesita para traducir «el docente tocó Materias» al índice de rama
/// que entiende `goBranch`. Cambiar el orden en un sitio y no en el otro
/// mandaría cada pestaña a la pantalla equivocada sin ningún error de
/// compilación, así que `test/router_test.dart` lo fija.
///
/// Los cuatro primeros son los destinos de la barra inferior, en su orden. No
/// es casualidad ni se puede reordenar sin más: `primaryDestinations` se
/// compara contra esta lista y el quinto botón —«Más»— ocupa la posición
/// `primaryDestinations.length`.
const rutasDeRama = <String>[
  '/',
  '/subjects',
  '/agenda',
  '/ai',
  // A partir de aquí, lo que vive dentro de «Más».
  '/students',
  '/grades',
  '/attendance',
  '/actividades',
  '/schedule',
  '/reports',
  '/avisos',
  '/sugerencias',
  '/notifications',
  '/settings',
  '/trabajos-grado',
  '/profile',
];

/// Índice de la rama que atiende una ruta. -1 si ninguna.
int indiceDeRama(String ruta) => rutasDeRama.indexOf(ruta);

/// Orden visible al comenzar a cargar las preferencias de una sesión.
///
/// Al cambiar de cuenta no se puede conservar ni un fotograma del menú del
/// usuario anterior. Para el mismo usuario sí se conserva el orden actual
/// mientras se recarga (por ejemplo, tras cambiar el flag de director).
List<String> menuRoutesWhileLoading({
  required String? previousUserId,
  required String userId,
  required Iterable<String> currentRoutes,
  required List<String> authorizedRoutes,
}) => previousUserId == userId
    ? reconcileMenuRoutes(
        savedRoutes: currentRoutes,
        authorizedRoutes: authorizedRoutes,
      )
    : List<String>.of(authorizedRoutes);

/// Los cuatro que caben en la barra, más «Más» que se dibuja aparte.
///
/// «Materias» ocupa el lugar que antes tenía «Estudiantes»: desde ahí se llega
/// a los estudiantes de cada materia, que es como los busca un docente. La
/// agenda sube a la barra porque es la respuesta a «¿qué tengo ahora?», y la
/// asistencia baja a «Más» porque se entra a ella desde la clase concreta.
const primaryDestinations = <NavDestination>[
  NavDestination(
    route: '/',
    label: 'Inicio',
    icon: Icons.space_dashboard_outlined,
  ),
  NavDestination(
    route: '/subjects',
    label: 'Materias',
    icon: Icons.menu_book_outlined,
  ),
  NavDestination(
    route: '/agenda',
    label: 'Agenda',
    icon: Icons.calendar_month_outlined,
  ),
  NavDestination(
    route: '/ai',
    label: 'Asistente',
    icon: Icons.auto_awesome_outlined,
  ),
];

/// El resto, accesible desde «Más», agrupado por lo que se hace con ello.
const secondaryDestinations = <NavDestination>[
  NavDestination(
    route: '/students',
    label: 'Estudiantes',
    icon: Icons.people_outline,
    roles: ['ADMIN', 'PROFESSOR', 'COORDINATOR', 'SECRETARY'],
  ),
  NavDestination(route: '/grades', label: 'Notas', icon: Icons.school_outlined),
  NavDestination(
    route: '/attendance',
    label: 'Asistencia',
    icon: Icons.fact_check_outlined,
    roles: ['ADMIN', 'PROFESSOR', 'COORDINATOR', 'SECRETARY'],
  ),
  NavDestination(
    route: '/actividades',
    label: 'Actividades',
    icon: Icons.assignment_outlined,
  ),
  // Sin STUDENT: `GET /schedules` no lo acepta, y sus clases ya salen en la
  // agenda, que sí es suya.
  NavDestination(
    route: '/schedule',
    label: 'Horario',
    icon: Icons.schedule_outlined,
    roles: ['ADMIN', 'PROFESSOR', 'COORDINATOR', 'SECRETARY'],
  ),
  NavDestination(
    route: '/reports',
    label: 'Reportes',
    icon: Icons.description_outlined,
    roles: ['ADMIN', 'PROFESSOR', 'COORDINATOR', 'SECRETARY'],
  ),
  NavDestination(
    route: '/avisos',
    label: 'Avisos',
    icon: Icons.campaign_outlined,
  ),
  NavDestination(
    route: '/sugerencias',
    label: 'Sugerencias',
    icon: Icons.feedback_outlined,
  ),
  NavDestination(
    route: '/notifications',
    label: 'Notificaciones',
    icon: Icons.notifications_outlined,
  ),
  NavDestination(
    route: '/settings',
    label: 'Configuración',
    icon: Icons.settings_outlined,
  ),
];

/// Solo para docentes directores de trabajo de grado. No va en la lista const:
/// depende de un flag de la ficha que activa la administración, así que se
/// añade en el build según `esDirectorProvider`.
const thesisDestination = NavDestination(
  route: '/trabajos-grado',
  label: 'Trabajos de grado',
  icon: Icons.school_outlined,
);

/// Puerto mínimo que usa el menú para cambiar de rama.
///
/// La implementación de producción delega directamente en
/// [StatefulNavigationShell.goBranch]. Mantener este puerto explícito permite
/// comprobar el toque completo del menú sin fingir que resolver el índice y
/// navegar son dos comportamientos independientes.
abstract interface class BranchNavigation {
  int get currentIndex;

  void goBranch(int index, {bool initialLocation = false});
}

class StatefulShellBranchNavigation implements BranchNavigation {
  final StatefulNavigationShell shell;

  const StatefulShellBranchNavigation(this.shell);

  @override
  int get currentIndex => shell.currentIndex;

  @override
  void goBranch(int index, {bool initialLocation = false}) =>
      shell.goBranch(index, initialLocation: initialLocation);
}

/// Envoltorio de las pantallas con sesión.
///
/// Es stateful solo por el tutorial: hace falta un punto que se ejecute una vez
/// tras el primer fotograma con sesión iniciada, y este envuelve a todas las
/// pantallas sin repetir el enganche en cada una.
///
/// Recibe el `StatefulNavigationShell` en vez de un hijo suelto: el shell es
/// quien conserva vivas las pestañas visitadas y quien sabe en cuál estamos,
/// así que el índice del menú sale de él y no de comparar la ruta a mano.
class AppScaffold extends ConsumerStatefulWidget {
  final StatefulNavigationShell navigationShell;
  final BranchNavigation? branchNavigation;
  final List<String>? initialMenuRoutes;

  const AppScaffold({
    super.key,
    required this.navigationShell,
    @visibleForTesting this.branchNavigation,
    @visibleForTesting this.initialMenuRoutes,
  });

  @override
  ConsumerState<AppScaffold> createState() => _AppScaffoldState();
}

class _AppScaffoldState extends ConsumerState<AppScaffold> {
  final _menuRepository = MenuPreferencesRepository();
  List<String> _orderedRoutes = const [];
  String? _loadedMenuKey;
  String? _loadedUserId;

  // ── Recorrido señalado sobre la pantalla ──────────────────────────────
  // El overlay solo pinta un `Rect`; quién es el objetivo se decide aquí, que
  // es donde se sabe qué hay en la barra, qué está en «Más» y cómo abrirlo.
  final _claveBarra = GlobalKey();
  final _clavesCeldas = <String, GlobalKey>{};
  List<NavDestination> _principalesActuales = const [];
  List<NavDestination> _secundariosActuales = const [];
  OverlayEntry? _tourEntry;
  int _tourIndice = 0;
  Rect? _tourObjetivo;
  bool _hojaDeMasAbierta = false;
  int _tourMedicion = 0;

  GlobalKey _claveCelda(String ruta) =>
      _clavesCeldas.putIfAbsent(ruta, GlobalKey.new);

  BranchNavigation get _branchNavigation =>
      widget.branchNavigation ??
      StatefulShellBranchNavigation(widget.navigationShell);

  void _ensureMenuLoaded({
    required String userId,
    required String? role,
    required bool isDirector,
    required List<NavDestination> authorized,
  }) {
    final key = '$userId|$role|$isDirector';
    if (_loadedMenuKey == key) return;
    _loadedMenuKey = key;
    final routes = authorized.map((destination) => destination.route).toList();
    _orderedRoutes = menuRoutesWhileLoading(
      previousUserId: _loadedUserId,
      userId: userId,
      currentRoutes: _orderedRoutes,
      authorizedRoutes: routes,
    );
    _loadedUserId = userId;
    _menuRepository.load(userId: userId, authorizedRoutes: routes).then((
      loaded,
    ) {
      if (!mounted || _loadedMenuKey != key) return;
      setState(() => _orderedRoutes = loaded);
    });
  }

  @override
  void initState() {
    super.initState();
    _orderedRoutes = widget.initialMenuRoutes ?? const [];
    // Se lanza tras el primer fotograma: navegar durante el build dejaría el
    // árbol a medio construir.
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (await tutorialVisto()) return;
      if (mounted) _abrirTutorial();
    });
  }

  @override
  void dispose() {
    _tourEntry?.remove();
    _tourEntry = null;
    super.dispose();
  }

  /// En un teléfono, el recorrido señala la pantalla real; en una tableta con
  /// riel no hay barra que señalar y se usa la página a pantalla completa.
  void _abrirTutorial() {
    if (MediaQuery.sizeOf(context).width > 900) {
      context.push('/tutorial');
      return;
    }
    _iniciarTour();
  }

  void _iniciarTour() {
    if (_tourEntry != null) return;
    _tourIndice = 0;
    _tourObjetivo = null;
    _tourEntry = OverlayEntry(builder: _construirTour);
    Overlay.of(context, rootOverlay: true).insert(_tourEntry!);
    _prepararPaso(0, 1);
  }

  Widget _construirTour(BuildContext context) {
    final paso = pasos[_tourIndice];
    return TourOverlay(
      paso: paso,
      indice: _tourIndice,
      total: pasos.length,
      objetivo: _tourObjetivo,
      onSiguiente: () => _tourIndice == pasos.length - 1
          ? _terminarTour()
          : _prepararPaso(_tourIndice + 1, 1),
      onAtras: () => _prepararPaso(_tourIndice - 1, -1),
      onSaltar: _terminarTour,
    );
  }

  Future<void> _terminarTour() async {
    _cerrarHojaDeMasSiAbierta();
    _tourEntry?.remove();
    _tourEntry = null;
    await marcarTutorialVisto();
  }

  /// Un paso puede señalar una pestaña de la barra (y navega a ella), el
  /// botón «Más», una celda de la hoja de «Más» (la abre si hace falta) o
  /// nada. Lo que el rol no ve se salta en la dirección del viaje.
  void _prepararPaso(int indice, int direccion) {
    if (_tourEntry == null) return;
    var i = indice;
    while (i >= 0 && i < pasos.length && !_pasoDisponible(pasos[i])) {
      i += direccion;
    }
    if (i < 0 || i >= pasos.length) {
      if (direccion > 0) {
        _terminarTour();
      }
      return;
    }
    final paso = pasos[i];
    final ruta = paso.ruta;
    final esCelda =
        ruta != null &&
        ruta != rutaMas &&
        _secundariosActuales.any((d) => d.route == ruta);

    _tourIndice = i;
    _tourObjetivo = null;
    _tourMedicion++;

    if (esCelda) {
      if (!_hojaDeMasAbierta) _abrirHojaDeMasDesdeTour();
    } else {
      _cerrarHojaDeMasSiAbierta();
      if (ruta != null && ruta != rutaMas) _irA(ruta);
    }
    _tourEntry?.markNeedsBuild();
    _medirObjetivo(_tourMedicion, paso, 0);
  }

  bool _pasoDisponible(PasoTutorial paso) {
    final ruta = paso.ruta;
    if (ruta == null || ruta == rutaMas) return true;
    return _principalesActuales.any((d) => d.route == ruta) ||
        _secundariosActuales.any((d) => d.route == ruta);
  }

  /// El objetivo se mide después de pintar, y se reintenta unos fotogramas:
  /// la hoja de «Más» tarda en montarse y la pestaña nueva en dibujarse. El
  /// número de medición descarta resultados de un paso que ya no es el actual.
  void _medirObjetivo(
    int medicion,
    PasoTutorial paso,
    int intento, [
    Rect? anterior,
  ]) {
    if (paso.ruta == null) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || _tourEntry == null || medicion != _tourMedicion) return;
      final rect = _rectDelPaso(paso);
      // Se acepta solo cuando dos fotogramas seguidos dan lo mismo: la hoja
      // de «Más» sube animada y la primera lectura de una celda la pilla a
      // medio camino —un hueco fuera de la pantalla que nunca se corregía—.
      if (rect != null && rect == anterior) {
        _tourObjetivo = rect;
        _tourEntry?.markNeedsBuild();
        return;
      }
      // Unos 1,2 s a 60 fps; pasado el plazo el paso se queda centrado.
      if (intento < 72) _medirObjetivo(medicion, paso, intento + 1, rect);
    });
    // El callback solo corre si hay un fotograma, y con la pantalla quieta
    // nadie lo pide: sin esto la medición se paraba en cuanto la hoja
    // terminaba de subir, justo antes de la lectura estable.
    WidgetsBinding.instance.scheduleFrame();
  }

  Rect? _rectDelPaso(PasoTutorial paso) {
    final ruta = paso.ruta;
    if (ruta == null) return null;
    final barra = rectDeClave(_claveBarra);
    if (ruta == rutaMas) {
      return _casillaDeBarra(barra, _principalesActuales.length);
    }
    final enBarra = _principalesActuales.indexWhere((d) => d.route == ruta);
    if (enBarra >= 0) return _casillaDeBarra(barra, enBarra);
    return rectDeClave(_claveCelda(ruta));
  }

  /// `NavigationBar` reparte el ancho a partes iguales: la casilla i es esa
  /// fracción del rectángulo de la barra.
  Rect? _casillaDeBarra(Rect? barra, int indice) {
    if (barra == null) return null;
    final casillas = _principalesActuales.length + 1;
    final ancho = barra.width / casillas;
    return Rect.fromLTWH(
      barra.left + ancho * indice + 4,
      barra.top + 4,
      ancho - 8,
      barra.height - 8,
    );
  }

  void _abrirHojaDeMasDesdeTour() {
    final usuario = ref.read(authControllerProvider).user;
    _abrirHojaDeMas(
      context,
      rutasDeRama[_branchNavigation.currentIndex],
      _secundariosActuales,
      [..._principalesActuales, ..._secundariosActuales],
      usuario?.id,
    );
  }

  void _cerrarHojaDeMasSiAbierta() {
    if (!_hojaDeMasAbierta) return;
    _hojaDeMasAbierta = false;
    Navigator.of(context).pop();
  }

  /// Lleva a un destino conservando el estado de su pestaña.
  ///
  /// `goBranch` en vez de `context.go`: vuelve a la pestaña **donde se dejó**,
  /// con su desplazamiento y su pila. `initialLocation` solo se activa al
  /// tocar la pestaña en la que ya se está, que es el gesto universal de
  /// «llévame al principio de esto».
  void _irA(String ruta) {
    final rama = indiceDeRama(ruta);
    if (rama < 0) return;
    _branchNavigation.goBranch(
      rama,
      initialLocation: rama == _branchNavigation.currentIndex,
    );
  }

  @override
  Widget build(BuildContext context) {
    // El índice lo sabe el shell: es la rama viva, no una ruta comparada a
    // mano. Estando en `/subjects/abc` la rama sigue siendo la de Materias, así
    // que la pestaña se queda encendida sin ninguna regla de prefijos.
    final ramaActual = _branchNavigation.currentIndex;
    final rutaActual = rutasDeRama[ramaActual];

    // Un error reportado sin decir en qué pantalla ocurrió obliga a adivinar.
    // La rama viva es la respuesta más fiable que hay, y no cuesta nada: es
    // una asignación sobre un dato que este widget ya tenía calculado.
    ErrorReporter.instance.rutaActual = rutaActual;

    // `sizeOf` y no `of`: este widget envuelve TODAS las pantallas con sesión,
    // y `MediaQuery.of` lo suscribe al MediaQueryData entero. El teclado anima
    // `viewInsets` fotograma a fotograma, así que cada apertura reconstruía la
    // barra de navegación y el riel —con sus catorce destinos— sesenta veces
    // por segundo, para leer un ancho que no había cambiado.
    final isWide = MediaQuery.sizeOf(context).width > 900;

    final usuario = ref.watch(authControllerProvider).user;
    final rol = usuario?.role;
    final esDirector = ref.watch(esDirectorProvider);
    final autorizadosCanonicos = <NavDestination>[
      ...primaryDestinations.where((d) => d.visiblePara(rol)),
      ...secondaryDestinations.where((d) => d.visiblePara(rol)),
      if (esDirector) thesisDestination,
    ];
    if (usuario != null) {
      _ensureMenuLoaded(
        userId: usuario.id,
        role: rol,
        isDirector: esDirector,
        authorized: autorizadosCanonicos,
      );
    }
    final rutasOrdenadas = reconcileMenuRoutes(
      savedRoutes: _orderedRoutes,
      authorizedRoutes: autorizadosCanonicos.map((d) => d.route).toList(),
    );
    final porRuta = {for (final d in autorizadosCanonicos) d.route: d};
    final todos = rutasOrdenadas.map((route) => porRuta[route]!).toList();
    final principales = todos.take(menuPrimaryCount).toList();
    final secundarios = todos.skip(menuPrimaryCount).toList();
    _principalesActuales = principales;
    _secundariosActuales = secundarios;

    // Ajustes pide el recorrido incrementando el contador; se atiende aquí
    // porque el overlay necesita la barra y las celdas de este scaffold.
    ref.listen<int>(tourSolicitadoProvider, (anterior, actual) {
      if (actual != (anterior ?? 0)) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) _abrirTutorial();
        });
      }
    });

    if (isWide) {
      final indice = todos.indexWhere((d) => d.route == rutaActual);
      return Scaffold(
        // El alto de la barra de estado se paga UNA vez, aquí. Antes lo pagaba
        // el SafeArea de la franja de sincronización y, además, el AppBar de
        // cada pantalla —que lee MediaQuery.padding.top por su cuenta—, así
        // que toda pantalla arrastraba una banda vacía arriba.
        body: SafeArea(
          bottom: false,
          child: Row(
            children: [
              NavigationRail(
                // NavigationRail exige un índice válido; -1 lo haría fallar.
                selectedIndex: indice < 0 ? 0 : indice,
                onDestinationSelected: (i) => _irA(todos[i].route),
                labelType: NavigationRailLabelType.all,
                destinations: [
                  for (final destino in todos)
                    NavigationRailDestination(
                      icon: Icon(destino.icon),
                      label: Text(destino.label),
                    ),
                ],
              ),
              const VerticalDivider(width: 1),
              Expanded(
                child: Column(
                  children: [
                    const OfflineBanner(),
                    Expanded(
                      child: MediaQuery.removePadding(
                        context: context,
                        removeTop: true,
                        child: widget.navigationShell,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      );
    }

    // En un teléfono: cuatro destinos + «Más».
    return Scaffold(
      // La franja va por encima de la pantalla, no dentro: aplica a todas y
      // ninguna debería tener que acordarse de mostrarla.
      //
      // El SafeArea de fuera y el removePadding de dentro son la misma
      // decisión: el alto de la barra de estado se descuenta UNA vez. Sin el
      // segundo, el AppBar de cada pantalla volvía a leer
      // MediaQuery.padding.top y lo sumaba otra vez: una banda vacía de ~30 dp
      // encima de todas las pantallas.
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            const OfflineBanner(),
            Expanded(
              child: MediaQuery.removePadding(
                context: context,
                removeTop: true,
                child: widget.navigationShell,
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: AppMobileNavigation(
        key: _claveBarra,
        // En una pantalla secundaria se resalta «Más», que es desde donde llegó.
        currentRoute: rutaActual,
        primaryDestinations: principales,
        onMore: () {
          _abrirHojaDeMas(context, rutaActual, secundarios, todos, usuario?.id);
        },
        onRouteSelected: _irA,
      ),
    );
  }

  /// Hoja de «Más»: cuadrícula de accesos en vez de una columna de `ListTile`.
  ///
  /// Diez entradas en columna son unos 560 dp y no caben sin desplazar en
  /// ningún teléfono; en cuadrícula de tres caben todas de un vistazo, que es
  /// lo que un menú tiene que hacer. Cada celda mantiene 72 dp de alto, por
  /// encima del objetivo táctil.
  void _abrirHojaDeMas(
    BuildContext context,
    String rutaActual,
    List<NavDestination> secundarios,
    List<NavDestination> todos,
    String? userId,
  ) {
    _hojaDeMasAbierta = true;
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      // Sin `isScrollControlled` la hoja se queda en media pantalla y, con el
      // tamaño de fuente del sistema subido, Flutter recorta las últimas filas
      // sin barra de desplazamiento: dejan de existir.
      isScrollControlled: true,
      constraints: BoxConstraints(
        maxHeight: MediaQuery.sizeOf(context).height * 0.85,
      ),
      builder: (contextoHoja) {
        final palette = AppPalette.of(contextoHoja);
        // El rojo canónico está calibrado para texto sobre blanco; en oscuro
        // hay que aclararlo o cae por debajo del AA que exige DESIGN.md.
        final danger = palette.danger.fg;

        return SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.page,
              0,
              AppSpacing.page,
              AppSpacing.gap,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.gap),
                  child: Row(
                    children: [
                      Text(
                        'MÁS SECCIONES',
                        style: AppType.captionStrong.copyWith(
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.8,
                          color: palette.muted,
                        ),
                      ),
                      const SizedBox(width: AppSpacing.gapSm),
                      Expanded(
                        child: Divider(height: 1, color: palette.border),
                      ),
                    ],
                  ),
                ),

                GridView.count(
                  crossAxisCount: 3,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  crossAxisSpacing: AppSpacing.gapSm,
                  mainAxisSpacing: AppSpacing.gapSm,
                  childAspectRatio: 0.95,
                  children: [
                    for (final destino in secundarios)
                      _CeldaDeMenu(
                        key: _claveCelda(destino.route),
                        destino: destino,
                        activo: rutaActual == destino.route,
                        onTap: () {
                          Navigator.of(contextoHoja).pop();
                          _irA(destino.route);
                        },
                      ),
                  ],
                ),

                // La sesión va abajo y separada: no es «otra sección más», y
                // cerrarla por error al buscar Reportes sería caro.
                const SizedBox(height: AppSpacing.gap),
                Divider(height: 1, color: palette.border),
                const SizedBox(height: AppSpacing.gapSm),
                if (ref.watch(isAdminModeActiveProvider))
                  ListTile(
                    leading: _IconoDeMenu(
                      icono: Icons.admin_panel_settings_outlined,
                      color: palette.primary,
                      fondo: palette.primarySoft,
                    ),
                    title: const Text('Supervisión Admin'),
                    subtitle: const Text(
                      'Previsualización de docentes y cuentas',
                    ),
                    trailing: Icon(
                      Icons.chevron_right,
                      size: 18,
                      color: palette.subtle,
                    ),
                    onTap: () {
                      Navigator.of(contextoHoja).pop();
                      context.push('/admin-supervision');
                    },
                  ),
                if (userId != null)
                  ListTile(
                    leading: _IconoDeMenu(
                      icono: Icons.drag_indicator_outlined,
                      color: palette.primary,
                      fondo: palette.primarySoft,
                    ),
                    title: const Text('Personalizar menú'),
                    subtitle: const Text(
                      'Ordena los cuatro accesos principales',
                    ),
                    trailing: Icon(
                      Icons.chevron_right,
                      size: 18,
                      color: palette.subtle,
                    ),
                    onTap: () {
                      Navigator.of(contextoHoja).pop();
                      _abrirEditorDeMenu(context, todos, userId);
                    },
                  ),
                ListTile(
                  leading: _IconoDeMenu(
                    icono: Icons.person_outline,
                    color: palette.primary,
                    fondo: palette.primarySoft,
                  ),
                  title: const Text('Mi perfil'),
                  trailing: Icon(
                    Icons.chevron_right,
                    size: 18,
                    color: palette.subtle,
                  ),
                  selected: rutaActual == '/profile',
                  onTap: () {
                    Navigator.of(contextoHoja).pop();
                    _irA('/profile');
                  },
                ),
                ListTile(
                  leading: _IconoDeMenu(
                    icono: Icons.logout_outlined,
                    color: danger,
                    fondo: SemanticTone.of(
                      contextoHoja,
                      SemanticKind.danger,
                    ).bg,
                  ),
                  title: Text(
                    'Cerrar sesión',
                    style: TextStyle(
                      color: danger,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  onTap: () async {
                    Navigator.of(contextoHoja).pop();
                    await confirmLogout(context, ref);
                  },
                ),
              ],
            ),
          ),
        );
      },
    ).whenComplete(() => _hojaDeMasAbierta = false);
  }

  Future<void> _abrirEditorDeMenu(
    BuildContext context,
    List<NavDestination> destinos,
    String userId,
  ) async {
    final editables = [...destinos];
    final result = await showModalBottomSheet<List<String>>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (sheetContext) => StatefulBuilder(
        builder: (context, setSheetState) => SafeArea(
          child: SizedBox(
            height: MediaQuery.sizeOf(context).height * 0.78,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: AppSpacing.page),
                  child: Text('Personalizar menú', style: AppType.h3),
                ),
                const Padding(
                  padding: EdgeInsets.fromLTRB(
                    AppSpacing.page,
                    AppSpacing.gapXs,
                    AppSpacing.page,
                    AppSpacing.gap,
                  ),
                  child: Text(
                    'Arrastra las opciones. Las primeras cuatro aparecen en la barra; Más siempre queda fijo.',
                  ),
                ),
                Expanded(
                  child: ReorderableListView.builder(
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppSpacing.gap,
                    ),
                    itemCount: editables.length,
                    onReorderItem: (oldIndex, newIndex) {
                      setSheetState(() {
                        final item = editables.removeAt(oldIndex);
                        editables.insert(newIndex, item);
                      });
                    },
                    itemBuilder: (context, index) {
                      final destino = editables[index];
                      return ListTile(
                        key: ValueKey(destino.route),
                        leading: Icon(destino.icon),
                        title: Text(destino.label),
                        subtitle: index < menuPrimaryCount
                            ? const Text('Barra principal')
                            : const Text('Dentro de Más'),
                        trailing: const Icon(Icons.drag_handle),
                      );
                    },
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(AppSpacing.page),
                  child: FilledButton(
                    onPressed: () => Navigator.of(sheetContext).pop(
                      editables
                          .map((destination) => destination.route)
                          .toList(),
                    ),
                    child: const Text('Guardar orden'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    if (result == null || !mounted) return;
    final authorized = destinos
        .map((destination) => destination.route)
        .toList();
    final repaired = reconcileMenuRoutes(
      savedRoutes: result,
      authorizedRoutes: authorized,
    );
    setState(() => _orderedRoutes = repaired);
    await _menuRepository.save(
      userId: userId,
      orderedRoutes: repaired,
      authorizedRoutes: authorized,
    );
  }
}

/// Barra móvil aislada para fijar el contrato ruta → rama con pruebas widget.
/// Recibe rutas, no índices: aunque el usuario las reordene, [AppScaffold]
/// sigue resolviendo la rama canónica mediante [indiceDeRama].
class AppMobileNavigation extends StatelessWidget {
  final List<NavDestination> primaryDestinations;
  final String currentRoute;
  final ValueChanged<String> onRouteSelected;
  final VoidCallback onMore;

  const AppMobileNavigation({
    super.key,
    required this.primaryDestinations,
    required this.currentRoute,
    required this.onRouteSelected,
    required this.onMore,
  });

  @override
  Widget build(BuildContext context) {
    final selected = primaryDestinations.indexWhere(
      (destination) => destination.route == currentRoute,
    );
    final palette = context.palette;
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border(top: BorderSide(color: palette.border)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: palette.isDark ? 0.3 : 0.06),
            blurRadius: 16,
            offset: const Offset(0, -4),
          ),
        ],
      ),
      child: NavigationBar(
        height: 64,
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        selectedIndex: selected < 0 ? primaryDestinations.length : selected,
        onDestinationSelected: (index) {
          if (index == primaryDestinations.length) {
            onMore();
          } else {
            onRouteSelected(primaryDestinations[index].route);
          }
        },
        destinations: [
          for (final destination in primaryDestinations)
            NavigationDestination(
              icon: Icon(destination.icon),
              label: destination.label,
            ),
          const NavigationDestination(
            icon: Icon(Icons.more_horiz_outlined),
            label: 'Más',
          ),
        ],
      ),
    );
  }
}

/// Icono de una entrada de menú, dentro de su cuadro de color.
///
/// El cuadro le da al icono un tamaño constante independientemente del glifo:
/// sin él, `Icons.description_outlined` ocupa visualmente bastante menos que
/// `Icons.campaign_outlined` al mismo `size`, y una columna de entradas de menú
/// queda con los iconos bailando de tamaño.
class _IconoDeMenu extends StatelessWidget {
  final IconData icono;
  final Color color;
  final Color fondo;

  const _IconoDeMenu({
    required this.icono,
    required this.color,
    required this.fondo,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 34,
      height: 34,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: fondo,
        borderRadius: BorderRadius.circular(AppSpacing.radiusInput - 2),
      ),
      child: Icon(icono, size: 18, color: color),
    );
  }
}

/// Celda de la cuadrícula de «Más».
class _CeldaDeMenu extends StatelessWidget {
  final NavDestination destino;
  final bool activo;
  final VoidCallback onTap;

  const _CeldaDeMenu({
    super.key,
    required this.destino,
    required this.activo,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;

    return Semantics(
      button: true,
      selected: activo,
      label: destino.label,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.gapXs,
              vertical: AppSpacing.gapSm,
            ),
            decoration: BoxDecoration(
              color: activo ? palette.primarySoft : palette.surface,
              borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
              border: Border.all(
                color: activo ? palette.primary : palette.border,
                width: activo ? 1.5 : 1,
              ),
              boxShadow: AppShadows.sm(palette.isDark),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // El icono siempre en tinta de marca: nueve cuadros grises
                // eran nueve celdas iguales; con el tinte, cada acceso se lee
                // como el botón que es.
                _IconoDeMenu(
                  icono: destino.icon,
                  color: palette.primary,
                  fondo: activo ? palette.primaryTint : palette.primarySoft,
                ),
                const SizedBox(height: AppSpacing.gapSm),
                Text(
                  destino.label,
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: AppType.caption.copyWith(
                    color: activo ? palette.primary : palette.text,
                    fontWeight: activo ? FontWeight.w700 : FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
