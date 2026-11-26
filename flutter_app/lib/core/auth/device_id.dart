import 'dart:math';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Identificador de este teléfono para atar la sesión a él.
///
/// Mismo contrato que el escritorio (`desktop/src/core/auth/device-id.ts`): se
/// genera una vez, al azar, y se guarda en el almacén seguro (Keystore en
/// Android, Keychain en iOS). El servidor guarda su hash en
/// `Sesion.deviceIdHash` y solo deja renovar esa sesión a quien presente el
/// mismo (`backend/src/domains/session/session-policy.ts`), así que un refresh
/// token que salga del teléfono —una copia de seguridad, un volcado— no sirve
/// en otro.
///
/// **No se borra al cerrar sesión.** Es del teléfono, no de la sesión:
/// cambiarlo en cada salida no protege nada más y deja en la auditoría un
/// equipo nuevo por cada inicio de sesión.
const claveIdDeEquipo = 'device_id';

/// Mismo patrón que acepta el servidor (`PATRON_ID_DISPOSITIVO`).
final _valido = RegExp(r'^[A-Za-z0-9_-]{16,128}$');

bool esIdDeEquipoValido(String? id) => id != null && _valido.hasMatch(id);

/// 16 bytes del generador seguro en hexadecimal: 32 caracteres, dentro del
/// patrón del servidor.
String generarIdDeEquipo([Random? aleatorio]) {
  final fuente = aleatorio ?? Random.secure();
  return List<String>.generate(
    16,
    (_) => fuente.nextInt(256).toRadixString(16).padLeft(2, '0'),
  ).join();
}

class IdDeEquipo {
  IdDeEquipo._();
  static final IdDeEquipo instance = IdDeEquipo._();

  static const _almacen = FlutterSecureStorage();
  Future<String>? _pendiente;

  /// Una sola lectura por ejecución: el arranque y el inicio de sesión pueden
  /// pedirlo a la vez, y dos llamadas sin memoria generarían dos distintos.
  Future<String> obtener() => _pendiente ??= _leerOCrear();

  Future<String> _leerOCrear() async {
    try {
      final guardado = await _almacen.read(key: claveIdDeEquipo);
      if (esIdDeEquipoValido(guardado)) return guardado!;
    } on Exception {
      // Un almacén ilegible se trata como vacío: se genera uno nuevo.
    }
    final nuevo = generarIdDeEquipo();
    try {
      await _almacen.write(key: claveIdDeEquipo, value: nuevo);
    } on Exception {
      // Sin almacén el identificador vive lo que dure la ejecución: la sesión
      // funciona, y el siguiente arranque estrenará otro, igual que pasaría con
      // los tokens en ese almacén roto.
    }
    return nuevo;
  }
}
