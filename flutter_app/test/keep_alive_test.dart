/// Cuándo renovar una sesión mantenida aunque la app se abra poco. Misma regla
/// que `desktop/src/domain/session/keep-alive.ts`.
library;

import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:uts_academico/core/auth/keep_alive.dart';

String jwt(Map<String, dynamic> carga) {
  String parte(Object json) =>
      base64Url.encode(utf8.encode(jsonEncode(json))).replaceAll('=', '');
  return '${parte({'alg': 'HS256'})}.${parte(carga)}.firma';
}

void main() {
  final ahora = DateTime.utc(2026, 11, 25, 12);
  int segundos(DateTime t) => t.millisecondsSinceEpoch ~/ 1000;

  test('cargaDeJwt lee la carga sin relleno base64', () {
    final carga = cargaDeJwt(jwt({'sub': 'u1', 'iat': 1700000000}));
    expect(carga?['sub'], 'u1');
    expect(carga?['iat'], 1700000000);
  });

  test('cargaDeJwt devuelve null con un token ilegible', () {
    expect(cargaDeJwt(null), isNull);
    expect(cargaDeJwt('no-es-un-jwt'), isNull);
    expect(cargaDeJwt('a.%%%.c'), isNull);
  });

  test('un token de hace más de un día se renueva', () {
    final carga = {
      'iat': segundos(ahora.subtract(const Duration(hours: 25))),
      'exp': segundos(ahora.add(const Duration(days: 14))),
    };
    expect(debeRenovarSesion(carga, ahora), isTrue);
  });

  test('uno reciente no: como mucho una renovación al día', () {
    final carga = {
      'iat': segundos(ahora.subtract(const Duration(hours: 3))),
      'exp': segundos(ahora.add(const Duration(days: 15))),
    };
    expect(debeRenovarSesion(carga, ahora), isFalse);
  });

  test('uno caducado no se intenta: eso lo explica el flujo del 401', () {
    final carga = {
      'iat': segundos(ahora.subtract(const Duration(days: 20))),
      'exp': segundos(ahora.subtract(const Duration(days: 5))),
    };
    expect(debeRenovarSesion(carga, ahora), isFalse);
  });

  test('sin iat no se decide nada', () {
    expect(debeRenovarSesion(null, ahora), isFalse);
    expect(debeRenovarSesion({'exp': 1}, ahora), isFalse);
  });
}
