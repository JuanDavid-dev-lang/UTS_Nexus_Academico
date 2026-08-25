import '../../features/dashboard/data/dashboard_summary.dart';
import '../network/api_client.dart';
import '../storage/offline_cache.dart';

class AuthRepository {
  final ApiClient _api = ApiClient.instance;

  Future<Map<String, dynamic>> login(String email, String password) async {
    final response = await _api.post('/auth/login', data: {'email': email, 'password': password, 'device': 'flutter'});
    return Map<String, dynamic>.from(response.data as Map);
  }

  /// Cambia la contraseña de la propia cuenta.
  ///
  /// El servidor cierra TODAS las sesiones al hacerlo —esta incluida— y por eso
  /// devuelve un par de tokens nuevo. Quien llame tiene que guardarlo: si no, el
  /// primer refresco falla y cambiarse la contraseña acaba echando al usuario al
  /// inicio de sesión, que se lee como una avería en vez de como la medida que
  /// es.
  Future<Map<String, dynamic>> cambiarPassword({
    required String actual,
    required String nueva,
  }) async {
    final response = await _api.post('/auth/password', data: {
      'currentPassword': actual,
      'newPassword': nueva,
    });
    return Map<String, dynamic>.from(response.data as Map);
  }

  Future<Map<String, dynamic>> me() async {
    final response = await _api.get('/auth/me');
    return Map<String, dynamic>.from(response.data as Map);
  }

  Future<DashboardData> dashboard() async {
    // Con caché: el panel es lo primero que se abre, y sin red debe mostrar
    // la última fotografía en vez de un error a pantalla completa.
    final cuerpo = await mapaConCache('dashboard', () async {
      final response = await _api.get('/analytics/dashboard');
      return Map<String, dynamic>.from(response.data as Map);
    });
    return DashboardData.fromJson(cuerpo);
  }
}

class DashboardData {
  final DashboardSummary summary;
  DashboardData({required this.summary});

  factory DashboardData.fromJson(Map<String, dynamic> json) {
    return DashboardData(summary: DashboardSummary.fromJson(json));
  }
}
