/// Modelos de actividades, periodos, casos de inasistencia e historial.
///
/// Todos comparten una decisión: **lo que el backend ya calculó no se vuelve a
/// calcular aquí**. El estado de una actividad (`OPEN` / `CLOSED` / `LATE`)
/// llega resuelto contra el reloj del servidor; comparar la fecha con la del
/// teléfono haría que un aparato con la hora mal puesta mostrara vencida una
/// entrega que no lo está, y el docente no sabría cuál de los dos miente.
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

DateTime? _toDate(Object? value) {
  if (value == null) return null;
  return DateTime.tryParse(value.toString())?.toLocal();
}

// ── Actividades ─────────────────────────────────────────────────────────────

/// Lo que se muestra. `late` lo deriva el servidor; no se persiste.
enum ActivityState { open, closed, late }

ActivityState _estadoDe(String valor) => switch (valor.toUpperCase()) {
      'CLOSED' => ActivityState.closed,
      'LATE' => ActivityState.late,
      _ => ActivityState.open,
    };

class Activity {
  final String id;
  final String title;
  final String description;
  final String subjectId;
  final String? groupId;
  final String period;
  final DateTime? dueAt;
  final double weight;
  final String? attachmentUrl;

  /// Lo que decidió una persona: abierta o cerrada.
  final bool cerrada;

  /// Lo que se muestra: la decisión más el reloj del servidor.
  final ActivityState estado;

  const Activity({
    required this.id,
    required this.title,
    required this.description,
    required this.subjectId,
    required this.groupId,
    required this.period,
    required this.dueAt,
    required this.weight,
    required this.attachmentUrl,
    required this.cerrada,
    required this.estado,
  });

  bool get vencida => estado == ActivityState.late;

  factory Activity.fromJson(Map<String, dynamic> json) => Activity(
        id: _toStr(json['_id'] ?? json['id']),
        title: _toStr(json['title'], 'Sin título'),
        description: _toStr(json['description']),
        subjectId: _toStr(json['subjectId']),
        groupId: json['groupId'] == null ? null : _toStr(json['groupId']),
        period: _toStr(json['period']),
        dueAt: _toDate(json['dueAt']),
        weight: _toDouble(json['weight']),
        attachmentUrl:
            json['attachmentUrl'] == null ? null : _toStr(json['attachmentUrl']),
        cerrada: _toStr(json['status']) == 'CLOSED',
        // `estado` lo manda el backend ya derivado. El `??` cubre a un servidor
        // anterior a esta funcionalidad: entonces se cae a `status`, que es lo
        // único que había.
        estado: _estadoDe(_toStr(json['estado'], _toStr(json['status'], 'OPEN'))),
      );
}

// ── Periodos ────────────────────────────────────────────────────────────────

enum PeriodState { open, closing, closed }

class AcademicPeriod {
  final String period;
  final PeriodState state;
  final DateTime? closedAt;
  final int progreso;

  const AcademicPeriod({
    required this.period,
    required this.state,
    required this.closedAt,
    required this.progreso,
  });

  /// ¿Admite escrituras académicas? Es lo que decide si la captura de notas y
  /// de asistencia se ofrece o se desactiva con su explicación.
  bool get admiteEscrituras => state == PeriodState.open;

  factory AcademicPeriod.fromJson(Map<String, dynamic> json) => AcademicPeriod(
        period: _toStr(json['period']),
        state: switch (_toStr(json['state'], 'OPEN').toUpperCase()) {
          'CLOSED' => PeriodState.closed,
          'CLOSING' => PeriodState.closing,
          _ => PeriodState.open,
        },
        closedAt: _toDate(json['closedAt']),
        progreso: _toInt(json['progreso']),
      );
}

// ── Casos de patrón de inasistencia ─────────────────────────────────────────

class AttendanceCase {
  final String id;
  final String studentId;
  final String subjectId;
  final String period;

  /// Identificador del patrón. El catálogo de umbrales vive en el backend.
  final String pattern;
  final String severidad;
  final String evidencia;
  final String estado;
  final DateTime? detectadoEn;
  final int ocurrencias;
  final String notaIntervencion;

  const AttendanceCase({
    required this.id,
    required this.studentId,
    required this.subjectId,
    required this.period,
    required this.pattern,
    required this.severidad,
    required this.evidencia,
    required this.estado,
    required this.detectadoEn,
    required this.ocurrencias,
    required this.notaIntervencion,
  });

  factory AttendanceCase.fromJson(Map<String, dynamic> json) => AttendanceCase(
        id: _toStr(json['_id'] ?? json['id']),
        studentId: _toStr(json['studentId']),
        subjectId: _toStr(json['subjectId']),
        period: _toStr(json['period']),
        pattern: _toStr(json['pattern']),
        severidad: _toStr(json['severity'], 'MEDIA'),
        evidencia: _toStr(json['evidence']),
        estado: _toStr(json['status'], 'ABIERTO'),
        detectadoEn: _toDate(json['detectedAt']),
        ocurrencias: _toInt(json['occurrences']),
        notaIntervencion: _toStr(json['interventionNote']),
      );
}

/// Título legible de cada patrón.
///
/// Solo texto: los UMBRALES que deciden cuándo se dispara viven en
/// `domains/attendance/patterns.ts`. Duplicarlos aquí dejaría al teléfono
/// contando distinto que el servidor.
const tituloDePatron = <String, String>{
  'AUSENCIAS_CONSECUTIVAS_2': 'Dos ausencias seguidas',
  'AUSENCIAS_CONSECUTIVAS_3': 'Tres o más ausencias seguidas',
  'TARDANZAS_REPETIDAS': 'Llegadas tarde repetidas',
  'CAIDA_RECIENTE': 'Caída reciente de asistencia',
  'ASISTENCIA_PARCIAL_REPETIDA': 'Asistencia parcial repetida',
};

// ── Historial del estudiante ────────────────────────────────────────────────

class TimelineEvent {
  final String id;
  final String type;
  final DateTime? occurredAt;
  final String title;
  final String summary;
  final String period;
  final String? subjectName;
  final String? link;

  const TimelineEvent({
    required this.id,
    required this.type,
    required this.occurredAt,
    required this.title,
    required this.summary,
    required this.period,
    required this.subjectName,
    required this.link,
  });

  factory TimelineEvent.fromJson(Map<String, dynamic> json) => TimelineEvent(
        id: _toStr(json['id']),
        type: _toStr(json['type'], 'NOTA'),
        occurredAt: _toDate(json['occurredAt']),
        title: _toStr(json['title']),
        summary: _toStr(json['summary']),
        period: _toStr(json['period']),
        subjectName:
            json['subjectName'] == null ? null : _toStr(json['subjectName']),
        link: json['link'] == null ? null : _toStr(json['link']),
      );
}

/// Etiqueta legible de cada tipo de hecho. Presentación pura.
const etiquetaDeEvento = <String, String>{
  'MATRICULA': 'Matrícula',
  'NOTA': 'Nota',
  'ASISTENCIA': 'Asistencia',
  'ALERTA_RIESGO': 'Riesgo',
  'INTERVENCION': 'Intervención',
  'PATRON_ASISTENCIA': 'Patrón',
  'ACTIVIDAD': 'Actividad',
  'CIERRE_PERIODO': 'Cierre',
};
