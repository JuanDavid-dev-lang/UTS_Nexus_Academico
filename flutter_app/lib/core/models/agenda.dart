/// Modelos de la agenda académica.
///
/// Las horas llegan del backend como instantes absolutos (UTC) y el desfase del
/// campus viaja aparte. La app NO usa la zona horaria del teléfono para
/// resolver a qué hora es una clase: un teléfono con la zona mal puesta —o en
/// viaje— seguiría enseñando la hora real del campus.
library;

double _toDouble(Object? value) {
  if (value is num) return value.toDouble();
  if (value is String) return double.tryParse(value) ?? 0;
  return 0;
}

int _toInt(Object? value) {
  if (value is num) return value.toInt();
  if (value is String) return int.tryParse(value) ?? 0;
  return 0;
}

String _toStr(Object? value, [String fallback = '']) => value?.toString() ?? fallback;

DateTime _toUtc(Object? value) {
  final texto = value?.toString();
  if (texto == null || texto.isEmpty) return DateTime.fromMillisecondsSinceEpoch(0, isUtc: true);
  return DateTime.tryParse(texto)?.toUtc() ??
      DateTime.fromMillisecondsSinceEpoch(0, isUtc: true);
}

enum AgendaTipo {
  clase,
  evaluacion,
  parcial,
  entrega,
  actividad,
  reunion,
  tutoria,
  academico,
  recordatorio;

  static AgendaTipo desdeApi(String valor) {
    switch (valor) {
      case 'CLASS':
        return AgendaTipo.clase;
      case 'EVALUATION':
        return AgendaTipo.evaluacion;
      case 'EXAM':
        return AgendaTipo.parcial;
      case 'DELIVERY':
        return AgendaTipo.entrega;
      case 'MEETING':
        return AgendaTipo.reunion;
      case 'TUTORING':
        return AgendaTipo.tutoria;
      case 'ACADEMIC':
        return AgendaTipo.academico;
      case 'REMINDER':
        return AgendaTipo.recordatorio;
      default:
        return AgendaTipo.actividad;
    }
  }

  String get etiqueta {
    switch (this) {
      case AgendaTipo.clase:
        return 'Clase';
      case AgendaTipo.evaluacion:
        return 'Evaluación';
      case AgendaTipo.parcial:
        return 'Parcial';
      case AgendaTipo.entrega:
        return 'Entrega';
      case AgendaTipo.actividad:
        return 'Actividad';
      case AgendaTipo.reunion:
        return 'Reunión';
      case AgendaTipo.tutoria:
        return 'Tutoría';
      case AgendaTipo.academico:
        return 'Evento';
      case AgendaTipo.recordatorio:
        return 'Recordatorio';
    }
  }
}

enum EstadoAgenda { proxima, enCurso, terminada }

class AgendaItem {
  /// Identidad estable. Para una clase incluye la fecha: `class:<horario>:<AAAA-MM-DD>`.
  final String id;
  final String origen;
  final String sourceId;
  final AgendaTipo tipo;
  final String titulo;
  final String descripcion;
  final DateTime inicio;
  final DateTime fin;
  final int duracionMinutos;
  final bool todoElDia;

  /// Fecha local del campus, 'AAAA-MM-DD'. Es por la que se agrupa.
  final String fecha;
  final String materiaId;
  final String materia;
  final String codigoMateria;
  final String grupo;
  final String docente;
  final String aula;
  final String periodo;
  final String prioridad;
  final List<int> recordatorios;
  final EstadoAgenda estado;

  const AgendaItem({
    required this.id,
    required this.origen,
    required this.sourceId,
    required this.tipo,
    required this.titulo,
    required this.descripcion,
    required this.inicio,
    required this.fin,
    required this.duracionMinutos,
    required this.todoElDia,
    required this.fecha,
    required this.materiaId,
    required this.materia,
    required this.codigoMateria,
    required this.grupo,
    required this.docente,
    required this.aula,
    required this.periodo,
    required this.prioridad,
    required this.recordatorios,
    required this.estado,
  });

  bool get esClase => tipo == AgendaTipo.clase;

  factory AgendaItem.fromJson(Map<String, dynamic> json) {
    final estadoTexto = _toStr(json['status'], 'PROXIMA');
    return AgendaItem(
      id: _toStr(json['id']),
      origen: _toStr(json['origen'], 'schedule'),
      sourceId: _toStr(json['sourceId']),
      tipo: AgendaTipo.desdeApi(_toStr(json['type'], 'ACTIVITY')),
      titulo: _toStr(json['title'], 'Sin título'),
      descripcion: _toStr(json['description']),
      inicio: _toUtc(json['startAt']),
      fin: _toUtc(json['endAt']),
      duracionMinutos: _toInt(json['durationMinutes']),
      todoElDia: json['allDay'] == true,
      fecha: _toStr(json['date']),
      materiaId: _toStr(json['subjectId']),
      materia: _toStr(json['subjectName']),
      codigoMateria: _toStr(json['subjectCode']),
      grupo: _toStr(json['groupName']),
      docente: _toStr(json['teacherName']),
      aula: _toStr(json['classroom']),
      periodo: _toStr(json['period']),
      prioridad: _toStr(json['priority'], 'MEDIUM'),
      recordatorios: (json['reminderMinutes'] as List?)?.map(_toInt).toList() ?? const [],
      estado: estadoTexto == 'EN_CURSO'
          ? EstadoAgenda.enCurso
          : estadoTexto == 'TERMINADA'
              ? EstadoAgenda.terminada
              : EstadoAgenda.proxima,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'origen': origen,
        'sourceId': sourceId,
        'type': _tipoApi,
        'title': titulo,
        'description': descripcion,
        'startAt': inicio.toIso8601String(),
        'endAt': fin.toIso8601String(),
        'durationMinutes': duracionMinutos,
        'allDay': todoElDia,
        'date': fecha,
        'subjectId': materiaId,
        'subjectName': materia,
        'subjectCode': codigoMateria,
        'groupName': grupo,
        'teacherName': docente,
        'classroom': aula,
        'period': periodo,
        'priority': prioridad,
        'reminderMinutes': recordatorios,
        'status': estado == EstadoAgenda.enCurso
            ? 'EN_CURSO'
            : estado == EstadoAgenda.terminada
                ? 'TERMINADA'
                : 'PROXIMA',
      };

  String get _tipoApi {
    switch (tipo) {
      case AgendaTipo.clase:
        return 'CLASS';
      case AgendaTipo.evaluacion:
        return 'EVALUATION';
      case AgendaTipo.parcial:
        return 'EXAM';
      case AgendaTipo.entrega:
        return 'DELIVERY';
      case AgendaTipo.reunion:
        return 'MEETING';
      case AgendaTipo.tutoria:
        return 'TUTORING';
      case AgendaTipo.academico:
        return 'ACADEMIC';
      case AgendaTipo.recordatorio:
        return 'REMINDER';
      case AgendaTipo.actividad:
        return 'ACTIVITY';
    }
  }
}

/// Respuesta de `GET /agenda`: los items y el desfase con el que se pintan.
class AgendaRango {
  final List<AgendaItem> items;
  final int offsetCampusMinutos;

  const AgendaRango({required this.items, required this.offsetCampusMinutos});
}

/// Respuesta de `GET /agenda/resumen`.
class AgendaResumen {
  final AgendaItem? enCurso;
  final int minutosRestantes;
  final AgendaItem? proxima;
  final int minutosPara;
  final List<AgendaItem> hoy;
  final List<AgendaItem> proximosEventos;
  final int offsetCampusMinutos;

  const AgendaResumen({
    required this.enCurso,
    required this.minutosRestantes,
    required this.proxima,
    required this.minutosPara,
    required this.hoy,
    required this.proximosEventos,
    required this.offsetCampusMinutos,
  });

  static const vacio = AgendaResumen(
    enCurso: null,
    minutosRestantes: 0,
    proxima: null,
    minutosPara: 0,
    hoy: [],
    proximosEventos: [],
    offsetCampusMinutos: -300,
  );

  factory AgendaResumen.fromJson(Map<String, dynamic> json) {
    List<AgendaItem> lista(Object? valor) => (valor as List?)
            ?.whereType<Map>()
            .map((e) => AgendaItem.fromJson(Map<String, dynamic>.from(e)))
            .toList() ??
        const [];

    final enCurso = json['enCurso'];
    final proxima = json['proxima'];

    return AgendaResumen(
      enCurso: enCurso is Map ? AgendaItem.fromJson(Map<String, dynamic>.from(enCurso)) : null,
      minutosRestantes: enCurso is Map ? _toInt(enCurso['minutosRestantes']) : 0,
      proxima: proxima is Map ? AgendaItem.fromJson(Map<String, dynamic>.from(proxima)) : null,
      minutosPara: proxima is Map ? _toInt(proxima['minutosPara']) : 0,
      hoy: lista(json['hoy']),
      proximosEventos: lista(json['proximosEventos']),
      offsetCampusMinutos: json['campusOffsetMinutes'] == null
          ? -300
          : _toDouble(json['campusOffsetMinutes']).round(),
    );
  }

  Map<String, dynamic> toJson() => {
        'enCurso': enCurso == null
            ? null
            : {...enCurso!.toJson(), 'minutosRestantes': minutosRestantes},
        'proxima':
            proxima == null ? null : {...proxima!.toJson(), 'minutosPara': minutosPara},
        'hoy': hoy.map((e) => e.toJson()).toList(),
        'proximosEventos': proximosEventos.map((e) => e.toJson()).toList(),
        'campusOffsetMinutes': offsetCampusMinutos,
      };
}

/// Preferencias de notificación del usuario, tal y como las guarda el servidor.
class PreferenciasNotificacion {
  final bool clases;
  final bool evaluaciones;
  final bool asistencia;
  final bool riesgo;
  final bool intervenciones;
  final bool eventos;
  final bool recordatorios;
  final bool sincronizacion;
  final bool sistema;
  final bool inApp;
  final bool push;
  final List<int> antelacionesClase;
  final bool silencioActivo;
  final String silencioDesde;
  final String silencioHasta;
  final bool urgentesIgnoranSilencio;

  const PreferenciasNotificacion({
    required this.clases,
    required this.evaluaciones,
    required this.asistencia,
    required this.riesgo,
    required this.intervenciones,
    required this.eventos,
    required this.recordatorios,
    required this.sincronizacion,
    required this.sistema,
    required this.inApp,
    required this.push,
    required this.antelacionesClase,
    required this.silencioActivo,
    required this.silencioDesde,
    required this.silencioHasta,
    required this.urgentesIgnoranSilencio,
  });

  static const porDefecto = PreferenciasNotificacion(
    clases: true,
    evaluaciones: true,
    asistencia: true,
    riesgo: true,
    intervenciones: true,
    eventos: true,
    recordatorios: true,
    sincronizacion: false,
    sistema: true,
    inApp: true,
    push: true,
    antelacionesClase: [15],
    silencioActivo: false,
    silencioDesde: '21:00',
    silencioHasta: '06:00',
    urgentesIgnoranSilencio: true,
  );

  factory PreferenciasNotificacion.fromJson(Map<String, dynamic> json) {
    bool leer(String clave, bool porDefecto) =>
        json[clave] is bool ? json[clave] as bool : porDefecto;
    final silencio = json['quietHours'] is Map
        ? Map<String, dynamic>.from(json['quietHours'] as Map)
        : <String, dynamic>{};

    return PreferenciasNotificacion(
      clases: leer('clases', true),
      evaluaciones: leer('evaluaciones', true),
      asistencia: leer('asistencia', true),
      riesgo: leer('riesgo', true),
      intervenciones: leer('intervenciones', true),
      eventos: leer('eventos', true),
      recordatorios: leer('recordatorios', true),
      sincronizacion: leer('sincronizacion', false),
      sistema: leer('sistema', true),
      inApp: leer('inApp', true),
      push: leer('push', true),
      antelacionesClase:
          (json['classLeadMinutes'] as List?)?.map(_toInt).where((m) => m >= 0).toList() ??
              const [15],
      silencioActivo: silencio['enabled'] == true,
      silencioDesde: _toStr(silencio['start'], '21:00'),
      silencioHasta: _toStr(silencio['end'], '06:00'),
      urgentesIgnoranSilencio: leer('urgentBypassesQuietHours', true),
    );
  }

  Map<String, dynamic> toJson() => {
        'clases': clases,
        'evaluaciones': evaluaciones,
        'asistencia': asistencia,
        'riesgo': riesgo,
        'intervenciones': intervenciones,
        'eventos': eventos,
        'recordatorios': recordatorios,
        'sincronizacion': sincronizacion,
        'sistema': sistema,
        'inApp': inApp,
        'push': push,
        'classLeadMinutes': antelacionesClase,
        'quietHours': {
          'enabled': silencioActivo,
          'start': silencioDesde,
          'end': silencioHasta,
        },
        'urgentBypassesQuietHours': urgentesIgnoranSilencio,
      };
}
