import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../features/tutorial/tutorial_page.dart';
import 'package:go_router/go_router.dart';

import '../theme/app_theme.dart';
import 'offline_banner.dart';
import 'session_menu.dart';

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

const _allDestinations = [...primaryDestinations, ...secondaryDestinations];

/// Índice del destino al que pertenece una ruta.
///
/// Compara por prefijo, no por igualdad: estando en `/subjects/abc123` sigue
/// activo el destino "Materias". Con igualdad exacta, entrar al detalle de una
/// materia apagaba la pestaña y encendía "Más", que no es donde está el usuario.
int _indexForRoute(List<NavDestination> destinations, String route) {
  var best = -1;
  var bestLength = -1;

  for (var i = 0; i < destinations.length; i++) {
    final candidate = destinations[i].route;
    final matches = candidate == '/'
        ? route == '/'
        : route == candidate || route.startsWith('$candidate/');

    // La ruta más específica gana, por si dos destinos comparten prefijo.
    if (matches && candidate.length > bestLength) {
      best = i;
      bestLength = candidate.length;
    }
  }
  return best;
}

/// Envoltorio de las pantallas con sesión.
///
/// Es stateful solo por el tutorial: hace falta un punto que se ejecute una vez
/// tras el primer fotograma con sesión iniciada, y este envuelve a todas las
/// pantallas sin repetir el enganche en cada una.
class AppScaffold extends ConsumerStatefulWidget {
  final Widget child;
  const AppScaffold({super.key, required this.child});

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

  @override
  Widget build(BuildContext context) {
    // Ruta activa según el router. Nunca un índice guardado a mano.
    final route = GoRouterState.of(context).uri.path;
    final isWide = MediaQuery.of(context).size.width > 900;

    if (isWide) {
      final index = _indexForRoute(_allDestinations, route);
      return Scaffold(
        body: Row(
          children: [
            NavigationRail(
              // NavigationRail exige un índice válido; -1 lo haría fallar.
              selectedIndex: index < 0 ? 0 : index,
              onDestinationSelected: (i) =>
                  context.go(_allDestinations[i].route),
              labelType: NavigationRailLabelType.all,
              destinations: [
                for (final destination in _allDestinations)
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
                  Expanded(child: widget.child),
                ],
              ),
            ),
          ],
        ),
      );
    }

    // En un teléfono: cuatro destinos + "Más".
    final primaryIndex = _indexForRoute(primaryDestinations, route);
    final isSecondary = primaryIndex < 0;

    return Scaffold(
      // La franja va por encima de la pantalla, no dentro: aplica a todas y
      // ninguna debería tener que acordarse de mostrarla.
      body: Column(
        children: [
          const OfflineBanner(),
          Expanded(child: widget.child),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        // En una pantalla secundaria se resalta "Más", que es desde donde llegó.
        selectedIndex: isSecondary ? primaryDestinations.length : primaryIndex,
        onDestinationSelected: (index) {
          if (index == primaryDestinations.length) {
            _openMoreSheet(context, route);
            return;
          }
          context.go(primaryDestinations[index].route);
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

  void _openMoreSheet(BuildContext context, String currentRoute) {
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
        maxHeight: MediaQuery.of(context).size.height * 0.85,
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
                for (final destination in secondaryDestinations)
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
                      context.go(destination.route);
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
                    context.go('/profile');
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
