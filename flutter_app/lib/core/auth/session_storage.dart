import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

class SessionStorage {
  static const _kAccess = 'access_token';
  static const _kRefresh = 'refresh_token';
  static const _kUser = 'session_user';
  static const _secure = FlutterSecureStorage();

  Future<void> save(
      {required String accessToken, required String refreshToken}) async {
    await Future.wait([
      _secure.write(key: _kAccess, value: accessToken),
      _secure.write(key: _kRefresh, value: refreshToken),
    ]);
    // Una sesión migrada no debe dejar la copia anterior en preferencias planas.
    final prefs = await SharedPreferences.getInstance();
    await Future.wait([prefs.remove(_kAccess), prefs.remove(_kRefresh)]);
  }

  Future<Map<String, String?>> load() async {
    var access = await _secure.read(key: _kAccess);
    var refresh = await _secure.read(key: _kRefresh);
    if (access != null && refresh != null) {
      return {'accessToken': access, 'refreshToken': refresh};
    }

    // Migración única desde versiones anteriores. Primero escribe seguro y
    // solo después borra el origen: una interrupción no pierde la sesión.
    final prefs = await SharedPreferences.getInstance();
    access ??= prefs.getString(_kAccess);
    refresh ??= prefs.getString(_kRefresh);
    if (access != null && refresh != null) {
      await save(accessToken: access, refreshToken: refresh);
    }
    return {'accessToken': access, 'refreshToken': refresh};
  }

  /// Último usuario que devolvió `/auth/me`, tal cual. Existe para poder abrir
  /// la aplicación sin servidor con la sesión que ya estaba iniciada. Va en el
  /// almacén seguro junto a los tokens y se borra con ellos.
  Future<void> saveUser(Map<String, dynamic> user) async {
    await _secure.write(key: _kUser, value: jsonEncode(user));
  }

  Future<Map<String, dynamic>?> loadUser() async {
    final crudo = await _secure.read(key: _kUser);
    if (crudo == null) return null;
    try {
      final json = jsonDecode(crudo);
      return json is Map ? Map<String, dynamic>.from(json) : null;
    } on FormatException {
      return null;
    }
  }

  Future<void> clear() async {
    await Future.wait([
      _secure.delete(key: _kAccess),
      _secure.delete(key: _kRefresh),
      _secure.delete(key: _kUser),
    ]);
    final prefs = await SharedPreferences.getInstance();
    await Future.wait([prefs.remove(_kAccess), prefs.remove(_kRefresh)]);
  }
}
