import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Si lo que se está viendo salió de la caché, de cuándo es, y cuándo fue la
/// última vez que hablamos con el servidor.
///
/// Vive fuera de las pantallas porque el que lo descubre es el repositorio —es
/// quien intenta la petición y la ve fallar— y quien lo tiene que contar es la
/// barra de arriba. Un dato de ayer presentado como el de ahora es la clase de
/// error que solo se nota cuando ya se tomó una decisión con él.
class OfflineStatus {
  OfflineStatus._();
  static final instance = OfflineStatus._();

  static const _claveUltimaSync = 'sync.ultima';

  final _controller = StreamController<EstadoDatos>.broadcast();
  DateTime? _desde;
  DateTime? _ultimaSincronizacion;

  /// Fecha de los datos cacheados que se están mostrando, o null si son frescos.
  DateTime? get desde => _desde;

  /// Cuándo respondió el servidor por última vez. Sobrevive a un reinicio de la
  /// aplicación: "última sincronización: hace 4 minutos" tiene que seguir siendo
  /// cierto después de cerrar y abrir.
  DateTime? get ultimaSincronizacion => _ultimaSincronizacion;

  EstadoDatos get estado =>
      EstadoDatos(desdeCache: _desde, ultimaSincronizacion: _ultimaSincronizacion);

  Stream<EstadoDatos> get cambios => _controller.stream;

  /// Recupera del disco la última sincronización conocida. Se llama al arrancar.
  Future<void> cargar() async {
    final prefs = await SharedPreferences.getInstance();
    final marca = prefs.getInt(_claveUltimaSync);
    if (marca == null) return;
    _ultimaSincronizacion = DateTime.fromMillisecondsSinceEpoch(marca);
    _controller.add(estado);
  }

  void marcarDesdeCache(DateTime guardadoEn) {
    if (_desde == guardadoEn) return;
    _desde = guardadoEn;
    _controller.add(estado);
  }

  void marcarEnLinea() {
    final ahora = DateTime.now();
    _desde = null;
    _ultimaSincronizacion = ahora;
    // Se persiste sin esperar: una lectura correcta no debe pagar el coste de
    // escribir en disco, y perder la marca por un cierre brusco solo significa
    // que la próxima lectura la vuelve a poner.
    unawaited(_persistir(ahora));
    // Se emite siempre, aunque ya estuviera en línea: lo que cambió es la hora
    // de la última sincronización, y esa es justo la que muestra la barra.
    _controller.add(estado);
  }

  /// Registra que se ha recibido una actualización en tiempo real desde el servidor.
  void notificarActualizacionEnTiempoReal() {
    final ahora = DateTime.now();
    _desde = null;
    _ultimaSincronizacion = ahora;
    unawaited(_persistir(ahora));
    _controller.add(estado);
  }

  Future<void> _persistir(DateTime momento) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setInt(_claveUltimaSync, momento.millisecondsSinceEpoch);
    } catch (_) {
      // Sin disco disponible se pierde la marca entre arranques, nada más.
    }
  }

  /// Borra la marca. Se llama al cerrar sesión: la hora a la que sincronizó el
  /// docente anterior no le dice nada al siguiente.
  Future<void> limpiar() async {
    _desde = null;
    _ultimaSincronizacion = null;
    _controller.add(estado);
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_claveUltimaSync);
    } catch (_) {
      // Ídem.
    }
  }
}

/// Fotografía del estado de los datos en pantalla.
class EstadoDatos {
  /// Cuándo se guardaron los datos que se están viendo, o null si son del servidor.
  final DateTime? desdeCache;

  /// Cuándo respondió el servidor por última vez.
  final DateTime? ultimaSincronizacion;

  const EstadoDatos({this.desdeCache, this.ultimaSincronizacion});

  bool get esFresco => desdeCache == null;
}

/// Emite el estado de los datos en pantalla.
final offlineStatusProvider = StreamProvider<EstadoDatos>((ref) async* {
  // El primer valor es el actual: sin él, la barra tardaría en aparecer hasta
  // la siguiente lectura fallida.
  yield OfflineStatus.instance.estado;
  yield* OfflineStatus.instance.cambios;
});

/// «hace 5 minutos» dice más que una marca de tiempo: lo que el docente
/// necesita saber es cuánto puede haber cambiado, no cuándo fue exactamente.
String haceCuanto(DateTime? momento, [DateTime? ahora]) {
  if (momento == null) return 'nunca';
  final diferencia = (ahora ?? DateTime.now()).difference(momento);
  if (diferencia.isNegative) return 'hace unos segundos';
  if (diferencia.inMinutes < 1) return 'hace unos segundos';
  if (diferencia.inMinutes < 60) return 'hace ${diferencia.inMinutes} min';
  if (diferencia.inHours < 24) return 'hace ${diferencia.inHours} h';
  if (diferencia.inDays == 1) return 'ayer';
  return 'hace ${diferencia.inDays} días';
}
