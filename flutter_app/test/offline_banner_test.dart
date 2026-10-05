/// La franja de la bandeja de salida: que diga cuánto hay sin enviar y que se
/// pueda abrir la lista para actuar sobre ello.
///
/// Es lo único que le dice al docente que lo que anotó sin conexión sigue en el
/// teléfono y no ha llegado a ninguna parte.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:uts_academico/core/sync/outbox_entry.dart';
import 'package:uts_academico/core/sync/outbox_service.dart';
import 'package:uts_academico/core/theme/app_theme.dart';
import 'package:uts_academico/core/theme/appearance/appearance_preferences.dart';
import 'package:uts_academico/core/widgets/offline_banner.dart';

OutboxEntry entrada(
  String id, {
  OutboxEstado estado = OutboxEstado.pendiente,
  OutboxError? error,
}) => OutboxEntry(
  id: id,
  userId: 'u1',
  createdAt: DateTime.utc(2026, 10, 5),
  kind: OutboxKind.gradeUpsert,
  clave: 'k$id',
  method: 'POST',
  path: '/grades',
  resumen: 'Nota 4.5 · Taller $id',
  detalle: 'María Pérez · corte 1 · 2026-2',
  estado: estado,
  ultimoError: error,
);

Future<void> montar(WidgetTester tester, OutboxSnapshot snapshot) async {
  tester.view.physicalSize = const Size(360, 800);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [outboxProvider.overrideWith((ref) => Stream.value(snapshot))],
      child: MaterialApp(
        theme: AppTheme.construir(
          AparienciaPreferencias.defecto,
          Brightness.light,
        ),
        home: const Scaffold(body: Column(children: [OfflineBanner()])),
      ),
    ),
  );
  await tester.pump();
}

void main() {
  testWidgets('cuenta los cambios sin enviar', (tester) async {
    await montar(
      tester,
      OutboxSnapshot(entradas: [entrada('1'), entrada('2'), entrada('3')]),
    );
    expect(find.text('3 cambios sin enviar'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('en singular dice «1 cambio»', (tester) async {
    await montar(tester, OutboxSnapshot(entradas: [entrada('1')]));
    expect(find.text('1 cambio sin enviar'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('mientras envía lo dice con el número que falta', (tester) async {
    await montar(
      tester,
      OutboxSnapshot(
        entradas: [
          entrada('1'),
          entrada('2', estado: OutboxEstado.enviando),
        ],
        drenando: true,
      ),
    );
    expect(find.text('Enviando 2…'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('lo que el servidor rechazó se distingue de lo que espera', (
    tester,
  ) async {
    await montar(
      tester,
      OutboxSnapshot(
        entradas: [
          entrada('1'),
          entrada('2', estado: OutboxEstado.fallida),
          entrada('3', estado: OutboxEstado.fallida),
        ],
      ),
    );
    expect(find.text('2 cambios no se pudieron enviar'), findsOneWidget);
    expect(find.textContaining('sin enviar'), findsNothing);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('sin nada pendiente no hay franja', (tester) async {
    await montar(tester, const OutboxSnapshot());
    expect(find.textContaining('sin enviar'), findsNothing);
    expect(find.textContaining('no se pudo'), findsNothing);
    expect(find.textContaining('Enviando'), findsNothing);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('tocarla abre la lista con el motivo de lo rechazado', (
    tester,
  ) async {
    await montar(
      tester,
      OutboxSnapshot(
        entradas: [
          entrada('1'),
          entrada(
            '2',
            estado: OutboxEstado.fallida,
            error: const OutboxError(
              status: 409,
              codigo: 'PERIODO_BLOQUEADO',
              mensaje: 'El periodo está cerrado',
            ),
          ),
        ],
      ),
    );

    await tester.tap(find.text('1 cambio no se pudo enviar'));
    await tester.pumpAndSettle();

    expect(find.text('Cambios sin enviar'), findsOneWidget);
    expect(find.text('Nota 4.5 · Taller 1'), findsOneWidget);
    expect(find.text('Nota 4.5 · Taller 2'), findsOneWidget);
    expect(find.text('El periodo está cerrado'), findsOneWidget);
    // La fallida ofrece reintentar; la que espera solo se puede descartar.
    expect(find.text('Reintentar'), findsOneWidget);
    expect(find.text('Descartar'), findsNWidgets(2));
    expect(tester.takeException(), isNull);

    // Descartar pregunta antes de tirar nada.
    await tester.tap(find.text('Descartar').first);
    await tester.pumpAndSettle();
    expect(find.text('¿Descartar este cambio?'), findsOneWidget);
    await tester.tap(find.text('Cancelar'));
    await tester.pumpAndSettle();
    expect(find.text('¿Descartar este cambio?'), findsNothing);

    await tester.pumpWidget(const SizedBox());
  });
}
