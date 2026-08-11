/// Antigüedad de los datos y de la última sincronización.
///
/// Es lo que separa «esto es de ahora» de «esto es una foto de antes». Un
/// error aquí no rompe ninguna pantalla: presenta datos viejos como si fueran
/// actuales, que es justo el fallo que la franja de estado existe para evitar.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:uts_academico/core/data/offline_status.dart';

void main() {
  final ahora = DateTime.parse('2026-08-11T10:00:00');

  group('haceCuanto', () {
    test('sin marca dice que nunca se sincronizó, no "hace un momento"', () {
      expect(haceCuanto(null, ahora), 'nunca');
    });

    test('menos de un minuto', () {
      expect(haceCuanto(ahora.subtract(const Duration(seconds: 20)), ahora), 'hace unos segundos');
    });

    test('minutos', () {
      expect(haceCuanto(ahora.subtract(const Duration(minutes: 15)), ahora), 'hace 15 min');
      expect(haceCuanto(ahora.subtract(const Duration(minutes: 59)), ahora), 'hace 59 min');
    });

    test('horas', () {
      expect(haceCuanto(ahora.subtract(const Duration(hours: 4)), ahora), 'hace 4 h');
    });

    test('ayer y días', () {
      expect(haceCuanto(ahora.subtract(const Duration(days: 1)), ahora), 'ayer');
      expect(haceCuanto(ahora.subtract(const Duration(days: 5)), ahora), 'hace 5 días');
    });

    test('una marca en el futuro no produce texto absurdo', () {
      // Puede pasar con el reloj del teléfono adelantado respecto al servidor.
      expect(haceCuanto(ahora.add(const Duration(minutes: 30)), ahora), 'hace unos segundos');
    });
  });

  group('EstadoDatos', () {
    test('sin origen de caché los datos son frescos', () {
      const estado = EstadoDatos(ultimaSincronizacion: null);
      expect(estado.esFresco, isTrue);
    });

    test('con origen de caché los datos NO son frescos', () {
      final estado = EstadoDatos(desdeCache: ahora.subtract(const Duration(hours: 2)));
      expect(estado.esFresco, isFalse);
    });
  });
}
