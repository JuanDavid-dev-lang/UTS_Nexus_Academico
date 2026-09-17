/// Que el bloque de Apariencia quepa en un teléfono estrecho.
///
/// La cuadrícula de tonos cortaba los nombres ("Institucio…", "Color pro…") y
/// dejaba una segunda fila coja: en una pantalla de 360 dp no cabían seis
/// círculos con etiqueta. Un desbordamiento tampoco falla solo —Flutter pinta
/// la raya amarilla y sigue—, así que se comprueba aquí.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:uts_academico/core/theme/app_theme.dart';
import 'package:uts_academico/core/theme/appearance/appearance_preferences.dart';
import 'package:uts_academico/core/theme/appearance/palettes.dart';
import 'package:uts_academico/core/theme/theme_controller.dart';
import 'package:uts_academico/core/widgets/ui_kit.dart';
import 'package:uts_academico/features/settings/widgets/appearance_section.dart';

/// El teléfono más estrecho que se usa en la UTS; DESIGN.md §16 parte de aquí.
const _telefonoEstrecho = Size(360, 800);

Widget _app(AparienciaController controlador, {double escalaTexto = 1}) =>
    ProviderScope(
      overrides: [
        aparienciaProvider.overrideWith((ref) => controlador),
        themeModeProvider.overrideWith(
          (ref) => ThemeModeController(ThemeMode.light),
        ),
      ],
      child: MaterialApp(
        theme: AppTheme.construir(controlador.state, Brightness.light),
        home: const Scaffold(
          body: SingleChildScrollView(
            padding: EdgeInsets.all(16),
            child: AppearanceSection(),
          ),
        ),
      ),
    );

void main() {
  testWidgets('cabe en 360 dp sin desbordar y con los nombres completos', (
    tester,
  ) async {
    tester.view.physicalSize = _telefonoEstrecho;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      _app(AparienciaController(AparienciaPreferencias.defecto)),
    );
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    for (final tono in [...tonosPredefinidos, Tono.personalizado]) {
      expect(find.text(tono.etiqueta), findsOneWidget);
    }
  });

  testWidgets('el color propio abre su editor y sigue cabiendo', (
    tester,
  ) async {
    tester.view.physicalSize = _telefonoEstrecho;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    final controlador = AparienciaController(AparienciaPreferencias.defecto);
    await tester.pumpWidget(_app(controlador));
    await tester.pumpAndSettle();

    await tester.tap(find.text(Tono.personalizado.etiqueta));
    await tester.pumpAndSettle();

    expect(controlador.state.tono, Tono.personalizado);
    expect(tester.takeException(), isNull);
  });

  testWidgets('sigue cabiendo con el texto al 125 %', (tester) async {
    tester.view.physicalSize = _telefonoEstrecho;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      _app(
        AparienciaController(AparienciaPreferencias.defecto),
        escalaTexto: 1.25,
      ),
    );
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    // La vista previa enseña la superficie de marca, que es donde el tono se
    // ve de verdad: si desaparece, la pantalla deja de mostrar lo que cambia.
    expect(find.text('Clase en curso'), findsOneWidget);
  });

  testWidgets('las tarjetas ocupan el ancho de la página, no el de su texto', (
    tester,
  ) async {
    // En una pantalla ancha: en 360 dp el contenido ya llena la línea y una
    // tarjeta encogida mide lo mismo que una estirada, así que la prueba no
    // distinguiría nada. Con `CrossAxisAlignment.start` cada tarjeta se ajusta
    // a su contenido y la vista previa —la más estrecha— queda a media
    // pantalla, con un hueco a la derecha.
    const pantalla = Size(600, 900);
    tester.view.physicalSize = pantalla;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      _app(AparienciaController(AparienciaPreferencias.defecto)),
    );
    await tester.pumpAndSettle();

    final anchoUtil = pantalla.width - 32;
    for (final tarjeta in find.byType(AppCard).evaluate()) {
      expect(tester.getSize(find.byWidget(tarjeta.widget)).width, anchoUtil);
    }

    // Y dentro de la vista previa, la cabecera de marca llega a los dos bordes
    // de su tarjeta: es el bloque donde el tono se ve, y a medio ancho parecía
    // un recuadro suelto.
    // Menos el borde de 1 px de la tarjeta a cada lado.
    expect(
      tester.getSize(find.byType(BrandSurface).first).width,
      closeTo(anchoUtil, 2),
    );
  });
}
