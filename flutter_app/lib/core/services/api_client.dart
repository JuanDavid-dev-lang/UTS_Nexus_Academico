import 'package:dio/dio.dart';
import '../config.dart';

class ApiClient {
  ApiClient._()
      : dio = Dio(BaseOptions(
          baseUrl: AppConfig.defaultApiBaseUrl,
          connectTimeout: const Duration(seconds: 20),
          receiveTimeout: const Duration(seconds: 20),
          headers: {'Content-Type': 'application/json'},
        ));

  static final ApiClient instance = ApiClient._();
  final Dio dio;
  String? accessToken;
  String? refreshToken;

  void setTokens({String? accessToken, String? refreshToken}) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    dio.options.headers['Authorization'] = accessToken == null ? null : 'Bearer $accessToken';
  }

  void setBaseUrl(String baseUrl) {
    dio.options.baseUrl = AppConfig.normalizeApiBaseUrl(baseUrl);
  }

  Future<Response<T>> get<T>(String path) => dio.get<T>(path);
  Future<Response<T>> post<T>(String path, {Object? data}) => dio.post<T>(path, data: data);
  Future<Response<T>> patch<T>(String path, {Object? data}) => dio.patch<T>(path, data: data);
  Future<Response<T>> delete<T>(String path) => dio.delete<T>(path);
}
