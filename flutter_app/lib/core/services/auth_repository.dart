import '../models/auth_user.dart';
import '../models/dashboard_summary.dart';
import 'api_client.dart';

class AuthRepository {
  final ApiClient _api = ApiClient.instance;

  Future<Map<String, dynamic>> login(String email, String password) async {
    final response = await _api.post('/auth/login', data: {'email': email, 'password': password, 'device': 'flutter'});
    return Map<String, dynamic>.from(response.data as Map);
  }

  Future<Map<String, dynamic>> me() async {
    final response = await _api.get('/auth/me');
    return Map<String, dynamic>.from(response.data as Map);
  }

  Future<DashboardData> dashboard() async {
    final response = await _api.get('/analytics/dashboard');
    return DashboardData.fromJson(Map<String, dynamic>.from(response.data as Map));
  }
}

class DashboardData {
  final DashboardSummary summary;
  DashboardData({required this.summary});

  factory DashboardData.fromJson(Map<String, dynamic> json) {
    return DashboardData(summary: DashboardSummary.fromJson(json));
  }
}
