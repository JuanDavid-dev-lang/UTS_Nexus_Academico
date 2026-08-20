import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../features/tutorial/tutorial_page.dart';
import 'package:go_router/go_router.dart';

import '../auth/auth_controller.dart';
import '../data/providers.dart';
import '../telemetry/error_reporter.dart';
import '../theme/app_theme.dart';
import './offline_banner.dart';
import './session_menu.dart';

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

  bool visiblePara(String? rol) => roles.isEmpty || (rol != null && roles.contains(rol));
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

/// Los cuatro que caben en la barra, más «Más» que se dibuja aparte.
///
/// «Materias» ocupa el lugar que antes tenía «Estudiantes»: desde ahí se llega
/// a los estudiantes de cada materia, que es como los busca un docente. La
/// agenda sube a la barra porque es la respuesta a «¿qué tengo ahora?», y la
/// asistencia baja a «Más» porque se entra a ella desde la clase concreta.
const primaryDestinations = <NavDestination>[
  NavDestination(route: '/', label: 'Inicio', icon: Icons.space_dashboard_outlined),
  NavDestination(route: '/subjects', label: 'Materias', icon: Icons.menu_book_outlined),
  NavDestination(route: '/agenda', label: 'Agenda', icon: Icons.calendar_month_outlined),
  NavDestination(route: '/ai', label: 'Asistente', icon: Icons.auto_awesome_outlined),
];

/// El resto, accesible desde «Más», agrupado por lo que se hace con ello.
const secondaryDestinations = <NavDestination>[
  NavDestination(
    route: '/students',
    label: 'Estudiantes',
    icon: Icons.people_outline,
    roles: ['ADMIN', 'PROFESSOR', 'COORDINATOR'],
  ),
  NavDestination(route: '/grades', label: 'Notas', icon: Icons.school_outlined),
  NavDestination(
    route: '/attendance',
    label: 'Asistencia',
    icon: Icons.fact_check_outlined,
    roles: ['ADMIN', 'PROFESSOR', 'COORDINATOR'],
  ),
  NavDestination(
    route: '/actividades',
    label: 'Actividades',
    icon: Icons.assignment_outlined,
  ),
  NavDestination(route: '/schedule', label: 'Horario', icon: Icons.schedule_outlined),
  NavDestination(
    route: '/reports',
    label: 'Reportes',
    icon: Icons.description_outlined,
    roles: ['ADMIN', 'PROFESSOR', 'COORDINATOR'],
  ),
  NavDestination(route: '/avisos', label: 'Avisos', icon: Icons.campaign_outlined),
  NavDestination(route: '/sugerencias', label: 'Sugerencias', icon: Icons.feedback_outlined),
  NavDestination(
    route: '/notifications',
    label: 'Notificaciones',
    icon: Icons.notifications_outlined,
  ),
  NavDestination(route: '/settings', label: 'Configuración', icon: Icons.settings_outlined),
];

/// Solo para docentes directores de trabajo de grado. No va en la lista const:
/// depende de un flag de la ficha que activa la administración, así que se
/// añade en el build según `esDirectorProvider`.
const thesisDestination = NavDestination(
  route: '/trabajos-grado',
  label: 'Trabajos de grado',
  icon: Icons.school_outlined,
);

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
  const AppScaffold({super.key, required this.navigationShell});

  @override
  ConsumerState<AppScaffold> createState() => _AppScaffoldState();
}

class _AppScaffoldState extends ConsumerState<AppScaffold> {
  @override
  void initState() {
    super.initState();
    // Se lanza tras el primer fotograma: navegar durante el build dejaría el
    // árbol a medio construir.
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (await tutorialVisto()) return;
      if (mounted) context.push('/tutorial');
    });
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
    widget.navigationShell.goBranch(
      rama,
      initialLocation: rama == widget.navigationShell.currentIndex,
    );
  }

  @override
  Widget build(BuildContext context) {
    // El índice lo sabe el shell: es la rama viva, no una ruta comparada a
    // mano. Estando en `/subjects/abc` la rama sigue siendo la de Materias, así
    // que la pestaña se queda encendida sin ninguna regla de prefijos.
    final ramaActual = widget.navigationShell.currentIndex;
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

    final rol = ref.watch(authControllerProvider).user?.role;

    // La sección de trabajos de grado solo existe para quien la puede usar.
    // La rama existe igualmente; lo que se esconde es la entrada del menú.
    final esDirector = ref.watch(esDirectorProvider);
    final secundarios = [
      ...secondaryDestinations.where((d) => d.visiblePara(rol)),
      if (esDirector) thesisDestination,
    ];

    if (isWide) {
      final todos = [...primaryDestinations, ...secundarios];
      final indice = todos.indexWhere((d) => d.route == rutaActual);
      return Scaffold(
        body: Row(
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
                  Expanded(child: widget.navigationShell),
                ],
              ),
            ),
          ],
        ),
      );
    }

    // En un teléfono: cuatro destinos + «Más».
    final indicePrimario = primaryDestinations.indexWhere((d) => d.route == rutaActual);
    final esSecundaria = indicePrimario < 0;

    return Scaffold(
      // La franja va por encima de la pantalla, no dentro: aplica a todas y
      // ninguna debería tener que acordarse de mostrarla.
      body: Column(
        children: [
          const OfflineBanner(),
          Expanded(child: widget.navigationShell),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        // 64 en vez de los 80 por defecto. La etiqueta sigue visible y el
        // objetivo táctil sigue por encima de 48; lo que desaparece es el aire
        // que Material reserva para una tablet.
        height: 64,
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        // En una pantalla secundaria se resalta «Más», que es desde donde llegó.
        selectedIndex: esSecundaria ? primaryDestinations.length : indicePrimario,
        onDestinationSelected: (indice) {
          if (indice == primaryDestinations.length) {
            _abrirHojaDeMas(context, rutaActual, secundarios);
            return;
          }
          _irA(primaryDestinations[indice].route);
        },
        destinations: [
          for (final destino in primaryDestinations)
            NavigationDestination(icon: Icon(destino.icon), label: destino.label),
          const NavigationDestination(icon: Icon(Icons.more_horiz_outlined), label: 'Más'),
        ],
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
  ) {
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
        final danger = palette.isDark ? AppColors.dangerDark : AppColors.danger;

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
                      Expanded(child: Divider(height: 1, color: palette.border)),
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
                ListTile(
                  leading: _IconoDeMenu(
                    icono: Icons.person_outline,
                    color: palette.primary,
                    fondo: palette.primarySoft,
                  ),
                  title: const Text('Mi perfil'),
                  trailing: Icon(Icons.chevron_right, size: 18, color: palette.subtle),
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
                    fondo: SemanticTone.of(contextoHoja, SemanticKind.danger).bg,
                  ),
                  title: Text(
                    'Cerrar sesión',
                    style: TextStyle(color: danger, fontWeight: FontWeight.w600),
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

  const _IconoDeMenu({required this.icono, required this.color, required this.fondo});

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
                _IconoDeMenu(
                  icono: destino.icon,
                  color: activo ? palette.primary : palette.muted,
                  fondo: activo ? palette.primaryTint : palette.surfaceAlt,
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
