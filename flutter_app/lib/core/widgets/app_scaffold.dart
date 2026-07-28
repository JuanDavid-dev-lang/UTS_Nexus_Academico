import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../theme/app_theme.dart';

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
  final IconData icon;
  final IconData activeIcon;

  const NavDestination({
    required this.route,
    required this.label,
    required this.icon,
    required this.activeIcon,
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
    activeIcon: Icons.space_dashboard,
  ),
  NavDestination(
    route: '/subjects',
    label: 'Materias',
    icon: Icons.menu_book_outlined,
    activeIcon: Icons.menu_book,
  ),
  NavDestination(
    route: '/attendance',
    label: 'Asistencia',
    icon: Icons.fact_check_outlined,
    activeIcon: Icons.fact_check,
  ),
  NavDestination(
    route: '/ai',
    label: 'Asistente',
    icon: Icons.auto_awesome_outlined,
    activeIcon: Icons.auto_awesome,
  ),
];

/// El resto, accesible desde "Más".
const secondaryDestinations = <NavDestination>[
  NavDestination(
    route: '/grades',
    label: 'Consolidado de notas',
    icon: Icons.school_outlined,
    activeIcon: Icons.school,
  ),
  NavDestination(
    route: '/students',
    label: 'Directorio de estudiantes',
    icon: Icons.people_outline,
    activeIcon: Icons.people,
  ),
  NavDestination(
    route: '/schedule',
    label: 'Horario',
    icon: Icons.schedule_outlined,
    activeIcon: Icons.schedule,
  ),
  NavDestination(
    route: '/reports',
    label: 'Reportes',
    icon: Icons.description_outlined,
    activeIcon: Icons.description,
  ),
  NavDestination(
    route: '/notifications',
    label: 'Notificaciones',
    icon: Icons.notifications_outlined,
    activeIcon: Icons.notifications,
  ),
  NavDestination(
    route: '/settings',
    label: 'Ajustes',
    icon: Icons.settings_outlined,
    activeIcon: Icons.settings,
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

class AppScaffold extends StatelessWidget {
  final Widget child;
  const AppScaffold({super.key, required this.child});

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
              onDestinationSelected: (i) => context.go(_allDestinations[i].route),
              labelType: NavigationRailLabelType.all,
              destinations: [
                for (final destination in _allDestinations)
                  NavigationRailDestination(
                    icon: Icon(destination.icon),
                    selectedIcon: Icon(destination.activeIcon),
                    label: Text(destination.label),
                  ),
              ],
            ),
            const VerticalDivider(width: 1),
            Expanded(child: child),
          ],
        ),
      );
    }

    // En un teléfono: cuatro destinos + "Más".
    final primaryIndex = _indexForRoute(primaryDestinations, route);
    final isSecondary = primaryIndex < 0;

    return Scaffold(
      body: child,
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
              selectedIcon: Icon(destination.activeIcon),
              label: destination.label,
            ),
          const NavigationDestination(
            icon: Icon(Icons.more_horiz),
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
      builder: (sheetContext) {
        final isDark = Theme.of(sheetContext).brightness == Brightness.dark;
        final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;

        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 0, 24, 8),
                child: Text(
                  'MÁS SECCIONES',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.8,
                    color: muted,
                  ),
                ),
              ),
              for (final destination in secondaryDestinations)
                ListTile(
                  leading: Icon(
                    currentRoute == destination.route
                        ? destination.activeIcon
                        : destination.icon,
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
              const SizedBox(height: 8),
            ],
          ),
        );
      },
    );
  }
}
