import 'package:flutter_test/flutter_test.dart';
import 'package:uts_academico/core/data/periodo_vigente.dart';

void main() {
  group('periodoEnUso', () {
    final noviembre = DateTime(2026, 11, 25);

    test('lo elegido a mano manda sobre el servidor', () {
      expect(
        periodoEnUso(elegido: '2026-1', delServidor: '2026-2', ahora: noviembre),
        '2026-1',
      );
    });

    test('sin elección sigue al servidor', () {
      expect(periodoEnUso(delServidor: '2027-1', ahora: noviembre), '2027-1');
    });

    test('sin servidor cae al calendario, y descarta lo malformado', () {
      expect(periodoEnUso(ahora: noviembre), '2026-2');
      expect(periodoEnUso(delServidor: '2026-9', ahora: noviembre), '2026-2');
    });
  });

  test('opcionesDePeriodo añade el vigente que el calendario no tiene', () {
    expect(
      opcionesDePeriodo('2027-1', count: 3, now: DateTime(2026, 12, 20)),
      ['2027-1', '2026-2', '2026-1', '2025-2'],
    );
    expect(
      opcionesDePeriodo('2026-1', count: 2, now: DateTime(2026, 8, 1)),
      ['2026-2', '2026-1'],
    );
  });
}
