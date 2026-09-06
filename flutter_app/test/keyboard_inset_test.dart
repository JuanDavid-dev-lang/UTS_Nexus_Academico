import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:uts_academico/core/widgets/keyboard_inset.dart';

/// Lo que estas pruebas fijan es un comportamiento de **rendimiento**, que es
/// la clase de cosa que se rompe sin que nada se vea mal: quitar
/// `KeyboardInset` y leer el inset en el formulario funciona igual de bien en
/// una captura y reconstruye el árbol entero sesenta veces por segundo
/// mientras sube el teclado.
///
/// Por eso se cuentan reconstrucciones, no píxeles.
void main() {
  /// Envuelve el sujeto con un `viewInsets` simulado y controlable.
  Widget conTeclado(double alto, Widget hijo) => MediaQuery(
        data: MediaQueryData(viewInsets: EdgeInsets.only(bottom: alto)),
        child: Directionality(textDirection: TextDirection.ltr, child: hijo),
      );

  testWidgets('desplaza el contenido lo que ocupa el teclado', (tester) async {
    await tester.pumpWidget(conTeclado(300, const KeyboardInset(child: SizedBox())));
    final padding = tester.widget<Padding>(find.byType(Padding));
    expect((padding.padding as EdgeInsets).bottom, 300);
  });

  testWidgets('sin teclado no separa nada, ni siquiera el extra', (tester) async {
    // `extra` es para que una barra de acciones no quede pegada al borde del
    // teclado. Sin teclado no hay borde del que separarse, y aplicarlo dejaría
    // un hueco permanente al final de la pantalla.
    await tester.pumpWidget(conTeclado(0, const KeyboardInset(extra: 16, child: SizedBox())));
    final padding = tester.widget<Padding>(find.byType(Padding));
    expect((padding.padding as EdgeInsets).bottom, 0);
  });

  testWidgets('con teclado suma el extra', (tester) async {
    await tester.pumpWidget(conTeclado(280, const KeyboardInset(extra: 16, child: SizedBox())));
    final padding = tester.widget<Padding>(find.byType(Padding));
    expect((padding.padding as EdgeInsets).bottom, 296);
  });

  testWidgets('el hijo NO se reconstruye cuando cambia la altura del teclado', (tester) async {
    // Esta es la prueba que importa. Android reporta la altura fotograma a
    // fotograma: si el hijo se reconstruyera, serían ~60 reconstrucciones del
    // formulario entero por cada apertura del teclado.
    var construcciones = 0;
    final hijo = Builder(builder: (_) {
      construcciones++;
      return const SizedBox();
    });

    await tester.pumpWidget(conTeclado(0, KeyboardInset(child: hijo)));
    expect(construcciones, 1);

    for (final alto in [40.0, 120.0, 200.0, 280.0]) {
      await tester.pumpWidget(conTeclado(alto, KeyboardInset(child: hijo)));
    }

    // El padding cambió cuatro veces; el hijo se construyó una sola.
    final padding = tester.widget<Padding>(find.byType(Padding));
    expect((padding.padding as EdgeInsets).bottom, 280);
    expect(construcciones, 1);
  });
}
