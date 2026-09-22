// El tutorial del móvil: cabe en el teléfono más estrecho en todas sus
// páginas, se recorre entero con «Siguiente» y al terminar queda marcado como
// visto. El parallax va atado al gesto, así que aquí se comprueba que ninguna
// página desborde ni lance nada mientras se avanza, que es lo que rompería en
// silencio con un texto más largo o un icono más grande. Se usa `pump` con
// tiempo y no `pumpAndSettle`: Rubri flota sin parar y nunca se asentaría.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uts_academico/core/theme/app_theme.dart';
import 'package:uts_academico/core/theme/appearance/appearance_preferences.dart';
import 'package:uts_academico/features/tutorial/tutorial_page.dart';

const _telefonoEstrecho = Size(360, 800);

Widget _app({bool reducirMovimiento = false}) => MaterialApp(
  theme: AppTheme.construir(
    AparienciaPreferencias.defecto.copyWith(
      reducirMovimiento: reducirMovimiento,
    ),
    Brightness.light,
  ),
  builder: (context, child) => MediaQuery(
    data: MediaQuery.of(context).copyWith(disableAnimations: reducirMovimiento),
    child: child ?? const SizedBox.shrink(),
  ),
  home: const TutorialPage(),
);

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets(
    'recorre todas las páginas en 360 dp sin desbordar y marca visto',
    (tester) async {
      tester.view.physicalSize = _telefonoEstrecho;
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);

      await tester.pumpWidget(_app());
      await _asentar(tester);
      expect(find.text('Paso 1 de ${pasos.length}'), findsOneWidget);
      expect(find.text(pasos.first.titulo), findsOneWidget);

      for (var i = 1; i < pasos.length; i++) {
        await tester.tap(find.text('Siguiente'));
        await _asentar(tester);
        expect(tester.takeException(), isNull, reason: 'página ${i + 1}');
        expect(find.text('Paso ${i + 1} de ${pasos.length}'), findsOneWidget);
        expect(find.text(pasos[i].titulo), findsOneWidget);
      }

      expect(find.text('Empezar'), findsOneWidget);
      await tester.tap(find.text('Empezar'));
      await _asentar(tester);
      expect(await tutorialVisto(), isTrue);
    },
  );

  testWidgets('con reducir movimiento las páginas saltan y no falla nada', (
    tester,
  ) async {
    tester.view.physicalSize = _telefonoEstrecho;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(_app(reducirMovimiento: true));
    await _asentar(tester);
    await tester.tap(find.text('Siguiente'));
    await tester.pump();
    expect(tester.takeException(), isNull);
    expect(find.text(pasos[1].titulo), findsOneWidget);
  });

  testWidgets('Atrás vuelve a la página anterior', (tester) async {
    tester.view.physicalSize = _telefonoEstrecho;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(_app());
    await _asentar(tester);
    await tester.tap(find.text('Siguiente'));
    await _asentar(tester);
    await tester.tap(find.text('Atrás'));
    await _asentar(tester);
    expect(find.text('Paso 1 de ${pasos.length}'), findsOneWidget);
  });
}

/// Varios fotogramas con tiempo: una animación de página necesita más de uno
/// para terminar y avisar del cambio.
Future<void> _asentar(WidgetTester tester) async {
  for (var i = 0; i < 6; i++) {
    await tester.pump(const Duration(milliseconds: 120));
  }
}
