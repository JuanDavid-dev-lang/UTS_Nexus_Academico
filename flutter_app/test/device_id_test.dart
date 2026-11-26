/// Identificador del teléfono que ata la sesión (`Sesion.deviceIdHash`): tiene
/// que pasar el patrón del servidor o el login respondería 400.
library;

import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:uts_academico/core/auth/device_id.dart';

void main() {
  test('el generado cumple el patrón del servidor', () {
    for (var i = 0; i < 50; i++) {
      final id = generarIdDeEquipo();
      expect(id, hasLength(32));
      expect(esIdDeEquipoValido(id), isTrue, reason: id);
    }
  });

  test('dos generados no coinciden', () {
    expect(generarIdDeEquipo(), isNot(generarIdDeEquipo()));
  });

  test('con la misma semilla sale el mismo (determinista para probar)', () {
    expect(generarIdDeEquipo(Random(7)), generarIdDeEquipo(Random(7)));
  });

  test('esIdDeEquipoValido rechaza lo que el servidor rechazaría', () {
    expect(esIdDeEquipoValido(null), isFalse);
    expect(esIdDeEquipoValido('corto'), isFalse);
    expect(esIdDeEquipoValido('con espacios dentro 1234'), isFalse);
    expect(esIdDeEquipoValido('a' * 129), isFalse);
    expect(esIdDeEquipoValido('abc_DEF-0123456789'), isTrue);
  });
}
