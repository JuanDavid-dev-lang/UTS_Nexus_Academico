import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:uts_academico/core/config.dart';
import 'package:uts_academico/core/network/api_error.dart';

void main() {
  group('AppConfig.normalizeApiBaseUrl', () {
    test('añade el sufijo de la API una sola vez', () {
      expect(AppConfig.normalizeApiBaseUrl('http://192.168.1.5:4000'),
          'http://192.168.1.5:4000/api/v1');
      expect(AppConfig.normalizeApiBaseUrl('http://192.168.1.5:4000/api/v1'),
          'http://192.168.1.5:4000/api/v1');
    });

    test('descarta las barras finales', () {
      expect(AppConfig.normalizeApiBaseUrl('http://192.168.1.5:4000///'),
          'http://192.168.1.5:4000/api/v1');
    });
  });

  group('ApiError', () {
    ApiError fromStatus(int status, {Object? body}) {
      return ApiError.from(
        DioException(
          requestOptions: RequestOptions(path: '/x'),
          type: DioExceptionType.badResponse,
          response: Response(
            requestOptions: RequestOptions(path: '/x'),
            statusCode: status,
            data: body,
          ),
        ),
      );
    }

    test('traduce los códigos HTTP a causas accionables', () {
      expect(fromStatus(401).kind, ApiErrorKind.unauthorized);
      expect(fromStatus(403).kind, ApiErrorKind.forbidden);
      expect(fromStatus(409).kind, ApiErrorKind.conflict);
      expect(fromStatus(500).kind, ApiErrorKind.server);
    });

    test('solo reintenta lo que podría llegar a funcionar', () {
      expect(fromStatus(500).isRetryable, isTrue);
      expect(fromStatus(403).isRetryable, isFalse);
      expect(fromStatus(422).isRetryable, isFalse);
    });

    test('usa el mensaje del servidor en errores de validación', () {
      final error = fromStatus(409, body: {'message': 'Ese código ya está registrado'});
      expect(error.message, 'Ese código ya está registrado');
    });

    test('nunca filtra un error interno del servidor al usuario', () {
      // Respuesta real cuando el backend no alcanza la base de datos.
      final error = fromStatus(500, body: {
        'message': 'Operation `usuarios.findOne()` buffering timed out after 10000ms',
      });
      expect(error.message, isNot(contains('findOne')));
      expect(error.message, contains('servidor'));
    });

    test('un fallo de red no se confunde con uno del servidor', () {
      final error = ApiError.from(DioException(
        requestOptions: RequestOptions(path: '/x'),
        type: DioExceptionType.connectionError,
      ));
      expect(error.kind, ApiErrorKind.network);
      expect(error.isRetryable, isTrue);
    });

    // ── El 403 del registro de docentes ─────────────────────────────────
    //
    // El login responde 403 cuando la cuenta existe pero su registro está en
    // revisión o rechazado, y ese texto sí está escrito para la persona.
    // Descartarlo con el resto de los 403 dejaba al docente pendiente leyendo
    // «No tienes permisos», que parece una avería.

    test('muestra el mensaje de un registro en revisión', () {
      final error = fromStatus(403, body: {
        'estado': 'PENDIENTE',
        'message': 'Tu registro está en revisión. Te avisaremos cuando lo aprueben.',
      });
      expect(error.message, contains('en revisión'));
      expect(error.kind, ApiErrorKind.forbidden);
    });

    test('muestra el motivo del rechazo aunque parezca texto interno', () {
      // El motivo lo teclea la administración: un guion bajo dentro habría
      // bastado para tumbarlo al mensaje genérico.
      final error = fromStatus(403, body: {
        'estado': 'RECHAZADO',
        'message': 'Tu registro fue rechazado: Error en el código_docente.',
      });
      expect(error.message, contains('código_docente'));
    });

    test('acota el motivo largo en vez de descartarlo', () {
      final error = fromStatus(403, body: {'estado': 'RECHAZADO', 'message': 'x' * 600});
      expect(error.message.length, 400);
    });

    test('un 403 sin estado sigue con el mensaje genérico', () {
      // Es el 403 de `requireRole`, cuyo texto es interno.
      final error = fromStatus(403, body: {'message': 'Forbidden'});
      expect(error.message, contains('permisos'));
    });

    test('un estado desconocido no abre la puerta', () {
      final error = fromStatus(403, body: {'estado': 'CUALQUIERA', 'message': 'texto interno'});
      expect(error.message, contains('permisos'));
    });

    test('el estado solo vale en un 403, no en un 401', () {
      final error = fromStatus(401, body: {'estado': 'PENDIENTE', 'message': 'texto interno'});
      expect(error.message, contains('sesión'));
    });

    test('un estado sin mensaje cae al genérico sin reventar', () {
      expect(fromStatus(403, body: {'estado': 'PENDIENTE'}).message, contains('permisos'));
    });
  });
}
