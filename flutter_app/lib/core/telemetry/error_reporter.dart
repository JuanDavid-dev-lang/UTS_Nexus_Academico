import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../network/api_client.dart';
import '../auth/session_storage.dart';

/// Reporte de defectos del cliente móvil.
///
/// Cuatro reglas, y ninguna es opcional. Un reportador de fallos mal hecho
/// empeora exactamente la situación que pretende diagnosticar:
///
///  1. **Deduplica antes de enviar.** Una pantalla que falla en bucle produce
///     el mismo error decenas de veces por minuto. Mandarlos todos agotaría el
///     cupo de peticiones del docente justo cuando la aplicación ya está rota.
///  2. **Un fallo al reportar no se reporta.** El envío que falla se descarta.
///     Reintentar sería la forma más rápida de convertir un error en un bucle.
///  3. **La cola sin red es pequeña y no guarda nada personal.** Como mucho
///     diez firmas en memoria; no se persiste en disco. Un archivo con trazas
///     de error en el teléfono de un docente es un archivo con nombres de
///     estudiantes dentro.
///  4. **Nunca se manda lo que no hace falta.** Ni cuerpos, ni respuestas, ni
///     identificadores. El servidor vuelve a sanear, pero eso es la segunda
///     barrera, no la primera.
class ErrorReporter {
  ErrorReporter._();
  static final ErrorReporter instance = ErrorReporter._();

  /// Firmas ya enviadas, con el instante del último envío.
  final Map<String, DateTime> _enviadas = {};

  /// Reportes que no se pudieron enviar por falta de red.
  final List<Map<String, dynamic>> _pendientes = [];

  /// Ventana de silencio por firma. Cinco minutos: el defecto no cambia antes.
  static const Duration _ventana = Duration(minutes: 5);

  /// Tope de firmas distintas recordadas. Sin él, un error con un número
  /// dentro del mensaje generaría una firma nueva por ocurrencia.
  static const int _topeFirmas = 50;

  /// Tope de la cola sin red. Diez y no cien: si hay diez defectos distintos
  /// esperando, el problema ya está diagnosticado.
  static const int _topeCola = 10;

  String _version = '';
  String _rutaActual = '';
  bool _instalado = false;

  /// Ruta que se está mostrando. La actualiza el router en cada navegación.
  set rutaActual(String valor) {
    // Sin identificadores: `/subjects/64f…` y `/subjects/650…` son la misma
    // pantalla, y conservarlos distintos además dejaría el id de una materia
    // escrito en la telemetría.
    _rutaActual = valor.replaceAll(RegExp(r'/[0-9a-fA-F]{24}(?=/|$)'), '/:id');
  }

  /// Engancha los dos canales de error de Flutter.
  ///
  /// `FlutterError.onError` recoge lo que falla dentro del árbol de widgets y
  /// `PlatformDispatcher.onError` lo que escapa de una zona asíncrona. Con solo
  /// el primero, la mitad de los defectos reales —los de una petición que
  /// revienta— no llegarían nunca al panel.
  Future<void> instalar() async {
    if (_instalado) return;
    _instalado = true;

    try {
      _version = (await PackageInfo.fromPlatform()).version;
    } catch (_) {
      // Sin versión se reporta igual: saber que algo falla vale más que saber
      // en qué versión exacta.
      _version = '';
    }

    final anterior = FlutterError.onError;
    FlutterError.onError = (detalles) {
      // La presentación por defecto se conserva: en desarrollo es donde se
      // diagnostica, y quitarla dejaría la consola muda.
      anterior?.call(detalles);
      unawaited(reportar(
        detalles.exception,
        categoria: 'render',
        pila: detalles.stack,
      ));
    };

    PlatformDispatcher.instance.onError = (error, pila) {
      unawaited(reportar(error, categoria: 'unhandled', pila: pila));
      // `true` = «ya está atendido». Devolver `false` haría que la plataforma
      // lo tratara como fatal y cerrara la aplicación por un error que ya se
      // ha registrado.
      return true;
    };
  }

  /// Firma local, solo para deduplicar antes de enviar.
  ///
  /// La firma que agrupa de verdad la calcula el servidor: si la decidiera el
  /// teléfono, dos versiones de la aplicación agruparían distinto el mismo
  /// defecto y el panel lo mostraría tres veces.
  String _firma(String categoria, String mensaje) {
    final normalizado = mensaje.replaceAll(RegExp(r'\d+'), '#');
    final recortado =
        normalizado.length > 120 ? normalizado.substring(0, 120) : normalizado;
    return '$categoria|$_rutaActual|$recortado';
  }

  /// Reporta un defecto. Nunca lanza: quien llama está en mitad de un fallo.
  Future<void> reportar(
    Object? causa, {
    String categoria = 'runtime',
    StackTrace? pila,
  }) async {
    // Sin sesión no hay a quién atribuirlo y el endpoint exige autenticación.
    // Un error en la pantalla de login se queda en la consola, que es donde se
    // diagnostica de todas formas.
    final sesion = await SessionStorage().load();
    final token = sesion['accessToken'];
    if (token == null || token.isEmpty) return;

    final mensaje = causa is Error
        ? causa.toString()
        : causa?.toString() ?? 'Error desconocido';
    if (mensaje.isEmpty) return;

    final firma = _firma(categoria, mensaje);
    final ahora = DateTime.now();
    final ultimo = _enviadas[firma];
    if (ultimo != null && ahora.difference(ultimo) < _ventana) return;

    if (_enviadas.length >= _topeFirmas) _enviadas.clear();
    _enviadas[firma] = ahora;

    final carga = <String, dynamic>{
      'client': 'mobile',
      'appVersion': _version,
      'platform': defaultTargetPlatform.name,
      'route': _rutaActual,
      'category': categoria,
      'message': mensaje.length > 1000 ? mensaje.substring(0, 1000) : mensaje,
      // Ocho líneas: lo de más abajo es del framework y no dice nada del
      // defecto. Y acota lo que viaja por una red de aula.
      'context': pila == null
          ? ''
          : pila.toString().split('\n').take(8).join('\n'),
    };

    await _enviar(carga);
  }

  Future<void> _enviar(Map<String, dynamic> carga) async {
    try {
      await ApiClient.instance.post('/telemetry/errores', data: carga);
      // Con red recuperada se vacía lo que quedó esperando, de uno en uno para
      // no disparar diez peticiones a la vez sobre el wifi de un aula.
      await _vaciarCola();
    } catch (_) {
      // Silencio deliberado: reportar el fallo del reportador es un bucle.
      if (_pendientes.length < _topeCola) _pendientes.add(carga);
    }
  }

  Future<void> _vaciarCola() async {
    if (_pendientes.isEmpty) return;
    final cola = List<Map<String, dynamic>>.from(_pendientes);
    _pendientes.clear();
    for (final carga in cola) {
      try {
        await ApiClient.instance.post('/telemetry/errores', data: carga);
      } catch (_) {
        // Vuelve a la cola una sola vez; si sigue sin red, se pierde. Un
        // reintento indefinido es una cola que crece sin final.
        if (_pendientes.length < _topeCola) _pendientes.add(carga);
        return;
      }
    }
  }
}
