import 'package:shared_preferences/shared_preferences.dart';

class SessionStorage {
  static const _kAccess = 'access_token';
  static const _kRefresh = 'refresh_token';

  Future<void> save({required String accessToken, required String refreshToken}) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_kAccess, accessToken);
    await prefs.setString(_kRefresh, refreshToken);
  }

  Future<Map<String, String?>> load() async {
    final prefs = await SharedPreferences.getInstance();
    return {
      'accessToken': prefs.getString(_kAccess),
      'refreshToken': prefs.getString(_kRefresh),
    };
  }

  Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_kAccess);
    await prefs.remove(_kRefresh);
  }
}

