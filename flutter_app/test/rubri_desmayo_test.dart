import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:uts_academico/core/theme/app_theme.dart';
import 'package:uts_academico/core/theme/appearance/appearance_preferences.dart';
import 'package:uts_academico/core/widgets/rubri.dart';
import 'package:uts_academico/features/auth/widgets/rubri_del_acceso.dart';
import 'package:uts_academico/features/auth/rubri_desmayo.dart';

ConteoDeToques _tocar(int veces) {
  var conteo = ConteoDeToques.vacio;
  final inicio = DateTime(2026, 10, 5, 12);
  for (var i = 0; i < veces; i++) {
    conteo = registrarToque(
      conteo,
      inicio.add(Duration(milliseconds: i * 200)),
    );
  }
  return conteo;
}

void main() {
  // Mismas reglas que desktop/tests/unit/rubri-desmayo.test.ts.
  test('se desmaya al decimoquinto toque seguido, no antes', () {
    expect(faseDe(_tocar(toquesParaDesmayo - 1).toques), FaseRubri.mareado);
    expect(faseDe(_tocar(toquesParaDesmayo).toques), FaseRubri.desmayado);
  });

  test('reacciona por fases antes de desmayarse', () {
    expect(faseDe(_tocar(1).toques), FaseRubri.normal);
    expect(faseDe(_tocar(6).toques), FaseRubri.molesto);
    expect(faseDe(_tocar(11).toques), FaseRubri.mareado);
  });

  test('una pausa larga entre toques empieza la cuenta de cero', () {
    final casi = _tocar(14);
    final tarde = registrarToque(
      casi,
      casi.ultimo!.add(pausaQueReinicia + const Duration(milliseconds: 1)),
    );
    expect(tarde.toques, 1);
  });

  test('no pasa del tope aunque se siga tocando', () {
    expect(_tocar(40).toques, toquesParaDesmayo);
  });

  testWidgets('quince toques lo desmayan y se levanta solo', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.construir(
          const AparienciaPreferencias(),
          Brightness.light,
        ),
        home: const Scaffold(
          body: Center(
            child: RubriDelAcceso(emocion: RubriEmotion.happy, size: 96),
          ),
        ),
      ),
    );

    for (var i = 0; i < toquesParaDesmayo - 1; i++) {
      await tester.tap(find.byType(Rubri));
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(find.text('Uff… dame un momento'), findsNothing);

    await tester.tap(find.byType(Rubri));
    await tester.pump(const Duration(milliseconds: 600));
    expect(find.text('Uff… dame un momento'), findsOneWidget);
    expect(
      tester.widget<Rubri>(find.byType(Rubri)).emotion,
      RubriEmotion.offline,
    );

    await tester.pump(duracionDesmayo);
    await tester.pump(const Duration(milliseconds: 600));
    expect(find.text('Uff… dame un momento'), findsNothing);
    expect(
      tester.widget<Rubri>(find.byType(Rubri)).emotion,
      RubriEmotion.happy,
    );
  });
}
