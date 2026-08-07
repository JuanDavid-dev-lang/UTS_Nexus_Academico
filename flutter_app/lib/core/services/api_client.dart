import 'dart:async';

import 'package:dio/dio.dart';

import '../config.dart';
import '../network/api_error.dart';

/// Cliente HTTP.
///
/// Todo lo que la app envía al servidor pasa por aquí. Dos responsabilidades que
/// antes no existían:
///
///  1. **Renovación automática del token ante un 401, de un solo vuelo.** Diez
///     peticiones que reciben 401 a la vez disparan UNA renovación, no diez. El
///     backend rota el refresh token en cada uso, así que dos renovaciones
///     simultáneas se invalidarían entre sí y cerrarían la sesión sin motivo.
///  2. **Errores tipados.** Ningún volcado de Dio llega a la pantalla: un
///     `DioException [connection error]` no le dice nada a un docente.
class ApiClient {
  ApiClient._()
      : dio = Dio(BaseOptions(
          baseUrl: AppConfig.defaultApiBaseUrl,
          connectTimeout: const Duration(seconds: 15),
          receiveTimeout: const Duration(seconds: 20),
          headers: {'Content-Type': 'application/json'},
        )) {
    dio.interceptors.add(InterceptorsWrapper(onError: _onError));
  }

  static final ApiClient instance = ApiClient._();
  final Dio dio;

  String? accessToken;
  String? refreshToken;

  /// Persiste los tokens renovados. Lo inyecta la capa de sesión.
  Future<void> Function(String accessToken, String refreshToken)? onTokensRenewed;

  /// Se invoca cuando la sesión ya no es recuperable y hay que volver al login.
  void Function()? onSessionExpired;

  /// Promesa compartida de la renovación en curso.
  Future<bool>? _refreshInFlight;

  void setTokens({String? accessToken, String? refreshToken}) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    if (accessToken == null) {
      dio.options.headers.remove('Authorization');
    } else {
      dio.options.headers['Authorization'] = 'Bearer $accessToken';
    }
  }

  void setBaseUrl(String baseUrl) {
    dio.options.baseUrl = AppConfig.normalizeApiBaseUrl(baseUrl);
  }

  Future<void> _onError(DioException error, ErrorInterceptorHandler handler) async {
    final isUnauthorized = error.response?.statusCode == 401;
    final path = error.requestOptions.path;

    // Un 401 del propio /auth/refresh o /auth/login no se reintenta: significa
    // que el refresh token o las credenciales ya no valen.
    final isAuthEndpoint =
        path.contains('/auth/refresh') || path.contains('/auth/login');

    // Evita bucles: solo un reintento por petición.
    final alreadyRetried = error.requestOptions.extra['_retried'] == true;

    if (!isUnauthorized || isAuthEndpoint || alreadyRetried) {
      return handler.next(error);
    }

    final renewed = await _ensureRefresh();
    if (!renewed) {
      setTokens(accessToken: null, refreshToken: null);
      onSessionExpired?.call();
      return handler.next(error);
    }

    try {
      final options = error.requestOptions;
      options.extra['_retried'] = true;
      options.headers['Authorization'] = 'Bearer $accessToken';
      return handler.resolve(await dio.fetch(options));
    } catch (retryError) {
      return handler.next(retryError is DioException ? retryError : error);
    }
  }

  Future<bool> _ensureRefresh() {
    return _refreshInFlight ??= _refresh().whenComplete(() {
      _refreshInFlight = null;
    });
  }

  /// Renueva el access token bajo demanda, compartiendo la misma promesa en
  /// vuelo que la ruta del 401.
  ///
  /// Lo necesita el socket: socket.io solo autentica en el handshake, así que
  /// cuando el access token expira el reintento de conexión se rechaza y la
  /// sincronización muere. Renovar aquí y reconectar la recupera sin competir
  /// con la renovación que pueda estar haciendo la capa HTTP.
  Future<bool> renewAccessToken() => _ensureRefresh();

  Future<bool> _refresh() async {
    final token = refreshToken;
    if (token == null) return false;

    try {
      // Cliente aparte: el interceptor de `dio` no debe reentrar aquí.
      final refreshDio = Dio(BaseOptions(
        baseUrl: dio.options.baseUrl,
        connectTimeout: const Duration(seconds: 15),
        receiveTimeout: const Duration(seconds: 15),
        headers: {'Content-Type': 'application/json'},
      ));

      final response = await refreshDio.post<Map<String, dynamic>>(
        '/auth/refresh',
        data: {'refreshToken': token},
      );

      final data = response.data;
      final newAccess = data?['accessToken'] as String?;
      final newRefresh = data?['refreshToken'] as String?;
      if (newAccess == null || newRefresh == null) return false;

      setTokens(accessToken: newAccess, refreshToken: newRefresh);
      await onTokensRenewed?.call(newAccess, newRefresh);
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<Response<T>> get<T>(String path, {Map<String, dynamic>? query}) =>
      _guard(() => dio.get<T>(path, queryParameters: query));

  Future<Response<T>> post<T>(String path, {Object? data}) =>
      _guard(() => dio.post<T>(path, data: data));

  Future<Response<T>> patch<T>(String path, {Object? data}) =>
      _guard(() => dio.patch<T>(path, data: data));

  Future<Response<T>> delete<T>(String path) => _guard(() => dio.delete<T>(path));

  /// Convierte cualquier fallo en un [ApiError] antes de que salga del cliente.
  Future<Response<T>> _guard<T>(Future<Response<T>> Function() request) async {
    try {
      return await request();
    } catch (error) {
      throw ApiError.from(error);
    }
  }
}
