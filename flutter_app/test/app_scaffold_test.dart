import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uts_academico/core/widgets/app_scaffold.dart';

class _FakeBranchNavigation implements BranchNavigation {
  @override
  int currentIndex = 0;

  int? receivedIndex;
  bool? receivedInitialLocation;

  @override
  void goBranch(int index, {bool initialLocation = false}) {
    receivedIndex = index;
    receivedInitialLocation = initialLocation;
  }
}

void main() {
  const loadedOrder = <NavDestination>[
    NavDestination(
      route: '/agenda',
      label: 'Agenda',
      icon: Icons.calendar_month_outlined,
    ),
    NavDestination(
      route: '/',
      label: 'Inicio',
      icon: Icons.space_dashboard_outlined,
    ),
    NavDestination(
      route: '/ai',
      label: 'Asistente',
      icon: Icons.auto_awesome_outlined,
    ),
    NavDestination(
      route: '/subjects',
      label: 'Materias',
      icon: Icons.menu_book_outlined,
    ),
  ];

  Widget navigation({
    ValueChanged<String>? onRouteSelected,
    VoidCallback? onMore,
  }) => MaterialApp(
    home: Scaffold(
      bottomNavigationBar: AppMobileNavigation(
        primaryDestinations: loadedOrder,
        currentRoute: '/agenda',
        onRouteSelected: onRouteSelected ?? (_) {},
        onMore: onMore ?? () {},
      ),
    ),
  );

  testWidgets('muestra el orden cargado en los cuatro accesos principales', (
    tester,
  ) async {
    await tester.pumpWidget(navigation());

    final bar = tester.widget<NavigationBar>(find.byType(NavigationBar));
    final labels = bar.destinations
        .whereType<NavigationDestination>()
        .map((destination) => destination.label)
        .toList();
    expect(labels, ['Agenda', 'Inicio', 'Asistente', 'Materias', 'Más']);
  });

  testWidgets('Más permanece como quinto destino y ejecuta su acción', (
    tester,
  ) async {
    var openedMore = false;
    await tester.pumpWidget(navigation(onMore: () => openedMore = true));

    expect(find.text('Más'), findsOneWidget);
    await tester.tap(find.text('Más'));
    await tester.pump();
    expect(openedMore, isTrue);
  });

  testWidgets('un destino reordenado conserva la rama canónica al tocarlo', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({'tutorial_visto': true});
    final branchNavigation = _FakeBranchNavigation();
    late final GoRouter testRouter;
    testRouter = GoRouter(
      initialLocation: '/',
      routes: [
        StatefulShellRoute.indexedStack(
          builder: (context, state, shell) => AppScaffold(
            navigationShell: shell,
            branchNavigation: branchNavigation,
            initialMenuRoutes: loadedOrder
                .map((destination) => destination.route)
                .toList(),
          ),
          branches: [
            for (final route in rutasDeRama)
              StatefulShellBranch(
                routes: [
                  GoRoute(path: route, builder: (_, __) => const SizedBox()),
                ],
              ),
          ],
        ),
        GoRoute(path: '/tutorial', builder: (_, __) => const SizedBox()),
      ],
    );
    addTearDown(testRouter.dispose);

    await tester.pumpWidget(
      ProviderScope(child: MaterialApp.router(routerConfig: testRouter)),
    );
    await tester.pumpAndSettle();

    // Materias está cuarta en la preferencia, pero su rama canónica sigue
    // siendo la 1. El toque atraviesa AppMobileNavigation y _irA; el puerto de
    // producción que envuelve StatefulNavigationShell recibe goBranch(1).
    await tester.tap(find.text('Materias'));
    await tester.pump();
    expect(branchNavigation.receivedIndex, 1);
    expect(branchNavigation.receivedInitialLocation, isFalse);
  });

  test('cambiar de usuario sustituye el orden sin filtrar el anterior', () {
    final visible = menuRoutesWhileLoading(
      previousUserId: 'usuario-a',
      userId: 'usuario-b',
      currentRoutes: const ['/agenda', '/', '/ai', '/subjects'],
      authorizedRoutes: const ['/', '/subjects', '/agenda', '/ai'],
    );

    expect(visible, ['/', '/subjects', '/agenda', '/ai']);
    expect(visible.first, isNot('/agenda'));
  });
}
