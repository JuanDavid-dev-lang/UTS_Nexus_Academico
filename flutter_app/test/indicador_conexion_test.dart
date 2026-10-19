/// El indicador de conexión de la barra superior: cuándo aparece, qué dice y
/// que lleve a la bandeja de salida. Sustituye a la franja que ocupaba todo
/// el ancho encima de cada pantalla.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:uts_academico/core/network/realtime_service.dart';
import 'package:uts_academico/core/storage/offline_status.dart';
import 'package:uts_academico/core/sync/outbox_entry.dart';
import 'package:uts_academico/core/sync/outbox_service.dart';
import 'package:uts_academico/core/theme/app_theme.dart';
import 'package:uts_academico/core/theme/appearance/appearance_preferences.dart';
import 'package:uts_academico/core/widgets/indicador_conexion.dart';

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

void main() {
  group('decidirIndicador', () {
    ({EstadoIndicador estado, int cuenta, bool cuentaEsError}) decidir({
      bool problemaVisible = false,
      RealtimeStatus? tiempoReal = RealtimeStatus.connected,
      bool desdeCache = false,
      OutboxSnapshot? bandeja,
      bool recienRestablecido = false,
    }) => decidirIndicador(
      problemaVisible: problemaVisible,
      tiempoReal: tiempoReal,
      desdeCache: desdeCache,
      bandeja: bandeja,
      recienRestablecido: recienRestablecido,
    );

    test('conectado y sin nada pendiente no enseña nada', () {
      expect(decidir().estado, EstadoIndicador.oculto);
    });

    test('un corte en curso se enseña como reconectando', () {
      expect(
        decidir(
          problemaVisible: true,
          tiempoReal: RealtimeStatus.connecting,
        ).estado,
        EstadoIndicador.reconectando,
      );
    });

    test('datos de la caché o un error son «sin conexión»', () {
      expect(decidir(desdeCache: true).estado, EstadoIndicador.sinConexion);
      expect(
        decidir(problemaVisible: true, tiempoReal: RealtimeStatus.error).estado,
        EstadoIndicador.sinConexion,
      );
    });

    test('sin red, la burbuja cuenta lo que espera salir', () {
      final d = decidir(
        desdeCache: true,
        bandeja: OutboxSnapshot(entradas: [entrada('1'), entrada('2')]),
      );
      expect(d.estado, EstadoIndicador.sinConexion);
      expect(d.cuenta, 2);
      expect(d.cuentaEsError, isFalse);
    });

    test('un cambio rechazado manda sobre todo', () {
      final d = decidir(
        desdeCache: true,
        bandeja: OutboxSnapshot(
          entradas: [
            entrada('1'),
            entrada(
              '2',
              estado: OutboxEstado.fallida,
              error: const OutboxError(
                status: 409,
                mensaje: 'El periodo está cerrado',
              ),
            ),
          ],
        ),
      );
      expect(d.estado, EstadoIndicador.fallidas);
      expect(d.cuenta, 1);
      expect(d.cuentaEsError, isTrue);
    });

    test('con red y cola, «enviando» mientras se vacía', () {
      final bandeja = OutboxSnapshot(entradas: [entrada('1')], drenando: true);
      expect(decidir(bandeja: bandeja).estado, EstadoIndicador.enviando);
    });

    test('tras volver la conexión, un momento en verde', () {
      expect(
        decidir(recienRestablecido: true).estado,
        EstadoIndicador.restablecido,
      );
    });
  });

  group('IndicadorConexion', () {
    Future<void> montar(
      WidgetTester tester, {
      required OutboxSnapshot bandeja,
      EstadoDatos? datos,
    }) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            outboxProvider.overrideWith((ref) => Stream.value(bandeja)),
            realtimeStatusProvider.overrideWith(
              (ref) => Stream.value(RealtimeStatus.connected),
            ),
            if (datos != null)
              offlineStatusProvider.overrideWith((ref) => Stream.value(datos)),
          ],
          child: MaterialApp(
            theme: AppTheme.construir(
              AparienciaPreferencias.defecto,
              Brightness.light,
            ),
            home: const Scaffold(
              body: Align(
                alignment: Alignment.topRight,
                child: IndicadorConexion(),
              ),
            ),
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
    }

    testWidgets('sin nada que contar no ocupa sitio', (tester) async {
      await montar(tester, bandeja: const OutboxSnapshot(entradas: []));
      expect(find.byType(Icon), findsNothing);
    });

    testWidgets('enseña la cuenta de cambios sin enviar', (tester) async {
      await montar(
        tester,
        bandeja: OutboxSnapshot(
          entradas: [entrada('1'), entrada('2'), entrada('3')],
        ),
      );
      expect(find.text('3'), findsOneWidget);
      expect(
        find.bySemanticsLabel(RegExp('3 cambios sin enviar')),
        findsOneWidget,
      );
    });

    testWidgets('al tocarlo abre el detalle y lleva a la bandeja', (
      tester,
    ) async {
      await montar(
        tester,
        bandeja: OutboxSnapshot(entradas: [entrada('1'), entrada('2')]),
      );
      await tester.tap(find.byType(IndicadorConexion));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.text('Cambios sin enviar'), findsWidgets);
      expect(find.text('Ver los 2 cambios sin enviar'), findsOneWidget);
    });
  });
}
