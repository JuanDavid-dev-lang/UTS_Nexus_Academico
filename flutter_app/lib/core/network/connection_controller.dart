import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../config.dart';
import './api_client.dart';
import './realtime_service.dart';
import './server_discovery.dart';

/// Estado de la conexión con el servidor.
enum ConnectionPhase {
  /// Aún no se sabe: se está probando el último servidor conocido.
  checking,

  /// Barriendo la red en busca del servidor.
  discovering,

  /// Hay un servidor respondiendo y con base de datos.
  connected,

  /// El servidor responde pero no alcanza la base de datos.
  degraded,

  /// No se encontró ningún servidor.
  notFound,
}

class ServerConnectionState {
  final ConnectionPhase phase;
  final String? baseUrl;
  final String? detail;

  /// Avance del barrido, de 0 a 1. Solo tiene sentido en [ConnectionPhase.discovering].
  final double progress;

  const ServerConnectionState({
    required this.phase,
    this.baseUrl,
    this.detail,
    this.progress = 0,
  });

  bool get isUsable => phase == ConnectionPhase.connected;

  ServerConnectionState copyWith({
    ConnectionPhase? phase,
    String? baseUrl,
    String? detail,
    double? progress,
  }) {
    return ServerConnectionState(
      phase: phase ?? this.phase,
      baseUrl: baseUrl ?? this.baseUrl,
      detail: detail ?? this.detail,
      progress: progress ?? this.progress,
    );
  }
}

/// Resuelve a qué servidor hablar, sin pedirle la IP al usuario.
///
/// Orden de intentos:
///   1. El último servidor que funcionó (guardado en el dispositivo).
///   2. El servidor de producción que trae la app de fábrica.
///   3. Barrido de la red local, por si hay un despliegue propio en el campus.
///   4. Entrada manual, como último recurso, desde Ajustes.
///
/// El paso 2 es el que hace que la app funcione recién instalada. Antes se
/// pasaba directamente al barrido, que fuera de la red del campus no encuentra
/// nada y dejaba al docente frente a una casilla pidiéndole una dirección IP.
/// El barrido se conserva después, no antes: sigue sirviendo a quien tenga el
/// backend en su propia red, pero ya no es el camino habitual.
class ConnectionController extends StateNotifier<ServerConnectionState> {
  ConnectionController()
      : super(const ServerConnectionState(phase: ConnectionPhase.checking));

  static const _serverKey = 'server_base_url';

  /// Aplica una URL a las dos capas que hablan con el servidor.
  void _apply(String baseUrl) {
    ApiClient.instance.setBaseUrl(baseUrl);
    RealtimeService.instance.setBaseUrl(baseUrl);
  }

  Future<String?> _savedServer() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_serverKey);
  }

  Future<void> _remember(String baseUrl) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_serverKey, baseUrl);
  }

  /// Punto de entrada al arrancar la app.
  Future<void> initialize() async {
    state = const ServerConnectionState(phase: ConnectionPhase.checking);

    final saved = await _savedServer();
    if (saved != null && await _tryUrl(saved)) return;

    // El de fábrica antes del barrido: es el que responde en el 99% de los
    // casos y evita un escaneo de 254 direcciones que no va a encontrar nada.
    if (await _tryUrl(AppConfig.defaultWsBaseUrl)) return;

    await discover();
  }

  /// Comprueba una URL concreta y la adopta si responde.
  Future<bool> _tryUrl(String baseUrl) async {
    final uri = Uri.tryParse(baseUrl);
    if (uri == null || uri.host.isEmpty) return false;

    // El puerto sale del propio esquema cuando no viene escrito: en
    // `https://servidor` es el 443, no el 4000 del despliegue local. Asumir
    // siempre 4000 construía una dirección que nunca responde.
    final seguro = uri.scheme == 'https';
    final puerto = uri.hasPort
        ? uri.port
        : (seguro ? 443 : ServerDiscovery.defaultPort);

    final server = await ServerDiscovery.probe(uri.host, port: puerto, seguro: seguro);
    if (server == null) return false;

    _apply(server.baseUrl);
    await _remember(server.baseUrl);

    state = ServerConnectionState(
      phase: server.isUsable ? ConnectionPhase.connected : ConnectionPhase.degraded,
      baseUrl: server.baseUrl,
      detail: server.isUsable
          ? 'Conectado a ${server.host}'
          : 'El servidor responde pero no alcanza la base de datos.',
    );
    return true;
  }

  /// Barre la red buscando el servidor.
  Future<void> discover() async {
    state = const ServerConnectionState(phase: ConnectionPhase.discovering);

    final server = await ServerDiscovery.findFirst(
      onProgress: (done, total) {
        if (!mounted) return;
        state = state.copyWith(progress: total == 0 ? 0 : done / total);
      },
    );

    if (server == null) {
      state = const ServerConnectionState(
        phase: ConnectionPhase.notFound,
        detail:
            'No encontramos el servidor en tu red. Verifica que esté encendido '
            'y que el teléfono esté en la misma red Wi-Fi.',
      );
      return;
    }

    _apply(server.baseUrl);
    await _remember(server.baseUrl);

    state = ServerConnectionState(
      phase: server.isUsable ? ConnectionPhase.connected : ConnectionPhase.degraded,
      baseUrl: server.baseUrl,
      detail: server.isUsable
          ? 'Encontrado en ${server.host}'
          : 'El servidor responde pero no alcanza la base de datos.',
    );
  }

  /// Entrada manual desde Ajustes, para redes donde el barrido no llega
  /// (por ejemplo con aislamiento de clientes activado en el router).
  Future<bool> setManual(String input) async {
    var value = input.trim();
    if (value.isEmpty) return false;
    if (!value.startsWith('http://') && !value.startsWith('https://')) {
      value = 'http://$value';
    }
    value = value.replaceAll(RegExp(r'/+$'), '').replaceAll('/api/v1', '');

    final uri = Uri.tryParse(value);
    if (uri == null || uri.host.isEmpty) return false;

    // Si no se indicó puerto, se asume el nuestro.
    final normalized = uri.hasPort ? value : '$value:${ServerDiscovery.defaultPort}';
    return _tryUrl(normalized);
  }
}

final connectionControllerProvider =
    StateNotifierProvider<ConnectionController, ServerConnectionState>((ref) {
  return ConnectionController();
});
