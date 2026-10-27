import 'package:shared_preferences/shared_preferences.dart';

import '../config.dart';

class ConnectionSettings {
  static const _apiKey = 'api_base_url_override';
  static const _wsKey = 'ws_base_url_override';

  final String apiBaseUrl;
  final String wsBaseUrl;

  const ConnectionSettings({required this.apiBaseUrl, required this.wsBaseUrl});

  /// Lo que guarda `ConnectionController` al encontrar o escribir un servidor.
  static const _servidorRecordadoKey = 'server_base_url';

  /// El servidor recordado manda sobre el de fábrica. Antes `bootstrap()` solo
  /// miraba `_apiKey`, que nadie escribe: con un servidor propio, al reabrir la
  /// app `/auth/me` iba al de fábrica con un token de otro servidor, el refresh
  /// se rechazaba y la sesión se cerraba en cada arranque en frío.
  static Future<ConnectionSettings> load() async {
    final prefs = await SharedPreferences.getInstance();
    final recordado = prefs.getString(_servidorRecordadoKey);
    if (recordado != null && recordado.trim().isNotEmpty) {
      return ConnectionSettings(
        apiBaseUrl: AppConfig.normalizeApiBaseUrl(recordado),
        wsBaseUrl: AppConfig.normalizeWsBaseUrl(recordado),
      );
    }
    return ConnectionSettings(
      apiBaseUrl: prefs.getString(_apiKey) ?? AppConfig.defaultApiBaseUrl,
      wsBaseUrl: prefs.getString(_wsKey) ?? AppConfig.defaultWsBaseUrl,
    );
  }

  Future<void> save() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_apiKey, apiBaseUrl);
    await prefs.setString(_wsKey, wsBaseUrl);
  }

  ConnectionSettings copyWith({String? apiBaseUrl, String? wsBaseUrl}) {
    return ConnectionSettings(
      apiBaseUrl: apiBaseUrl ?? this.apiBaseUrl,
      wsBaseUrl: wsBaseUrl ?? this.wsBaseUrl,
    );
  }

  static ConnectionSettings defaults() {
    return ConnectionSettings(
      apiBaseUrl: AppConfig.defaultApiBaseUrl,
      wsBaseUrl: AppConfig.defaultWsBaseUrl,
    );
  }
}
