/// Servidor al que apunta la aplicación.
///
/// Antes cada instalación empezaba apuntando a `10.0.2.2` —la máquina anfitriona
/// vista desde el emulador—, así que en un teléfono de verdad la app no
/// encontraba nada y había que escribir una dirección IP a mano. Ahora arranca
/// contra el servidor de producción y funciona nada más instalarla; la entrada
/// manual sigue existiendo en Ajustes para quien despliegue el suyo.
///
/// En desarrollo se apunta a la máquina local sin tocar el código:
///
///     flutter run --dart-define=SERVER_URL=http://10.0.2.2:4000
class AppConfig {
  /// Servidor de producción. Una sola definición para HTTP y WebSocket.
  static const String servidorPorDefecto = 'https://3-14-147-55.sslip.io';

  /// Permite apuntar a otro servidor al compilar, sin modificar el código.
  static const String _servidorCompilado =
      String.fromEnvironment('SERVER_URL', defaultValue: '');

  static String get _base =>
      _servidorCompilado.isNotEmpty ? _servidorCompilado : servidorPorDefecto;

  static String get defaultApiBaseUrl => normalizeApiBaseUrl(_base);

  static String get defaultWsBaseUrl => normalizeWsBaseUrl(_base);

  static String normalizeApiBaseUrl(String value) {
    final trimmed = value.trim().replaceAll(RegExp(r'/+$'), '');
    if (trimmed.endsWith('/api/v1')) return trimmed;
    return '$trimmed/api/v1';
  }

  static String normalizeWsBaseUrl(String value) {
    return value.trim().replaceAll(RegExp(r'/+$'), '');
  }
}
