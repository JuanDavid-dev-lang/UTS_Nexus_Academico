import 'dart:async';

import 'package:dio/dio.dart';

import '../config.dart';
import './api_error.dart';

/// Resultado de una renovación del access token.
///
/// Son tres y no dos porque «no se pudo renovar» junta dos cosas que piden lo
/// contrario: el servidor **rechazó** el refresh token (401: vencido, rotado o
/// revocado) y la sesión de verdad terminó; o el servidor **no contestó** —sin
/// red, tiempo de espera, un 5xx o un 429— y la sesión sigue tan viva como
/// hace un minuto. Tratar lo segundo como lo primero cerraba la sesión y
/// borraba la caché offline cada vez que el wifi del aula parpadeaba justo
/// cuando caducaba el token de acceso, que es cada quince minutos.
enum RefreshOutcome { renewed, rejected, unavailable }

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
  Future<RefreshOutcome>? _refreshInFlight;

  /// El fallo con el que terminó la última renovación [RefreshOutcome.unavailable],
  /// para que la petición original salga con ese error y no con un 401.
  DioException? _ultimoFalloDeRefresh;

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

    final outcome = await _ensureRefresh();
    if (outcome == RefreshOutcome.rejected) {
      setTokens(accessToken: null, refreshToken: null);
      onSessionExpired?.call();
      return handler.next(error);
    }
    if (outcome == RefreshOutcome.unavailable) {
      // La sesión sigue en pie; lo que no hay es servidor. Se devuelve ese
      // fallo, no el 401 original: «Tu sesión expiró» mandaría al docente a
      // teclear la contraseña contra un servidor que tampoco va a responder.
      return handler.next(_ultimoFalloDeRefresh ?? error);
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

  Future<RefreshOutcome> _ensureRefresh() {
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
  Future<RefreshOutcome> renewAccessToken() => _ensureRefresh();

  Future<RefreshOutcome> _refresh() async {
    final token = refreshToken;
    if (token == null) return RefreshOutcome.rejected;
    _ultimoFalloDeRefresh = null;

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
      if (newAccess == null || newRefresh == null) return RefreshOutcome.rejected;

      setTokens(accessToken: newAccess, refreshToken: newRefresh);
      await onTokensRenewed?.call(newAccess, newRefresh);
      return RefreshOutcome.renewed;
    } on DioException catch (error) {
      if (esRechazoDeSesion(error)) return RefreshOutcome.rejected;
      _ultimoFalloDeRefresh = error;
      return RefreshOutcome.unavailable;
    } catch (_) {
      // Un cuerpo que no se pudo interpretar u otro fallo local: no hay
      // motivo para dar la sesión por muerta.
      return RefreshOutcome.unavailable;
    }
  }

  /// Un rechazo es una respuesta del servidor que dice que ese token no vale:
  /// 401 (vencido, rotado o revocado), 403 (cuenta bloqueada) o 400 (el
  /// cuerpo no pasó la validación, es decir, el token guardado está corrupto).
  /// Todo lo demás —sin respuesta, 5xx, 429— es el servidor, no la sesión.
  static bool esRechazoDeSesion(DioException error) {
    final status = error.response?.statusCode;
    return status == 400 || status == 401 || status == 403;
  }

  Future<Response<T>> get<T>(String path, {Map<String, dynamic>? query}) =>
      _guard(() => dio.get<T>(path, queryParameters: query));

  Future<Response<T>> post<T>(String path, {Object? data}) =>
      _guard(() => dio.post<T>(path, data: data));

  Future<Response<T>> patch<T>(String path, {Object? data}) =>
      _guard(() => dio.patch<T>(path, data: data));

  Future<Response<T>> put<T>(String path, {Object? data}) =>
      _guard(() => dio.put<T>(path, data: data));

  /// `data` es opcional porque casi ningún DELETE lo lleva; la baja de un
  /// dispositivo push sí, porque el token no cabe en la ruta.
  Future<Response<T>> delete<T>(String path, {Object? data}) =>
      _guard(() => dio.delete<T>(path, data: data));

  /// Convierte cualquier fallo en un [ApiError] antes de que salga del cliente.
  Future<Response<T>> _guard<T>(Future<Response<T>> Function() request) async {
    try {
      return await request();
    } catch (error) {
      throw ApiError.from(error);
    }
  }
}
