import 'package:socket_io_client/socket_io_client.dart' as io;
import 'dart:async';
import '../config.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Estado de la conexión en tiempo real.
///
/// Existe porque la versión anterior no lo publicaba: `onConnect` estaba vacío y
/// no había manejador de error, así que una conexión rechazada era
/// indistinguible de "no ha cambiado nada todavía".
enum RealtimeStatus { disconnected, connecting, connected, unauthorized, error }

class RealtimeService {
  RealtimeService._();
  static final instance = RealtimeService._();

  io.Socket? _socket;
  final StreamController<Map<String, dynamic>> _events =
      StreamController.broadcast();
  /// Notificaciones dirigidas a este usuario, por su propio canal.
  ///
  /// Va aparte de `sync:update` porque son dos cosas distintas: uno dice "esta
  /// caché caducó" y el otro "avísale". Mezclarlos obligaría a cada oyente a
  /// distinguirlas, y el que solo quiere invalidar acabaría mostrando avisos.
  final StreamController<Map<String, dynamic>> _notifications =
      StreamController.broadcast();
  final StreamController<RealtimeStatus> _status =
      StreamController.broadcast();
  RealtimeStatus _estadoActual = RealtimeStatus.disconnected;
  String _wsBaseUrl = AppConfig.defaultWsBaseUrl;
  String? _token;

  /// Un intento de renovación por rechazo de credenciales. Lo inyecta la capa
  /// de sesión: este servicio no sabe nada de endpoints de auth.
  Future<void> Function()? onUnauthorized;

  /// Evita encadenar renovaciones cuando el refresh token también está muerto.
  bool _refreshAttempted = false;

  Stream<Map<String, dynamic>> get events => _events.stream;
  Stream<Map<String, dynamic>> get notifications => _notifications.stream;
  Stream<RealtimeStatus> get status => _status.stream;

  /// Estado en este momento. El stream no reemite lo ya ocurrido: sin esto, un
  /// widget que se monta con la conexión ya establecida no sabría en qué estado
  /// está hasta el siguiente cambio.
  RealtimeStatus get estadoActual => _estadoActual;

  void _publicar(RealtimeStatus estado) {
    _estadoActual = estado;
    _status.add(estado);
  }

  void setBaseUrl(String baseUrl) {
    _wsBaseUrl = AppConfig.normalizeWsBaseUrl(baseUrl);
  }

  void connect({required String token}) {
    _token = token;
    _socket?.dispose();
    _publicar(RealtimeStatus.connecting);

    _socket = io.io(
      _wsBaseUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .enableAutoConnect()
          // El backend valida el JWT en el handshake (auth.token) y agrupa por salas.
          .setAuth({'token': token})
          .setExtraHeaders({'Authorization': 'Bearer $token'})
          .build(),
    );

    _socket?.onConnect((_) {
      _refreshAttempted = false;
      _publicar(RealtimeStatus.connected);
    });

    _socket?.onDisconnect((_) => _publicar(RealtimeStatus.disconnected));

    // Socket.io solo autentica en el handshake. Con el token fijado al
    // construir la conexión, cualquier reintento posterior a la expiración del
    // access token se rechazaba una y otra vez con las mismas credenciales
    // muertas: la sincronización se detenía para siempre sin decir nada.
    _socket?.onConnectError((error) {
      final rechazo = error.toString().contains('unauthorized');
      _publicar(rechazo ? RealtimeStatus.unauthorized : RealtimeStatus.error);
      if (!rechazo || _refreshAttempted) return;

      _refreshAttempted = true;
      onUnauthorized?.call();
    });

    _socket?.on('sync:update', (data) {
      if (data is Map) {
        _events.add(Map<String, dynamic>.from(data));
      }
    });

    _socket?.on('notification:new', (data) {
      if (data is Map) {
        _notifications.add(Map<String, dynamic>.from(data));
      }
    });
  }

  /// Reconecta con el token vigente tras una renovación.
  ///
  /// Rehace la conexión en vez de mutar la opción: el token viaja en el
  /// handshake, así que cambiarlo sin reconectar no tendría ningún efecto.
  void updateToken(String token) {
    if (token == _token) return;
    if (_socket == null) {
      _token = token;
      return;
    }
    connect(token: token);
  }

  void dispose() {
    _socket?.dispose();
    _socket = null;
    _token = null;
    _refreshAttempted = false;
    _publicar(RealtimeStatus.disconnected);
  }
}

final realtimeEventsProvider = StreamProvider<Map<String, dynamic>>((ref) {
  return RealtimeService.instance.events;
});

final realtimeStatusProvider = StreamProvider<RealtimeStatus>((ref) async* {
  // El primer valor es el actual: un widget que se monta con la conexión ya
  // establecida se quedaría sin saber en qué estado está hasta el siguiente
  // cambio, y mostraría "sin conexión" estando conectado.
  yield RealtimeService.instance.estadoActual;
  yield* RealtimeService.instance.status;
});

/// Notificaciones que llegan mientras la aplicación está conectada.
final realtimeNotificationsProvider = StreamProvider<Map<String, dynamic>>((ref) {
  return RealtimeService.instance.notifications;
});
