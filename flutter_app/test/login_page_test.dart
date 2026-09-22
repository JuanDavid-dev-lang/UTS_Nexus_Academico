// La pantalla de acceso: fondo de marca que respira y una apertura
// escalonada. Lo que rompería en silencio: un desborde en un teléfono pequeño
// con el teclado abierto (el formulario es lo único que hay que poder tocar),
// una pieza que se quede transparente tras la apertura, o «reducir
// movimiento» que no apague nada. Ninguna de las tres lanza una excepción en
// producción: se ven como una pantalla a medio pintar.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uts_academico/core/network/connection_controller.dart';
import 'package:uts_academico/core/theme/app_theme.dart';
import 'package:uts_academico/core/theme/appearance/appearance_preferences.dart';
import 'package:uts_academico/core/widgets/rubri.dart';
import 'package:uts_academico/features/auth/login_page.dart';

/// Controlador sin red: se queda en la fase que se le da.
class _ConexionFija extends ConnectionController {
  _ConexionFija(this._fase) : super();
  final ConnectionPhase _fase;

  @override
  Future<void> initialize() async {
    state = ServerConnectionState(phase: _fase);
  }
}

Future<void> _montar(
  WidgetTester tester, {
  Brightness brillo = Brightness.light,
  bool sinMovimiento = false,
  ConnectionPhase fase = ConnectionPhase.connected,
  double teclado = 0,
}) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = const Size(360, 640);
  tester.view.viewInsets = FakeViewPadding(bottom: teclado);
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        connectionControllerProvider.overrideWith((ref) => _ConexionFija(fase)),
      ],
      child: MaterialApp(
        theme: AppTheme.construir(const AparienciaPreferencias(), brillo),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(disableAnimations: sinMovimiento),
          child: child!,
        ),
        home: const LoginPage(),
      ),
    ),
  );
}

/// Rubri y la aurora respiran sin parar: `pumpAndSettle` no termina con el
/// movimiento activado, así que se deja correr la apertura entera a mano.
Future<void> _dejarAbrir(WidgetTester tester) async {
  for (var i = 0; i < 10; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

bool _todoOpaco(WidgetTester tester) => tester
    .widgetList<Opacity>(find.byType(Opacity))
    .every((o) => o.opacity == 1);

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  for (final brillo in Brightness.values) {
    testWidgets('360×640 con teclado, sin desbordes (${brillo.name})', (
      tester,
    ) async {
      await _montar(
        tester,
        brillo: brillo,
        fase: ConnectionPhase.notFound,
        teclado: 280,
      );
      await _dejarAbrir(tester);

      expect(tester.takeException(), isNull);
      expect(find.text('Entrar'), findsOneWidget);
      expect(_todoOpaco(tester), isTrue);
    });
  }

  testWidgets('reducir movimiento: todo quieto y visible desde el principio', (
    tester,
  ) async {
    await _montar(tester, sinMovimiento: true);
    await tester.pump();

    // Sin nada que anime, la pantalla se asienta; con la aurora o la apertura
    // en marcha esto agotaría el tiempo.
    await tester.pumpAndSettle();
    expect(_todoOpaco(tester), isTrue);
    expect(find.text('Bienvenido de vuelta'), findsOneWidget);
  });

  testWidgets('el formulario está en el árbol semántico durante la apertura', (
    tester,
  ) async {
    final semantica = tester.ensureSemantics();
    await _montar(tester);
    await tester.pump(const Duration(milliseconds: 16));

    expect(find.bySemanticsLabel('Correo institucional'), findsOneWidget);
    semantica.dispose();
  });

  testWidgets('sin servidor, Rubri pone la cara de sin conexión', (
    tester,
  ) async {
    await _montar(tester, fase: ConnectionPhase.notFound);
    await _dejarAbrir(tester);

    expect(
      find.byWidgetPredicate(
        (w) => w is Rubri && w.emotion == RubriEmotion.offline,
      ),
      findsOneWidget,
    );

    await tester.ensureVisible(find.text('Escribir dirección'));
    await tester.tap(find.text('Escribir dirección'));
    await tester.pump();
    expect(find.text('Dirección del servidor'), findsOneWidget);
  });
}
