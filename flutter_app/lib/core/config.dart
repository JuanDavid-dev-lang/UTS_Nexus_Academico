import 'package:flutter/foundation.dart';

class AppConfig {
  static String get defaultApiBaseUrl {
    const env = String.fromEnvironment('API_BASE_URL', defaultValue: '');
    if (env.isNotEmpty) return env;
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return 'http://10.0.2.2:4000/api/v1';
      case TargetPlatform.iOS:
        return 'http://localhost:4000/api/v1';
      default:
        return 'http://127.0.0.1:4000/api/v1';
    }
  }

  static String get defaultWsBaseUrl {
    const env = String.fromEnvironment('WS_BASE_URL', defaultValue: '');
    if (env.isNotEmpty) return env;
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return 'http://10.0.2.2:4000';
      case TargetPlatform.iOS:
        return 'http://localhost:4000';
      default:
        return 'http://127.0.0.1:4000';
    }
  }

  static String normalizeApiBaseUrl(String value) {
    final trimmed = value.trim().replaceAll(RegExp(r'/+$'), '');
    if (trimmed.endsWith('/api/v1')) return trimmed;
    return '$trimmed/api/v1';
  }

  static String normalizeWsBaseUrl(String value) {
    return value.trim().replaceAll(RegExp(r'/+$'), '');
  }
}
