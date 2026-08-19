import '../../../core/data/campus_time.dart';
import '../../../core/storage/offline_cache.dart';
import '../../../core/storage/offline_status.dart';
import './agenda_models.dart';
import '../../../core/network/api_client.dart';

/// Acceso a la agenda académica.
///
/// Lee con caché, como el resto de lecturas de la app: en un salón sin red el
/// docente sigue viendo el horario que ya se había sincronizado, fechado, y la
/// franja de arriba dice de cuándo es. Un horario de la semana pasada
/// presentado como el de hoy sería peor que no enseñar nada.
///
/// Las escrituras (crear o borrar un evento) NO se resuelven con caché: si un
/// parcial no llegó al servidor, no está puesto, y fingir que sí es la clase de
/// error que se descubre el día del parcial.
class AgendaRepository {
  final ApiClient _api = ApiClient.instance;

  List<Map<String, dynamic>> _items(Object? data) {
    if (data is! Map) return const [];
    final items = data['items'];
    if (items is! List) return const [];
    return items.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
  }

  /// Agenda de un rango. La clave de caché incluye las fechas: cada semana es
  /// una consulta distinta y no puede pisar a la anterior.
  Future<AgendaRango> rango({
    required DateTime desde,
    required DateTime hasta,
    String? materiaId,
  }) async {
    final clave = 'agenda.${desde.toIso8601String()}.${hasta.toIso8601String()}.${materiaId ?? "todas"}';

    try {
      final respuesta = await _api.get('/agenda', query: {
        'from': desde.toUtc().toIso8601String(),
        'to': hasta.toUtc().toIso8601String(),
        if (materiaId != null) 'subjectId': materiaId,
      });

      final cuerpo = respuesta.data as Map;
      final offset = cuerpo['campusOffsetMinutes'] is num
          ? (cuerpo['campusOffsetMinutes'] as num).round()
          : offsetCampusPorDefecto;
      final items = _items(cuerpo);

      await OfflineCache.save(clave, {'campusOffsetMinutes': offset, 'items': items});
      OfflineStatus.instance.marcarEnLinea();

      return AgendaRango(
        items: items.map(AgendaItem.fromJson).toList(),
        offsetCampusMinutos: offset,
      );
    } catch (error) {
      final guardado = await OfflineCache.read(clave);
      if (guardado == null) rethrow;

      OfflineStatus.instance.marcarDesdeCache(guardado.guardadoEn);
      final cuerpo = Map<String, dynamic>.from(guardado.dato as Map);
      return AgendaRango(
        items: _items(cuerpo).map(AgendaItem.fromJson).toList(),
        offsetCampusMinutos: cuerpo['campusOffsetMinutes'] is num
            ? (cuerpo['campusOffsetMinutes'] as num).round()
            : offsetCampusPorDefecto,
      );
    }
  }

  /// Clase actual y próxima. Es lo que alimenta la tarjeta destacada.
  Future<AgendaResumen> resumen() async {
    try {
      final respuesta = await _api.get('/agenda/resumen');
      final cuerpo = Map<String, dynamic>.from(respuesta.data as Map);
      await OfflineCache.save('agenda.resumen', cuerpo);
      OfflineStatus.instance.marcarEnLinea();
      return AgendaResumen.fromJson(cuerpo);
    } catch (error) {
      final guardado = await OfflineCache.read('agenda.resumen');
      if (guardado == null) rethrow;
      OfflineStatus.instance.marcarDesdeCache(guardado.guardadoEn);
      return AgendaResumen.fromJson(Map<String, dynamic>.from(guardado.dato as Map));
    }
  }

  Future<void> crearEvento(Map<String, dynamic> datos) async {
    await _api.post('/agenda/events', data: datos);
  }

  Future<void> actualizarEvento(String id, Map<String, dynamic> datos) async {
    await _api.patch('/agenda/events/$id', data: datos);
  }

  Future<void> eliminarEvento(String id) async {
    await _api.delete('/agenda/events/$id');
  }
}

/// Preferencias de notificación. Viven en el servidor para que el teléfono y el
/// escritorio del mismo docente no discrepen sobre cuándo avisar.
class NotificationPrefsRepository {
  final ApiClient _api = ApiClient.instance;

  Future<({PreferenciasNotificacion preferencias, bool pushConfigurado})> leer() async {
    try {
      final respuesta = await _api.get('/notifications/preferences');
      final cuerpo = Map<String, dynamic>.from(respuesta.data as Map);
      await OfflineCache.save('notificaciones.preferencias', cuerpo);
      return (
        preferencias:
            PreferenciasNotificacion.fromJson(Map<String, dynamic>.from(cuerpo['preferences'] as Map)),
        pushConfigurado: cuerpo['pushConfigurado'] == true,
      );
    } catch (error) {
      // Sin red se usan las últimas conocidas: son las que ya está aplicando el
      // programador de alarmas locales, así que la pantalla no debe contradecirlo.
      final guardado = await OfflineCache.read('notificaciones.preferencias');
      if (guardado == null) rethrow;
      final cuerpo = Map<String, dynamic>.from(guardado.dato as Map);
      return (
        preferencias:
            PreferenciasNotificacion.fromJson(Map<String, dynamic>.from(cuerpo['preferences'] as Map)),
        pushConfigurado: cuerpo['pushConfigurado'] == true,
      );
    }
  }

  Future<PreferenciasNotificacion> guardar(Map<String, dynamic> cambios) async {
    final respuesta = await _api.put<Map<String, dynamic>>(
      '/notifications/preferences',
      data: cambios,
    );
    final cuerpo = Map<String, dynamic>.from(respuesta.data as Map);
    await OfflineCache.save('notificaciones.preferencias', cuerpo);
    return PreferenciasNotificacion.fromJson(
      Map<String, dynamic>.from(cuerpo['preferences'] as Map),
    );
  }

  /// Registra el token de push del dispositivo.
  ///
  /// [recordatoriosLocales] le dice al servidor que este teléfono programa sus
  /// propios avisos de clase; con eso, el servidor NO le manda push de clase y
  /// el docente no recibe el mismo recordatorio dos veces.
  Future<void> registrarDispositivo({
    required String token,
    String plataforma = 'ANDROID',
    String nombre = '',
    String version = '',
    bool recordatoriosLocales = true,
  }) async {
    await _api.post('/notifications/devices', data: {
      'token': token,
      'platform': plataforma,
      'deviceName': nombre,
      'appVersion': version,
      'localClassReminders': recordatoriosLocales,
    });
  }

  /// Da de baja el token al cerrar sesión.
  ///
  /// El servidor solo acepta la baja del dueño del token: si no, cerrar sesión
  /// en un teléfono permitiría desactivar el de otra persona conociéndolo.
  Future<void> darDeBajaDispositivo(String token) async {
    await _api.delete('/notifications/devices', data: {'token': token});
  }

  Future<void> marcarTodasLeidas() async {
    await _api.patch('/notifications/read-all');
  }

  Future<void> eliminar(String id) async {
    await _api.delete('/notifications/$id');
  }
}
