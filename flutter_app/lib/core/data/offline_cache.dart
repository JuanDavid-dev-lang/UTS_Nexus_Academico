import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// Caché local de lo último que respondió el servidor.
///
/// La aplicación se usa en un salón, que es exactamente donde el wifi
/// institucional falla. Hasta ahora, sin red no se mostraba un solo dato: el
/// docente abría la app delante del curso y veía errores. Con esto ve lo último
/// que sí llegó, fechado, y sabe que está mirando una foto y no el presente.
///
/// Guarda JSON en `SharedPreferences` en vez de montar una base local. Es una
/// decisión consciente: lo que se cachea son unas pocas listas por materia, no
/// un histórico, y una base de datos embebida traería migraciones y un esquema
/// que mantener a cambio de nada que aquí haga falta.
class OfflineCache {
  static const _prefijo = 'cache.';
  static const _sufijoFecha = '.at';

  /// Más allá de esto lo guardado deja de ofrecerse: unas notas de hace un mes
  /// no son «los datos», son un recuerdo, y mostrarlas como si fueran actuales
  /// es peor que decir que no hay nada.
  static const maxAntiguedad = Duration(days: 7);

  static Future<void> save(String clave, Object dato) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('$_prefijo$clave', jsonEncode(dato));
    await prefs.setInt(
      '$_prefijo$clave$_sufijoFecha',
      DateTime.now().millisecondsSinceEpoch,
    );
  }

  /// Devuelve lo guardado y cuándo se guardó, o null si no hay o ya caducó.
  static Future<({Object? dato, DateTime guardadoEn})?> read(
      String clave) async {
    final prefs = await SharedPreferences.getInstance();
    final crudo = prefs.getString('$_prefijo$clave');
    if (crudo == null) return null;

    final marca = prefs.getInt('$_prefijo$clave$_sufijoFecha');
    if (marca == null) return null;

    final guardadoEn = DateTime.fromMillisecondsSinceEpoch(marca);
    if (DateTime.now().difference(guardadoEn) > maxAntiguedad) return null;

    try {
      return (dato: jsonDecode(crudo) as Object?, guardadoEn: guardadoEn);
    } catch (_) {
      // Un JSON corrupto se trata como ausencia: no hay nada que recuperar.
      return null;
    }
  }

  /// Borra todo lo cacheado. Se llama al cerrar sesión: los datos de un docente
  /// no pueden quedar legibles para el siguiente que entre en el mismo teléfono.
  static Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    final claves =
        prefs.getKeys().where((k) => k.startsWith(_prefijo)).toList();
    for (final clave in claves) {
      await prefs.remove(clave);
    }
  }
}

/// Resultado de una lectura que pudo venir del servidor o de la caché.
///
/// El origen viaja con el dato a propósito: una pantalla que no sabe si está
/// mirando el presente o una foto de ayer no puede decírselo al docente, y esa
/// es justo la diferencia que importa antes de pasar lista.
class Cached<T> {
  final T data;
  final bool fromCache;
  final DateTime? cachedAt;

  const Cached(this.data, {this.fromCache = false, this.cachedAt});
}
