import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../features/tutorial/tutorial_page.dart';
import 'package:go_router/go_router.dart';

import '../data/providers.dart';
import '../theme/app_theme.dart';
import './offline_banner.dart';
import './session_menu.dart';

/// Estructura de navegación.
///
/// La versión anterior tenía dos defectos que se notaban al primer toque:
///
///  - `selectedIndex: 0` estaba fijo, así que la barra nunca marcaba en qué
///    pantalla estabas. Ahora el índice se deriva de la ruta activa, que es la
///    única fuente de verdad.
///  - Metía nueve destinos en una `NavigationBar`. Material especifica entre
///    tres y cinco; con nueve, las etiquetas se recortan y los toques se
///    solapan. Ahora hay cuatro destinos principales y un botón "Más" que abre
///    el resto en una hoja inferior.
///
/// La lógica de navegación estaba además duplicada entre el riel lateral y la
/// barra inferior, con dos `switch` que había que mantener en paralelo. Ahora
/// hay una sola lista de destinos.
class NavDestination {
  final String route;
  final String label;

  /// Siempre en trazo (outline): la selección la comunican el indicador y el
  /// color, no un cambio de estilo de icono.
  final IconData icon;

  const NavDestination({
    required this.route,
    required this.label,
    required this.icon,
  });
}

/// Rutas de las ramas del shell, **en el mismo orden que en `app.dart`**.
///
/// Es el contrato entre el router y este menú: la rama número N atiende a
/// `rutasDeRama[N]`. Se declara aquí y no en el router porque es lo que el
/// menú necesita para traducir "el docente tocó Materias" al índice de rama
/// que entiende `goBranch`. Cambiar el orden en un sitio y no en el otro
/// mandaría cada pestaña a la pantalla equivocada, así que va en una sola
/// lista y el router la usa para generar sus claves.
const rutasDeRama = <String>[
  '/',
  '/subjects',
  '/attendance',
  '/ai',
  '/agenda',
  '/grades',
  '/students',
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

/// Destinos que caben en la barra inferior de un teléfono.
///
/// "Materias" ocupa el lugar que antes tenía "Estudiantes": desde ahí se llega
/// a los estudiantes de cada materia, que es como los busca un docente.
const primaryDestinations = <NavDestination>[
  NavDestination(
    route: '/',
    label: 'Panel',
    icon: Icons.space_dashboard_outlined,
  ),
  NavDestination(
    route: '/subjects',
    label: 'Materias',
    icon: Icons.menu_book_outlined,
  ),
  NavDestination(
    route: '/attendance',
    label: 'Asistencia',
    icon: Icons.fact_check_outlined,
  ),
  NavDestination(
    route: '/ai',
    label: 'Asistente',
    icon: Icons.auto_awesome_outlined,
  ),
];

/// El resto, accesible desde "Más".
const secondaryDestinations = <NavDestination>[
  // Primera de la lista: es a donde lleva el aviso de "tu clase empieza en 15
  // minutos", y es lo que un docente consulta a diario.
  NavDestination(
    route: '/agenda',
    label: 'Agenda y clases',
    icon: Icons.calendar_month_outlined,
  ),
  NavDestination(
    route: '/grades',
    label: 'Consolidado de notas',
    icon: Icons.school_outlined,
  ),
  NavDestination(
    route: '/students',
    label: 'Directorio de estudiantes',
    icon: Icons.people_outline,
  ),
  NavDestination(
    route: '/schedule',
    label: 'Horario',
    icon: Icons.schedule_outlined,
  ),
  NavDestination(
    route: '/reports',
    label: 'Reportes',
    icon: Icons.description_outlined,
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
    label: 'Ajustes',
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
  /// "llévame al principio de esto".
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

    // `sizeOf` y no `of`: este widget envuelve TODAS las pantallas con sesión,
    // y `MediaQuery.of` lo suscribe al MediaQueryData entero. El teclado anima
    // `viewInsets` fotograma a fotograma, así que cada apertura reconstruía la
    // barra de navegación y el riel —con sus catorce destinos— sesenta veces
    // por segundo, para leer un ancho que no había cambiado.
    final isWide = MediaQuery.sizeOf(context).width > 900;

    // La sección de trabajos de grado solo existe para quien la puede usar.
    // La rama existe igualmente; lo que se esconde es la entrada del menú.
    final esDirector = ref.watch(esDirectorProvider);
    final secundarios = [
      ...secondaryDestinations,
      if (esDirector) thesisDestination,
    ];
    final allDestinations = [...primaryDestinations, ...secundarios];

    if (isWide) {
      final index = allDestinations.indexWhere((d) => d.route == rutaActual);
      return Scaffold(
        body: Row(
          children: [
            NavigationRail(
              // NavigationRail exige un índice válido; -1 lo haría fallar.
              selectedIndex: index < 0 ? 0 : index,
              onDestinationSelected: (i) => _irA(allDestinations[i].route),
              labelType: NavigationRailLabelType.all,
              destinations: [
                for (final destination in allDestinations)
                  NavigationRailDestination(
                    icon: Icon(destination.icon),
                    label: Text(destination.label),
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

    // En un teléfono: cuatro destinos + "Más".
    final primaryIndex =
        primaryDestinations.indexWhere((d) => d.route == rutaActual);
    final isSecondary = primaryIndex < 0;

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
        // En una pantalla secundaria se resalta "Más", que es desde donde llegó.
        selectedIndex: isSecondary ? primaryDestinations.length : primaryIndex,
        onDestinationSelected: (index) {
          if (index == primaryDestinations.length) {
            _openMoreSheet(context, rutaActual, secundarios);
            return;
          }
          _irA(primaryDestinations[index].route);
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

  void _openMoreSheet(
    BuildContext context,
    String currentRoute,
    List<NavDestination> secundarios,
  ) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      // La hoja lista siete secciones más perfil y salida. En un teléfono bajo,
      // o con el tamaño de fuente del sistema subido, esa columna no cabe: sin
      // desplazamiento propio Flutter la recorta y las últimas filas dejan de
      // existir. `isScrollControlled` es lo que le permite pasar de la mitad de
      // la pantalla; el tope evita que tape la pantalla entera.
      isScrollControlled: true,
      constraints: BoxConstraints(
        maxHeight: MediaQuery.sizeOf(context).height * 0.85,
      ),
      builder: (sheetContext) {
        final isDark = Theme.of(sheetContext).brightness == Brightness.dark;
        final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;
        // El rojo canónico está calibrado para texto sobre blanco; en oscuro
        // hay que aclararlo o cae por debajo del AA que exige DESIGN.md.
        final danger = isDark ? AppColors.dangerDark : AppColors.danger;

        return SafeArea(
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(24, 0, 24, 8),
                  child: Text(
                    'MÁS SECCIONES',
                    style: AppType.captionStrong.copyWith(
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.8,
                      color: muted,
                    ),
                  ),
                ),
                for (final destination in secundarios)
                  ListTile(
                    leading: Icon(
                      destination.icon,
                      color: currentRoute == destination.route
                          ? Theme.of(sheetContext).colorScheme.primary
                          : null,
                    ),
                    title: Text(destination.label),
                    selected: currentRoute == destination.route,
                    onTap: () {
                      Navigator.of(sheetContext).pop();
                      _irA(destination.route);
                    },
                  ),

                // La sesión va abajo y separada: no es "otra sección más", y
                // cerrarla por error al buscar Reportes sería caro.
                const Divider(height: 20),
                ListTile(
                  leading: const Icon(Icons.person_outline),
                  title: const Text('Mi perfil'),
                  selected: currentRoute == '/profile',
                  onTap: () {
                    Navigator.of(sheetContext).pop();
                    _irA('/profile');
                  },
                ),
                ListTile(
                  leading: Icon(Icons.logout_outlined, color: danger),
                  title: Text('Cerrar sesión', style: TextStyle(color: danger)),
                  onTap: () async {
                    Navigator.of(sheetContext).pop();
                    await confirmLogout(context, ref);
                  },
                ),
                const SizedBox(height: 8),
              ],
            ),
          ),
        );
      },
    );
  }
}
