import 'package:dio/dio.dart';

/// Causa de un fallo, en términos que le sirven a quien usa la app.
enum ApiErrorKind {
  network,
  timeout,
  unauthorized,
  forbidden,
  notFound,
  validation,
  conflict,
  rateLimited,
  server,
  unknown,
}

/// Error tipado.
///
/// La app nunca muestra el volcado de Dio: un `DioException [connection error]`
/// no le dice nada a un docente. Cada fallo se traduce a una causa y a un texto
/// accionable, y el detalle técnico queda disponible para diagnóstico.
class ApiError implements Exception {
  final ApiErrorKind kind;
  final String message;
  final int? statusCode;
  final Object? cause;

  const ApiError(this.kind, this.message, {this.statusCode, this.cause});

  bool get isRetryable =>
      kind == ApiErrorKind.network ||
      kind == ApiErrorKind.timeout ||
      kind == ApiErrorKind.server;

  static const _messages = {
    ApiErrorKind.network: 'No hay conexión con el servidor.',
    ApiErrorKind.timeout: 'El servidor tardó demasiado en responder.',
    ApiErrorKind.unauthorized: 'Tu sesión expiró. Vuelve a iniciar sesión.',
    ApiErrorKind.forbidden: 'No tienes permisos para esta acción.',
    ApiErrorKind.notFound: 'No encontramos lo que buscabas.',
    ApiErrorKind.validation: 'Revisa los datos: hay algo que no es válido.',
    ApiErrorKind.conflict: 'Ese registro ya existe.',
    ApiErrorKind.rateLimited: 'Demasiadas solicitudes seguidas. Espera un momento.',
    ApiErrorKind.server: 'El servidor tuvo un problema. Intenta de nuevo.',
    ApiErrorKind.unknown: 'Ocurrió un problema inesperado.',
  };

  /// Solo estos estados traen un mensaje escrito para el usuario. En 401, 403 y
  /// 5xx el texto del servidor es interno y no debe llegar a la pantalla.
  static const _userFacingStatuses = {400, 409, 422};

  static ApiErrorKind _kindFromStatus(int status) {
    if (status == 401) return ApiErrorKind.unauthorized;
    if (status == 403) return ApiErrorKind.forbidden;
    if (status == 404) return ApiErrorKind.notFound;
    if (status == 409) return ApiErrorKind.conflict;
    if (status == 429) return ApiErrorKind.rateLimited;
    if (status == 400 || status == 422) return ApiErrorKind.validation;
    if (status >= 500) return ApiErrorKind.server;
    return ApiErrorKind.unknown;
  }

  factory ApiError.from(Object error) {
    if (error is ApiError) return error;

    if (error is DioException) {
      switch (error.type) {
        case DioExceptionType.connectionTimeout:
        case DioExceptionType.sendTimeout:
        case DioExceptionType.receiveTimeout:
          return ApiError(ApiErrorKind.timeout, _messages[ApiErrorKind.timeout]!,
              cause: error);
        case DioExceptionType.connectionError:
        case DioExceptionType.unknown:
          return ApiError(ApiErrorKind.network, _messages[ApiErrorKind.network]!,
              cause: error);
        case DioExceptionType.badResponse:
          final status = error.response?.statusCode ?? 0;
          final kind = _kindFromStatus(status);

          final body = error.response?.data;
          final serverMessage =
              body is Map && body['message'] is String ? body['message'] as String : null;

          // Se rechaza texto que huela a interno aunque venga en un estado permitido.
          final looksInternal = serverMessage == null ||
              serverMessage.length > 200 ||
              RegExp(r'[`_]|\w+\(\)|Error|Exception').hasMatch(serverMessage);

          final message = _userFacingStatuses.contains(status) && !looksInternal
              ? serverMessage
              : _messages[kind]!;

          return ApiError(kind, message, statusCode: status, cause: error);
        default:
          return ApiError(ApiErrorKind.unknown, _messages[ApiErrorKind.unknown]!,
              cause: error);
      }
    }

    return ApiError(ApiErrorKind.unknown, _messages[ApiErrorKind.unknown]!, cause: error);
  }

  @override
  String toString() => message;
}
