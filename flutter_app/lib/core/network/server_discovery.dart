import 'dart:async';
import 'dart:convert';
import 'dart:io';

/// Descubrimiento automático del servidor en la red local.
///
/// El objetivo es que nadie tenga que escribir una dirección IP. El teléfono ya
/// conoce la suya (por ejemplo 192.168.100.42), así que barre esa misma subred
/// preguntando por `/health` y se queda con quien responda como nuestro backend.
///
/// Alternativas descartadas:
///
///  - **mDNS/Bonjour**: más elegante, pero exige código adicional en el backend
///    y en Android es notoriamente inconsistente según fabricante y versión.
///  - **Difusión UDP**: muchos routers domésticos la filtran entre clientes
///    inalámbricos (aislamiento de AP).
///
/// El barrido es simple y funciona siempre que haya conectividad directa, que es
/// exactamente el escenario de uso. Con 254 sondas en paralelo tarda ~2 s.
class DiscoveredServer {
  final String host;
  final int port;

  /// Estado de la base de datos reportado por `/health`.
  final String databaseStatus;

  /// Milisegundos que tardó en responder. Ordena los candidatos.
  final int latencyMs;

  /// `true` si se alcanzó por HTTPS. El barrido de la red local siempre es
  /// texto plano; el servidor de producción, siempre cifrado.
  final bool seguro;

  const DiscoveredServer({
    required this.host,
    required this.port,
    required this.databaseStatus,
    required this.latencyMs,
    this.seguro = false,
  });

  /// URL completa del servidor.
  ///
  /// El esquema forma parte del hallazgo, no se asume: el backend de producción
  /// está detrás de HTTPS en el puerto 443, y dar por hecho `http://…:4000`
  /// —como se hacía cuando solo existía el despliegue del campus— construía una
  /// dirección que no responde.
  ///
  /// El puerto se omite cuando es el propio del esquema, para que la dirección
  /// que se guarda y se muestra sea la que una persona reconocería.
  String get baseUrl {
    final esquema = seguro ? 'https' : 'http';
    final implicito = seguro ? 443 : 80;
    return port == implicito ? '$esquema://$host' : '$esquema://$host:$port';
  }

  String get apiBaseUrl => '$baseUrl/api/v1';

  /// Un servidor sin base de datos responde, pero no sirve para trabajar.
  bool get isUsable => databaseStatus == 'connected' || databaseStatus == 'unknown';

  @override
  String toString() => '$host:$port ($databaseStatus, ${latencyMs}ms)';
}

class ServerDiscovery {
  static const int defaultPort = 4000;

  /// Tiempo por sonda. Corto a propósito: en una LAN, un host vivo responde en
  /// pocos milisegundos; esperar más solo alarga el barrido por los ausentes.
  static const Duration probeTimeout = Duration(milliseconds: 900);

  /// Direcciones IPv4 privadas del dispositivo, sin loopback ni link-local.
  static Future<List<String>> localAddresses() async {
    final interfaces = await NetworkInterface.list(
      type: InternetAddressType.IPv4,
      includeLoopback: false,
      includeLinkLocal: false,
    );

    return interfaces
        .expand((interface) => interface.addresses)
        .map((address) => address.address)
        .where(_isPrivateIpv4)
        .toList();
  }

  static bool _isPrivateIpv4(String address) {
    final parts = address.split('.');
    if (parts.length != 4) return false;
    final first = int.tryParse(parts[0]) ?? 0;
    final second = int.tryParse(parts[1]) ?? 0;

    if (first == 10) return true;
    if (first == 192 && second == 168) return true;
    if (first == 172 && second >= 16 && second <= 31) return true;
    return false;
  }

  /// Pregunta a un host si es nuestro backend.
  ///
  /// No basta con que algo responda en el puerto 4000: cualquier servicio podría
  /// estar ahí. Se exige que devuelva JSON con `ok: true`, que es la firma de
  /// nuestro `/health`.
  static Future<DiscoveredServer?> probe(
    String host, {
    int port = defaultPort,
    bool seguro = false,
  }) async {
    final stopwatch = Stopwatch()..start();
    final client = HttpClient()
      ..connectionTimeout = probeTimeout
      ..idleTimeout = probeTimeout;

    try {
      final esquema = seguro ? 'https' : 'http';
      final request = await client
          .getUrl(Uri.parse('$esquema://$host:$port/health'))
          .timeout(probeTimeout);
      final response = await request.close().timeout(probeTimeout);

      if (response.statusCode != 200) return null;

      final body = await response
          .transform(utf8.decoder)
          .join()
          .timeout(probeTimeout);
      final decoded = jsonDecode(body);

      if (decoded is! Map || decoded['ok'] != true) return null;

      return DiscoveredServer(
        host: host,
        port: port,
        databaseStatus: (decoded['db'] as String?) ?? 'unknown',
        latencyMs: stopwatch.elapsedMilliseconds,
        seguro: seguro,
      );
    } catch (_) {
      return null;
    } finally {
      client.close(force: true);
    }
  }

  /// Barre la subred /24 de cada dirección local del dispositivo.
  ///
  /// [onProgress] recibe (sondas completadas, total) para poder mostrar avance.
  static Future<List<DiscoveredServer>> scan({
    int port = defaultPort,
    void Function(int done, int total)? onProgress,
  }) async {
    final addresses = await localAddresses();
    if (addresses.isEmpty) return const [];

    // Varias interfaces (Wi-Fi y datos) pueden dar subredes distintas; se
    // recorren todas, sin repetir hosts.
    final targets = <String>{};
    for (final address in addresses) {
      final prefix = address.substring(0, address.lastIndexOf('.'));
      for (var host = 1; host <= 254; host++) {
        targets.add('$prefix.$host');
      }
    }

    final found = <DiscoveredServer>[];
    var completed = 0;
    final total = targets.length;

    // Lotes para no abrir 254 sockets a la vez: Android limita los descriptores
    // por proceso y saturarlos produce falsos negativos.
    const batchSize = 48;
    final list = targets.toList();

    for (var start = 0; start < list.length; start += batchSize) {
      final batch = list.skip(start).take(batchSize);
      final results = await Future.wait(
        batch.map((host) async {
          final server = await probe(host, port: port);
          completed++;
          onProgress?.call(completed, total);
          return server;
        }),
      );
      found.addAll(results.whereType<DiscoveredServer>());
    }

    // El más rápido primero: suele ser el del mismo segmento de red.
    found.sort((a, b) => a.latencyMs.compareTo(b.latencyMs));
    return found;
  }

  /// Devuelve el primer servidor utilizable, o `null` si no hay ninguno.
  ///
  /// Prueba primero los candidatos obvios (emulador y localhost) porque
  /// responden de inmediato y evitan el barrido completo en desarrollo.
  static Future<DiscoveredServer?> findFirst({
    int port = defaultPort,
    void Function(int done, int total)? onProgress,
  }) async {
    for (final host in const ['10.0.2.2', '127.0.0.1']) {
      final server = await probe(host, port: port);
      if (server != null) return server;
    }

    final servers = await scan(port: port, onProgress: onProgress);
    if (servers.isEmpty) return null;

    // Se prefiere uno con base de datos conectada; si ninguno la tiene, se
    // devuelve el más rápido igual, para que la app pueda explicar el problema.
    return servers.firstWhere(
      (server) => server.isUsable,
      orElse: () => servers.first,
    );
  }
}
