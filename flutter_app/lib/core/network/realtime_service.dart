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

  /// La conexión está suspendida porque la aplicación pasó a segundo plano.
  /// Se distingue de "desconectado" a propósito: `reanudar()` solo reconecta lo
  /// que él mismo cerró, así que volver a primer plano sin sesión no abre nada.
  bool _enPausa = false;

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

  /// Reintento programado cuando el servidor rechazó el handshake y la
  /// renovación no llegó a ninguna parte (servidor reiniciando, 502 del
  /// túnel). Socket.io no reintenta solo tras un rechazo: sin esto la
  /// conexión quedaba muerta hasta reiniciar la aplicación.
  Timer? _reintento;
  int _reintentosSeguidos = 0;

  void connect({required String token}) {
    _token = token;
    _enPausa = false;
    _refreshAttempted = false;
    _reintento?.cancel();
    _cerrarSocket();
    _publicar(RealtimeStatus.connecting);

    final socket = io.io(
      _wsBaseUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          // Sin `forceNew`, `io.io()` reutiliza el Manager en caché y este
          // devuelve el Socket de la conexión anterior —ya destruido, con el
          // token viejo y sin abrir—: tras volver de segundo plano o renovar
          // el token, la app se quedaba en «Reconectando…» para siempre.
          .enableForceNew()
          .enableAutoConnect()
          // El backend valida el JWT en el handshake (auth.token). Como
          // función, se lee en cada intento: la reconexión automática tras
          // un corte de red manda el token vigente, no el del arranque.
          .setAuthFn((enviar) => enviar({'token': _token ?? ''}))
          // Sin declararlas, `socket_io_client` reintenta cada 5 s para
          // siempre. Con el wifi del campus caído —que no es un caso raro— eso
          // es despertar la radio doce veces por minuto sin que nada vaya a
          // conectar. El techo de 30 s deja la reconexión rápida cuando la red
          // vuelve enseguida y barata cuando no vuelve en toda la clase.
          .setReconnectionDelay(1000)
          .setReconnectionDelayMax(30000)
          .build(),
    );
    _socket = socket;

    // Un socket cerrado puede seguir emitiendo un momento después de
    // sustituirlo; lo que diga ya no describe la conexión actual.
    bool vigente() => identical(_socket, socket);

    socket.onConnect((_) {
      if (!vigente()) return;
      _refreshAttempted = false;
      _reintentosSeguidos = 0;
      _publicar(RealtimeStatus.connected);
    });

    socket.onDisconnect((_) {
      if (vigente()) _publicar(RealtimeStatus.disconnected);
    });

    // El rechazo del servidor llega como `error` en este cliente de Dart
    // (`CONNECT_ERROR` → `emit('error')`), no como `connect_error` igual que
    // en el de JavaScript. Escuchando solo `onConnectError` nunca se veía.
    void alFallar(dynamic error) {
      if (vigente()) unawaited(_alFallarConexion(error));
    }

    socket.onConnectError(alFallar);
    socket.onError(alFallar);

    socket.on('sync:update', (data) {
      if (data is Map) {
        _events.add(Map<String, dynamic>.from(data));
      }
    });

    socket.on('notification:new', (data) {
      if (data is Map) {
        _notifications.add(Map<String, dynamic>.from(data));
      }
    });
  }

  /// Un fallo de red lo reintenta el Manager solo. Un rechazo de credenciales
  /// no: se renueva el token una vez y, si la renovación no cambió nada, se
  /// vuelve a intentar con retroceso.
  Future<void> _alFallarConexion(dynamic error) async {
    final rechazo = error.toString().contains('unauthorized');
    if (!rechazo) {
      _publicar(RealtimeStatus.error);
      return;
    }
    if (_refreshAttempted) {
      _publicar(RealtimeStatus.unauthorized);
      _programarReintento();
      return;
    }
    _refreshAttempted = true;
    // Mientras se renueva no hay nada que avisar: es lo normal tras quince
    // minutos sin pedir nada al servidor.
    _publicar(RealtimeStatus.connecting);
    final tokenAntes = _token;
    await onUnauthorized?.call();
    // Si la renovación fue bien, `updateToken` ya reconectó con el nuevo.
    if (_token == tokenAntes && !_enPausa && _token != null) {
      _publicar(RealtimeStatus.unauthorized);
      _programarReintento();
    }
  }

  void _programarReintento() {
    if (_enPausa || _token == null) return;
    _reintento?.cancel();
    final segundos = [5, 10, 20, 30][_reintentosSeguidos.clamp(0, 3)];
    _reintentosSeguidos++;
    _reintento = Timer(Duration(seconds: segundos), () {
      final token = _token;
      if (token != null && !_enPausa) connect(token: token);
    });
  }

  void _cerrarSocket() {
    final anterior = _socket;
    _socket = null;
    anterior?.dispose();
  }

  /// Suelta la conexión mientras la aplicación no está en pantalla.
  ///
  /// El socket solo sirve para refrescar lo que alguien está mirando: lo que
  /// tiene que llegar con la aplicación cerrada llega por push del servidor y
  /// por las alarmas locales de los recordatorios. Mantenerlo abierto en
  /// segundo plano no adelanta nada y cuesta un `ping` cada veinticinco
  /// segundos —o un intento de reconexión cada treinta, que es peor— con el
  /// teléfono en el bolsillo.
  ///
  /// Guarda el token: `reanudar()` tiene que poder volver sin pasar por la
  /// sesión, porque cerrar sesión es [dispose] y esto no lo es.
  void pausar() {
    if (_socket == null || _enPausa) return;
    _enPausa = true;
    _reintento?.cancel();
    _cerrarSocket();
    _publicar(RealtimeStatus.disconnected);
  }

  /// Vuelve a conectar al regresar a primer plano.
  ///
  /// No hace nada si no había conexión que pausar: sin sesión iniciada no hay
  /// token, y conectar aquí abriría un socket que el backend rechazaría.
  void reanudar() {
    if (!_enPausa) return;
    _enPausa = false;
    final token = _token;
    if (token == null) return;
    connect(token: token);
  }

  /// Reintenta ya, sin esperar al retroceso del Manager. Lo pide el indicador
  /// de conexión cuando el docente toca «Reintentar ahora».
  void reconectarAhora() {
    final token = _token;
    if (token == null || _enPausa) return;
    if (_estadoActual == RealtimeStatus.connected) return;
    connect(token: token);
  }

  /// Reconecta con el token vigente tras una renovación.
  ///
  /// Rehace la conexión: el token viaja en el handshake, así que cambiarlo
  /// sin reconectar no tendría efecto hasta la siguiente caída.
  void updateToken(String token) {
    if (token == _token) return;
    _token = token;
    if (_socket == null || _enPausa) return;
    connect(token: token);
  }

  void dispose() {
    _reintento?.cancel();
    _reintentosSeguidos = 0;
    _cerrarSocket();
    _token = null;
    _refreshAttempted = false;
    _enPausa = false;
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
