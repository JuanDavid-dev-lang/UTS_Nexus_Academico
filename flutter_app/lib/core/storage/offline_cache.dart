import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import './offline_status.dart';

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


/// Lee una lista del servidor con respaldo en caché.
///
/// El mismo contrato que `AcademicRepository._leerConCache`, disponible para
/// cualquier repositorio: se intenta la red, lo que llega se guarda y se marca
/// en línea; si falla, se sirve lo último guardado —fechado, vía
/// [OfflineStatus]— y solo si no hay nada el error sube. Existe para que
/// «funciona sin red» sea una propiedad de toda lectura y no un privilegio de
/// las pantallas que alguien se acordó de cachear.
///
/// Solo LECTURAS. Una escritura sin red no puede fingirse con lo guardado.
Future<List<Map<String, dynamic>>> listaConCache(
  String clave,
  Future<List<Map<String, dynamic>>> Function() pedir,
) async {
  try {
    final items = await pedir();
    await OfflineCache.save(clave, items);
    OfflineStatus.instance.marcarEnLinea();
    return items;
  } catch (_) {
    final guardado = await OfflineCache.read(clave);
    if (guardado == null) rethrow;
    OfflineStatus.instance.marcarDesdeCache(guardado.guardadoEn);
    return (guardado.dato as List)
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
  }
}

/// Igual que [listaConCache] pero para una respuesta que es un objeto, no una
/// lista: el resumen del panel, unas preferencias.
Future<Map<String, dynamic>> mapaConCache(
  String clave,
  Future<Map<String, dynamic>> Function() pedir,
) async {
  try {
    final cuerpo = await pedir();
    await OfflineCache.save(clave, cuerpo);
    OfflineStatus.instance.marcarEnLinea();
    return cuerpo;
  } catch (_) {
    final guardado = await OfflineCache.read(clave);
    if (guardado == null || guardado.dato is! Map) rethrow;
    OfflineStatus.instance.marcarDesdeCache(guardado.guardadoEn);
    return Map<String, dynamic>.from(guardado.dato as Map);
  }
}
