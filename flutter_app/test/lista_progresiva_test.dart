import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:uts_academico/core/theme/app_theme.dart';
import 'package:uts_academico/core/widgets/lista_progresiva.dart';

/// Lo que se fija aquí es el comportamiento que se rompe en silencio: si la
/// guarda contra peticiones solapadas desaparece, la lista sigue viéndose
/// perfecta y pide la misma página tres veces.
void main() {
  Widget envolver(Widget hijo) => MaterialApp(
        theme: AppTheme.light,
        home: Scaffold(body: SizedBox(height: 600, child: hijo)),
      );

  ListaProgresiva<int> lista({
    required List<int> items,
    required bool hayMas,
    bool cargandoMas = false,
    String? error,
    VoidCallback? onCargarMas,
  }) {
    return ListaProgresiva<int>(
      items: items,
      hayMas: hayMas,
      cargandoMas: cargandoMas,
      errorAlCargarMas: error,
      onCargarMas: onCargarMas ?? () {},
      constructor: (_, valor, __) =>
          SizedBox(height: 56, child: Text('fila $valor')),
    );
  }

  testWidgets('pide la página siguiente al acercarse al final', (tester) async {
    var peticiones = 0;
    await tester.pumpWidget(envolver(lista(
      items: List.generate(30, (i) => i),
      hayMas: true,
      onCargarMas: () => peticiones++,
    )));
    await tester.pump();

    expect(peticiones, 0, reason: 'sin desplazar no debe pedir nada');

    await tester.drag(find.byType(ListView), const Offset(0, -1200));
    await tester.pump();

    expect(peticiones, greaterThan(0));
  });

  testWidgets('no pide nada si ya no queda más', (tester) async {
    var peticiones = 0;
    await tester.pumpWidget(envolver(lista(
      items: List.generate(30, (i) => i),
      hayMas: false,
      onCargarMas: () => peticiones++,
    )));
    await tester.drag(find.byType(ListView), const Offset(0, -2000));
    await tester.pump();

    expect(peticiones, 0);
  });

  testWidgets('no pide nada mientras ya está cargando', (tester) async {
    // Es la guarda que impide que un desplazamiento rápido dispare la misma
    // página tres veces y duplique filas.
    var peticiones = 0;
    await tester.pumpWidget(envolver(lista(
      items: List.generate(30, (i) => i),
      hayMas: true,
      cargandoMas: true,
      onCargarMas: () => peticiones++,
    )));
    await tester.drag(find.byType(ListView), const Offset(0, -2000));
    await tester.pump();

    expect(peticiones, 0);
  });

  testWidgets('tras un fallo no reintenta solo: espera al botón', (tester) async {
    // Sin esto, una caída de red al final de la lista se convierte en un bucle
    // de peticiones fallidas mientras el dedo siga en la zona de disparo.
    var peticiones = 0;
    await tester.pumpWidget(envolver(lista(
      items: List.generate(30, (i) => i),
      hayMas: true,
      error: 'sin red',
      onCargarMas: () => peticiones++,
    )));
    await tester.drag(find.byType(ListView), const Offset(0, -2000));
    await tester.pump();

    expect(peticiones, 0);
    expect(find.text('Reintentar'), findsOneWidget);
  });

  testWidgets('el botón de reintentar sí vuelve a pedir', (tester) async {
    var peticiones = 0;
    await tester.pumpWidget(envolver(lista(
      items: List.generate(3, (i) => i),
      hayMas: true,
      error: 'sin red',
      onCargarMas: () => peticiones++,
    )));
    await tester.tap(find.text('Reintentar'));
    await tester.pump();

    expect(peticiones, 1);
  });

  testWidgets('con todo cargado dice cuántos hay', (tester) async {
    // Evita la duda de si la lista terminó o se quedó a medias.
    await tester.pumpWidget(envolver(lista(
      items: List.generate(4, (i) => i),
      hayMas: false,
    )));
    await tester.pumpAndSettle();

    expect(find.text('4 resultados'), findsOneWidget);
  });

  testWidgets('una lista vacía y completa no pinta el pie', (tester) async {
    await tester.pumpWidget(envolver(lista(items: const [], hayMas: false)));
    await tester.pumpAndSettle();

    expect(find.textContaining('resultado'), findsNothing);
  });

  testWidgets('usa ListView.builder, no construye todos los hijos', (tester) async {
    // `ListView(children: [...])` construiría las mil filas aunque se vean
    // doce. La comprobación es indirecta pero es la que importa.
    await tester.pumpWidget(envolver(lista(
      items: List.generate(1000, (i) => i),
      hayMas: false,
    )));
    await tester.pump();

    expect(find.text('fila 0'), findsOneWidget);
    expect(find.text('fila 999'), findsNothing);
  });
}
