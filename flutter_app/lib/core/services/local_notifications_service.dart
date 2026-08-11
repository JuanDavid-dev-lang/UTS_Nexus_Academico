import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

import '../data/campus_time.dart';
import '../models/agenda.dart';

/// Notificaciones en el teléfono.
///
/// ── Por qué alarmas locales y no solo push ──────────────────────────────────
/// Un recordatorio de clase tiene que llegar con la aplicación cerrada y sin
/// red: el docente entra al edificio, pierde el wifi del campus y ahí es
/// justamente cuando necesita que le avise. Las clases se conocen con días de
/// antelación, así que el teléfono puede programarlas él mismo con el
/// AlarmManager de Android; eso funciona apagado el proceso de Flutter y sin
/// depender de que exista una cuenta de Firebase configurada en el servidor.
///
/// El push del servidor (FCM) sigue existiendo y cubre lo que el teléfono NO
/// puede saber por adelantado: que un estudiante entró en riesgo, que alguien
/// cambió el horario. Para no avisar dos veces de lo mismo, el dispositivo se
/// registra con `localClassReminders: true` y el servidor deja de mandarle push
/// de tipo CLASS.
///
/// ── Control de duplicados ───────────────────────────────────────────────────
/// Cada aviso tiene un identificador derivado de QUÉ notifica ("esta clase,
/// este día, esta antelación"), no de cuándo se programó. Android reemplaza la
/// notificación que ya tenía ese id en vez de apilar otra, así que
/// reprogramar la agenda diez veces seguidas deja diez veces el mismo aviso, no
/// diez avisos.
class LocalNotificationsService {
  LocalNotificationsService._();
  static final instance = LocalNotificationsService._();

  final _plugin = FlutterLocalNotificationsPlugin();
  bool _iniciado = false;

  /// A dónde navegar cuando el usuario toca una notificación. Lo inyecta la
  /// capa de aplicación: este servicio no conoce el router.
  void Function(String ruta)? onAbrirRuta;

  /// Ruta pendiente de una notificación que abrió la app desde cero.
  ///
  /// Cuando el sistema lanza la aplicación al tocar el aviso, el router todavía
  /// no existe. Se guarda y la aplicación la consume cuando está lista; sin
  /// esto, el toque abría la pantalla de inicio y el docente tenía que buscar
  /// a mano lo que la notificación ya sabía.
  String? rutaPendiente;

  static const _canalUrgente = AndroidNotificationChannel(
    'uts_urgente',
    'Urgente',
    description: 'Riesgo académico crítico y avisos que requieren atención inmediata.',
    importance: Importance.max,
  );
  static const _canalImportante = AndroidNotificationChannel(
    'uts_importante',
    'Importante',
    description: 'Clases próximas, evaluaciones y cambios de horario.',
    importance: Importance.high,
  );
  static const _canalInformativa = AndroidNotificationChannel(
    'uts_informativa',
    'Informativa',
    description: 'Recordatorios y novedades académicas.',
    importance: Importance.defaultImportance,
  );
  static const _canalSistema = AndroidNotificationChannel(
    'uts_sistema',
    'Sistema',
    description: 'Actualizaciones, sincronización y mantenimiento.',
    importance: Importance.low,
  );

  Future<void> init() async {
    if (_iniciado) return;

    // Se programa sobre instantes absolutos (UTC), no sobre horas de pared: la
    // hora de la clase ya viene resuelta del servidor. Fijar la zona local a
    // UTC evita arrastrar la base de zonas completa y elimina la posibilidad de
    // que el teléfono, con su zona mal puesta, desplace un recordatorio.
    tzdata.initializeTimeZones();
    tz.setLocalLocation(tz.UTC);

    await _plugin.initialize(
      const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
      ),
      onDidReceiveNotificationResponse: _alTocar,
    );

    final android =
        _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    if (android != null) {
      for (final canal in [_canalUrgente, _canalImportante, _canalInformativa, _canalSistema]) {
        await android.createNotificationChannel(canal);
      }
    }

    // La app pudo abrirse por un toque en una notificación mientras estaba
    // cerrada del todo.
    final lanzamiento = await _plugin.getNotificationAppLaunchDetails();
    final carga = lanzamiento?.notificationResponse?.payload;
    if (lanzamiento?.didNotificationLaunchApp == true && carga != null) {
      rutaPendiente = _rutaDeCarga(carga);
    }

    _iniciado = true;
  }

  void _alTocar(NotificationResponse respuesta) {
    final ruta = _rutaDeCarga(respuesta.payload);
    if (ruta == null) return;
    final manejador = onAbrirRuta;
    if (manejador == null) {
      rutaPendiente = ruta;
      return;
    }
    manejador(ruta);
  }

  String? _rutaDeCarga(String? carga) {
    if (carga == null || carga.isEmpty) return null;
    try {
      final datos = jsonDecode(carga);
      if (datos is! Map) return null;
      final ruta = datos['ruta']?.toString();
      // Solo rutas internas: una notificación no puede sacar al docente de la
      // aplicación hacia una dirección que alguien haya podido escribir.
      if (ruta == null || !ruta.startsWith('/')) return null;
      return ruta;
    } catch (_) {
      return null;
    }
  }

  /// Pide los permisos que Android exige. Devuelve si se pueden mostrar avisos.
  Future<bool> pedirPermisos() async {
    await init();
    final android =
        _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    if (android == null) return false;

    final concedido = await android.requestNotificationsPermission() ?? false;
    // Sin alarma exacta el sistema puede retrasar el aviso varios minutos, que
    // en un recordatorio de "empieza en 15" lo vuelve inútil. Si el usuario no
    // lo concede se sigue programando: llegará, con menos precisión.
    await android.requestExactAlarmsPermission();
    return concedido;
  }

  Future<bool> get permisosConcedidos async {
    await init();
    final android =
        _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    return await android?.areNotificationsEnabled() ?? false;
  }

  AndroidNotificationDetails _detalles(String canalId, String tag) {
    final canal = switch (canalId) {
      'uts_urgente' => _canalUrgente,
      'uts_informativa' => _canalInformativa,
      'uts_sistema' => _canalSistema,
      _ => _canalImportante,
    };

    return AndroidNotificationDetails(
      canal.id,
      canal.name,
      channelDescription: canal.description,
      importance: canal.importance,
      priority: canal.importance == Importance.max ? Priority.max : Priority.high,
      // El tag agrupa: el mismo hecho reemplaza su aviso anterior en vez de
      // apilar uno nuevo en el cajón.
      tag: tag,
      category: AndroidNotificationCategory.reminder,
    );
  }

  /// Identificador estable de 31 bits a partir de la clave del hecho.
  ///
  /// Android exige un `int`; usar un contador haría que reprogramar creara
  /// avisos nuevos en vez de reemplazar los que ya había.
  static int idDeClave(String clave) => clave.hashCode & 0x7fffffff;

  /// Muestra un aviso ahora mismo. Lo usa lo que llega por Socket.IO con la
  /// aplicación abierta o en segundo plano.
  Future<void> mostrarAhora({
    required String clave,
    required String titulo,
    required String mensaje,
    String canalId = 'uts_importante',
    String? ruta,
  }) async {
    await init();
    await _plugin.show(
      idDeClave(clave),
      titulo,
      mensaje,
      NotificationDetails(android: _detalles(canalId, clave)),
      payload: ruta == null ? null : jsonEncode({'ruta': ruta}),
    );
  }

  /// Máximo de avisos programados a la vez.
  ///
  /// Android tolera unos cuantos cientos de alarmas, pero programar la agenda
  /// entera del semestre no sirve de nada: se reprograma en cada sincronización
  /// y lo que importa son los próximos días.
  static const maxProgramados = 64;

  /// Días hacia delante que se programan.
  static const diasProgramados = 7;

  /// Reprograma TODOS los recordatorios de la agenda.
  ///
  /// Cancela primero y vuelve a crear. Es deliberado: intentar reconciliar
  /// (¿cuál cambió de hora? ¿cuál se borró?) es donde aparecen los avisos
  /// fantasma de clases que ya no existen. Cancelar y rehacer es una operación
  /// barata que no puede quedar a medias.
  Future<int> reprogramar({
    required List<AgendaItem> items,
    required PreferenciasNotificacion preferencias,
    required int offsetCampusMinutos,
    DateTime? ahora,
  }) async {
    await init();
    await cancelarTodo();

    if (!preferencias.clases && !preferencias.evaluaciones && !preferencias.eventos) return 0;

    final referencia = (ahora ?? DateTime.now()).toUtc();
    final limite = referencia.add(const Duration(days: diasProgramados));

    // De mayor a menor antelación, y con el aviso de inicio siempre presente:
    // el de "empieza ahora" es el que salva al que tenía el teléfono apagado
    // cuando pasó el de los 15 minutos.
    final antelacionesClase = <int>{...preferencias.antelacionesClase, 0}.toList()..sort();

    var programados = 0;

    for (final item in items) {
      if (programados >= maxProgramados) break;
      if (item.inicio.isAfter(limite)) continue;

      final antelaciones = item.esClase
          ? (preferencias.clases ? antelacionesClase : const <int>[])
          : _antelacionesDeEvento(item, preferencias);

      for (final antelacion in antelaciones) {
        if (programados >= maxProgramados) break;

        final cuando = item.inicio.subtract(Duration(minutes: antelacion));
        // Lo que ya pasó no se programa: Android lo dispararía de inmediato y
        // el docente recibiría de golpe los avisos de toda la mañana.
        if (!cuando.isAfter(referencia)) continue;
        if (_enSilencio(preferencias, cuando, offsetCampusMinutos)) continue;

        final clave = item.esClase
            ? 'class:${item.sourceId}:${item.fecha}:$antelacion'
            : 'event:${item.sourceId}:$antelacion';

        try {
          await _plugin.zonedSchedule(
            idDeClave(clave),
            item.esClase && antelacion == 0
                ? 'Clase en curso'
                : item.esClase
                    ? 'Próxima clase'
                    : item.tipo.etiqueta,
            _mensaje(item, antelacion),
            tz.TZDateTime.from(cuando, tz.UTC),
            NotificationDetails(
              android: _detalles(antelacion == 0 ? 'uts_importante' : 'uts_informativa', clave),
            ),
            androidScheduleMode: AndroidScheduleMode.exactAllowWhileIdle,
            // Obligatorio en la 18.x. Se programa sobre instantes absolutos, asi
            // que 'absoluteTime' es lo correcto: la hora ya viene resuelta del
            // servidor y no debe reinterpretarse con la zona del telefono.
            uiLocalNotificationDateInterpretation:
                UILocalNotificationDateInterpretation.absoluteTime,
            payload: jsonEncode({'ruta': '/agenda?item=${Uri.encodeComponent(item.id)}'}),
          );
          programados += 1;
        } catch (error) {
          // Sin permiso de alarma exacta el plugin lanza. Se reintenta en modo
          // inexacto antes de rendirse: un aviso con unos minutos de margen es
          // mejor que ninguno.
          try {
            await _plugin.zonedSchedule(
              idDeClave(clave),
              item.esClase ? 'Próxima clase' : item.tipo.etiqueta,
              _mensaje(item, antelacion),
              tz.TZDateTime.from(cuando, tz.UTC),
              NotificationDetails(android: _detalles('uts_informativa', clave)),
              androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
              uiLocalNotificationDateInterpretation:
                  UILocalNotificationDateInterpretation.absoluteTime,
              payload: jsonEncode({'ruta': '/agenda?item=${Uri.encodeComponent(item.id)}'}),
            );
            programados += 1;
          } catch (fallo) {
            debugPrint('[agenda] no se pudo programar $clave: $fallo');
          }
        }
      }
    }

    return programados;
  }

  List<int> _antelacionesDeEvento(AgendaItem item, PreferenciasNotificacion preferencias) {
    final activo = switch (item.tipo) {
      AgendaTipo.parcial || AgendaTipo.evaluacion || AgendaTipo.entrega => preferencias.evaluaciones,
      AgendaTipo.recordatorio => preferencias.recordatorios,
      _ => preferencias.eventos,
    };
    if (!activo) return const [];
    return item.recordatorios;
  }

  /// ¿El aviso caería dentro de las horas de silencio del usuario?
  bool _enSilencio(PreferenciasNotificacion preferencias, DateTime cuando, int offsetMinutos) {
    if (!preferencias.silencioActivo) return false;

    int? aMinutos(String hhmm) {
      final partes = hhmm.split(':');
      if (partes.length != 2) return null;
      final horas = int.tryParse(partes[0]);
      final minutos = int.tryParse(partes[1]);
      if (horas == null || minutos == null) return null;
      return horas * 60 + minutos;
    }

    final desde = aMinutos(preferencias.silencioDesde);
    final hasta = aMinutos(preferencias.silencioHasta);
    if (desde == null || hasta == null || desde == hasta) return false;

    final p = partesCampus(cuando, offsetMinutos);
    final minuto = p.horas * 60 + p.minutos;

    // La franja normal cruza la medianoche (21:00–06:00): ahí la condición se
    // invierte, y con la comparación ingenua no silenciaría nada.
    return desde < hasta ? (minuto >= desde && minuto < hasta) : (minuto >= desde || minuto < hasta);
  }

  String _mensaje(AgendaItem item, int antelacion) {
    final nombre = item.titulo.isNotEmpty ? item.titulo : item.materia;
    final donde = [
      if (item.aula.isNotEmpty) 'Aula ${item.aula}',
      if (item.grupo.isNotEmpty) 'Grupo ${item.grupo}',
    ].join(' · ');
    final sufijo = donde.isEmpty ? '' : ' ($donde)';

    if (antelacion == 0) return '$nombre comienza ahora$sufijo.';
    if (antelacion >= 1440) return 'Mañana: $nombre$sufijo.';
    return '$nombre comienza en ${tiempoRestante(antelacion)}$sufijo.';
  }

  Future<void> cancelarTodo() async {
    await init();
    await _plugin.cancelAll();
  }

  /// Cuántos avisos quedan programados. Lo muestra la pantalla de ajustes para
  /// que "activado" sea comprobable y no una promesa.
  Future<int> pendientes() async {
    await init();
    final lista = await _plugin.pendingNotificationRequests();
    return lista.length;
  }
}
