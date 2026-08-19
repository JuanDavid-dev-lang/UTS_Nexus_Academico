import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

class SessionStorage {
  static const _kAccess = 'access_token';
  static const _kRefresh = 'refresh_token';
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

  Future<void> clear() async {
    await Future.wait([
      _secure.delete(key: _kAccess),
      _secure.delete(key: _kRefresh),
    ]);
    final prefs = await SharedPreferences.getInstance();
    await Future.wait([prefs.remove(_kAccess), prefs.remove(_kRefresh)]);
  }
}
