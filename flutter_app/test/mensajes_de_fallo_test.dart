/// Qué se dice cuando el servidor no contesta y lo escrito queda en el
/// teléfono, sin esconder los rechazos reales (4xx).
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:uts_academico/core/network/api_error.dart';
import 'package:uts_academico/core/network/mensajes_de_fallo.dart';

void main() {
  group('esFalloDelServicio', () {
    test('sin red, tiempo de espera y 5xx son del servicio', () {
      expect(esFalloDelServicio(ApiErrorKind.network), isTrue);
      expect(esFalloDelServicio(ApiErrorKind.timeout), isTrue);
      expect(esFalloDelServicio(ApiErrorKind.server), isTrue);
    });

    test('un 4xx o un 429 no lo son: su mensaje llega tal cual', () {
      for (final kind in [
        ApiErrorKind.validation,
        ApiErrorKind.conflict,
        ApiErrorKind.forbidden,
        ApiErrorKind.notFound,
        ApiErrorKind.unauthorized,
        ApiErrorKind.rateLimited,
      ]) {
        expect(esFalloDelServicio(kind), isFalse, reason: kind.name);
      }
    });
  });

  group('motivoDeEntrada', () {
    test('pendiente por un 502/503/504 dice que el cambio está a salvo', () {
      for (final status in [500, 502, 503, 504]) {
        expect(
          motivoDeEntrada(
            fallida: false,
            status: status,
            mensaje: 'El servidor tuvo un problema. Intenta de nuevo.',
          ),
          mensajeCambiosGuardados,
        );
      }
    });

    test('pendiente sin respuesta (red o tiempo) también', () {
      expect(
        motivoDeEntrada(
          fallida: false,
          status: null,
          mensaje: 'No hay conexión con el servidor.',
        ),
        mensajeCambiosGuardados,
      );
    });

    test('una fallida conserva el motivo del servidor', () {
      expect(
        motivoDeEntrada(
          fallida: true,
          status: 409,
          mensaje: 'El periodo 2026-2 está cerrado.',
        ),
        'El periodo 2026-2 está cerrado.',
      );
    });

    test('pendiente por un 429 dice la espera, no una avería', () {
      expect(
        motivoDeEntrada(
          fallida: false,
          status: 429,
          mensaje: 'Demasiadas solicitudes seguidas. Espera un momento.',
        ),
        'Demasiadas solicitudes seguidas. Espera un momento.',
      );
    });

    test('sin intento previo no hay motivo', () {
      expect(motivoDeEntrada(fallida: false, status: null, mensaje: ''), '');
    });
  });

  test('el mensaje no alarma: ni «caído» ni «error»', () {
    final texto = mensajeCambiosGuardados.toLowerCase();
    expect(texto, isNot(contains('caído')));
    expect(texto, isNot(contains('error')));
    expect(texto, contains('guardados en el teléfono'));
  });
}
