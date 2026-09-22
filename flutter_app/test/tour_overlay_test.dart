// El recorrido señalado del móvil: arranca solo la primera vez, ilumina la
// pestaña de la que habla, abre la hoja de «Más» para las secciones que viven
// ahí y al saltar cierra todo y marca visto. Lo que rompería en silencio: un
// paso cuyo objetivo no se encuentra (queda centrado sin aviso) o una hoja de
// «Más» que se quede abierta debajo. Se usa `pump` con tiempo y no
// `pumpAndSettle`: Rubri y el anillo respiran sin parar.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uts_academico/core/auth/auth_controller.dart';
import 'package:uts_academico/core/auth/auth_repository.dart';
import 'package:uts_academico/core/auth/auth_user.dart';
import 'package:uts_academico/core/auth/session_storage.dart';
import 'package:uts_academico/core/data/providers.dart';
import 'package:uts_academico/core/network/realtime_service.dart';
import 'package:uts_academico/core/widgets/app_scaffold.dart';
import 'package:uts_academico/features/tutorial/tour_overlay.dart';
import 'package:uts_academico/features/tutorial/tutorial_page.dart';

class _BranchNavigation implements BranchNavigation {
  @override
  int currentIndex = 0;

  @override
  void goBranch(int index, {bool initialLocation = false}) {
    currentIndex = index;
  }
}

class _TestAuthController extends AuthController {
  _TestAuthController()
    : super(AuthRepository(), SessionStorage(), RealtimeService.instance) {
    state = AuthState(
      loading: false,
      user: AuthUser(
        id: 'usuario-tour',
        email: 'docente@uts.edu.co',
        role: 'PROFESSOR',
        fullName: 'Docente de prueba',
      ),
    );
  }
}

Future<void> _asentar(WidgetTester tester) async {
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 120));
  }
}

void main() {
  late GoRouter router;

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    router = GoRouter(
      initialLocation: '/',
      routes: [
        StatefulShellRoute.indexedStack(
          builder: (context, state, shell) => AppScaffold(
            navigationShell: shell,
            branchNavigation: _BranchNavigation(),
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
  });

  tearDown(() => router.dispose());

  Widget app() => ProviderScope(
    overrides: [
      authControllerProvider.overrideWith((ref) => _TestAuthController()),
      esDirectorProvider.overrideWithValue(false),
    ],
    child: MaterialApp.router(routerConfig: router),
  );

  testWidgets(
    'arranca la primera vez, señala la barra, abre Más y marca visto',
    (tester) async {
      tester.view.physicalSize = const Size(360, 800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);

      await tester.pumpWidget(app());
      await _asentar(tester);

      expect(find.byType(TourOverlay), findsOneWidget);
      expect(find.text('Paso 1 de ${pasos.length}'), findsOneWidget);

      // Inicio: pestaña de la barra, con hueco.
      await tester.tap(find.text('Siguiente'));
      await _asentar(tester);
      var overlay = tester.widget<TourOverlay>(find.byType(TourOverlay));
      expect(overlay.paso.ruta, '/');
      expect(overlay.objetivo, isNotNull, reason: 'la pestaña Inicio se mide');

      // Hasta el primer paso que vive en «Más»: la hoja se abre sola.
      final indiceCelda = pasos.indexWhere((p) => p.ruta == '/grades');
      while (tester.widget<TourOverlay>(find.byType(TourOverlay)).indice <
          indiceCelda) {
        final antes = tester.widget<TourOverlay>(find.byType(TourOverlay));
        await tester.tap(find.text('Siguiente'));
        await _asentar(tester);
        expect(
          find.byType(TourOverlay),
          findsOneWidget,
          reason: 'tras el paso ${antes.indice} (${antes.paso.titulo})',
        );
      }
      overlay = tester.widget<TourOverlay>(find.byType(TourOverlay));
      expect(overlay.paso.ruta, '/grades');
      expect(find.text('MÁS SECCIONES'), findsOneWidget);
      expect(overlay.objetivo, isNotNull, reason: 'la celda Notas se mide');

      // Saltar cierra el recorrido y la hoja, y no vuelve a arrancar.
      await tester.tap(find.text('Saltar'));
      await _asentar(tester);
      expect(find.byType(TourOverlay), findsNothing);
      expect(find.text('MÁS SECCIONES'), findsNothing);
      expect(await tutorialVisto(), isTrue);
    },
  );

  testWidgets(
    'con tutorial visto no arranca; Ajustes lo pide por el contador',
    (tester) async {
      SharedPreferences.setMockInitialValues({'tutorial_visto': true});
      tester.view.physicalSize = const Size(360, 800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);

      final contenedor = ProviderContainer(
        overrides: [
          authControllerProvider.overrideWith((ref) => _TestAuthController()),
          esDirectorProvider.overrideWithValue(false),
        ],
      );
      addTearDown(contenedor.dispose);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: contenedor,
          child: MaterialApp.router(routerConfig: router),
        ),
      );
      await _asentar(tester);
      expect(find.byType(TourOverlay), findsNothing);

      contenedor.read(tourSolicitadoProvider.notifier).state++;
      await _asentar(tester);
      expect(find.byType(TourOverlay), findsOneWidget);
    },
  );
}
