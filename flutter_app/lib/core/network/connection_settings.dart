import 'package:shared_preferences/shared_preferences.dart';

import '../config.dart';

class ConnectionSettings {
  static const _apiKey = 'api_base_url_override';
  static const _wsKey = 'ws_base_url_override';

  final String apiBaseUrl;
  final String wsBaseUrl;

  const ConnectionSettings({
    required this.apiBaseUrl,
    required this.wsBaseUrl,
  });

  static Future<ConnectionSettings> load() async {
    final prefs = await SharedPreferences.getInstance();
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

  ConnectionSettings copyWith({
    String? apiBaseUrl,
    String? wsBaseUrl,
  }) {
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
