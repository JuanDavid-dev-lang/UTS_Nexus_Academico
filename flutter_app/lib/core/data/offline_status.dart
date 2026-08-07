import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Si lo que se está viendo salió de la caché, y de cuándo es.
///
/// Vive fuera de las pantallas porque el que lo descubre es el repositorio —es
/// quien intenta la petición y la ve fallar— y quien lo tiene que contar es la
/// barra de arriba. Un dato de ayer presentado como el de ahora es la clase de
/// error que solo se nota cuando ya se tomó una decisión con él.
class OfflineStatus {
  OfflineStatus._();
  static final instance = OfflineStatus._();

  final _controller = StreamController<DateTime?>.broadcast();
  DateTime? _desde;

  /// Fecha de los datos cacheados que se están mostrando, o null si son frescos.
  DateTime? get desde => _desde;
  Stream<DateTime?> get cambios => _controller.stream;

  void marcarDesdeCache(DateTime guardadoEn) {
    if (_desde == guardadoEn) return;
    _desde = guardadoEn;
    _controller.add(_desde);
  }

  void marcarEnLinea() {
    if (_desde == null) return;
    _desde = null;
    _controller.add(null);
  }
}

/// Emite la fecha de los datos cacheados en pantalla, o null si son del servidor.
final offlineStatusProvider = StreamProvider<DateTime?>((ref) async* {
  // El primer valor es el actual: sin él, la barra tardaría en aparecer hasta
  // la siguiente lectura fallida.
  yield OfflineStatus.instance.desde;
  yield* OfflineStatus.instance.cambios;
});
