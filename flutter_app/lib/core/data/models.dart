/// Modelos del dominio académico.
///
/// Las pantallas trabajaban con `Map<String, dynamic>` y accedían por cadenas
/// (`item['fullName']`). Un cambio de nombre en el backend no daba error de
/// compilación: aparecía como un hueco en blanco en pantalla. Con estos modelos
/// el fallo sale al parsear, en un solo sitio y con contexto.
library;

/// Convierte a double lo que el backend pueda mandar como número o cadena.
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

String _toStr(Object? value, [String fallback = '']) =>
    value?.toString() ?? fallback;

/// Id de un campo que puede venir poblado: `populate()` de Mongoose entrega
/// el documento entero en lugar del id. Convertir eso con `toString()` no da
/// error — da un id basura que nunca casa con nada, y lo que cuelga de él se
/// queda vacío en silencio.
String _toId(Object? value) {
  if (value is Map) return _toStr(value['_id'] ?? value['id']);
  return _toStr(value);
}

class Subject {
  final String id;
  final String name;
  final String code;
  final String period;
  final int credits;

  const Subject({
    required this.id,
    required this.name,
    required this.code,
    required this.period,
    required this.credits,
  });

  factory Subject.fromJson(Map<String, dynamic> json) => Subject(
        id: _toStr(json['_id'] ?? json['id']),
        name: _toStr(json['name'], 'Sin nombre'),
        code: _toStr(json['code']),
        period: _toStr(json['period']),
        credits: _toInt(json['credits']),
      );
}

class Student {
  final String id;
  final String code;
  final String fullName;
  final String email;
  final String program;

  const Student({
    required this.id,
    required this.code,
    required this.fullName,
    required this.email,
    required this.program,
  });

  factory Student.fromJson(Map<String, dynamic> json) => Student(
        id: _toStr(json['_id'] ?? json['id']),
        code: _toStr(json['code']),
        fullName: _toStr(json['fullName'], 'Sin nombre'),
        email: _toStr(json['email']),
        program: _toStr(json['program']),
      );
}

class Enrollment {
  final String id;
  final String studentId;
  final String subjectId;
  final String? groupId;
  final String period;

  const Enrollment({
    required this.id,
    required this.studentId,
    required this.subjectId,
    this.groupId,
    required this.period,
  });

  factory Enrollment.fromJson(Map<String, dynamic> json) => Enrollment(
        id: _toStr(json['_id'] ?? json['id']),
        // `GET /enrollments` puebla `studentId` con la identidad del
        // estudiante: llega un objeto, no un id.
        studentId: _toId(json['studentId']),
        subjectId: _toId(json['subjectId']),
        groupId: json['groupId'] == null ? null : _toId(json['groupId']),
        period: _toStr(json['period']),
      );
}

/// Resumen de un corte, tal como lo calcula el motor del backend.
/// Una nota concreta dentro de un componente, con el motivo que le puso el
/// docente («Taller 2», «Parcial 1»).
class GradeDetail {
  final String id;
  final String label;
  final double score;

  const GradeDetail({
    required this.id,
    required this.label,
    required this.score,
  });

  factory GradeDetail.fromJson(Map<String, dynamic> json) => GradeDetail(
        id: _toStr(json['id']),
        label: _toStr(json['label'], 'Nota'),
        score: _toDouble(json['score']),
      );
}

/// Un componente del corte (trabajos 30%, parciales 60%, autoevaluación 10%).
///
/// El promedio es la suma de [notes] dividida por su cantidad. Se trae la lista
/// completa para poder mostrar la cuenta: un componente reducido a un número y
/// un contador no deja ver cuál de las notas está mal digitada.
class ComponentSummary {
  final String type;
  final double weight;
  final double average;
  final int count;
  final List<GradeDetail> notes;

  const ComponentSummary({
    required this.type,
    required this.weight,
    required this.average,
    required this.count,
    required this.notes,
  });

  factory ComponentSummary.fromJson(Map<String, dynamic> json) =>
      ComponentSummary(
        type: _toStr(json['tipo']),
        weight: _toDouble(json['peso']),
        average: _toDouble(json['promedio']),
        count: _toInt(json['registros']),
        // Ausente si el servidor es anterior a este campo: se ve sin desglose,
        // no revienta.
        notes: ((json['notas'] as List?) ?? const [])
            .map((e) => GradeDetail.fromJson(Map<String, dynamic>.from(e as Map)))
            .toList(),
      );
}

class CutSummary {
  final int cut;
  final double weight;
  final double grade;
  final bool complete;
  final List<ComponentSummary> components;

  const CutSummary({
    required this.cut,
    required this.weight,
    required this.grade,
    required this.complete,
    required this.components,
  });

  factory CutSummary.fromJson(Map<String, dynamic> json) => CutSummary(
        cut: _toInt(json['corte']),
        weight: _toDouble(json['peso']),
        grade: _toDouble(json['nota']),
        complete: json['completo'] == true,
        components: ((json['componentes'] as List?) ?? const [])
            .map((e) =>
                ComponentSummary.fromJson(Map<String, dynamic>.from(e as Map)))
            .toList(),
      );
}

/// Lo que falta por calificar de un componente dentro de un corte.
class PendingComponent {
  final String component;
  final int missing;
  final int total;

  const PendingComponent({
    required this.component,
    required this.missing,
    required this.total,
  });

  factory PendingComponent.fromJson(Map<String, dynamic> json) =>
      PendingComponent(
        component: _toStr(json['componente']),
        missing: _toInt(json['faltan']),
        total: _toInt(json['total']),
      );
}

class PendingCut {
  final int cut;
  final int missing;
  final List<PendingComponent> components;

  const PendingCut({
    required this.cut,
    required this.missing,
    required this.components,
  });

  factory PendingCut.fromJson(Map<String, dynamic> json) => PendingCut(
        cut: _toInt(json['corte']),
        missing: _toInt(json['faltan']),
        components: ((json['componentes'] as List?) ?? const [])
            .map((e) =>
                PendingComponent.fromJson(Map<String, dynamic>.from(e as Map)))
            .toList(),
      );
}

/// Trabajo pendiente de una materia.
///
/// Un docente no persigue promedios: persigue el cierre de corte. Esto responde
/// la pregunta de esa semana —«¿qué me falta?»— con datos que el motor ya
/// distinguía y que hasta ahora solo servían para no dar falsos positivos de
/// riesgo.
class PendingSubject {
  final String subjectId;
  final String name;
  final String code;
  final int enrolled;
  final int missing;
  final List<PendingCut> cuts;

  const PendingSubject({
    required this.subjectId,
    required this.name,
    required this.code,
    required this.enrolled,
    required this.missing,
    required this.cuts,
  });

  factory PendingSubject.fromJson(Map<String, dynamic> json) => PendingSubject(
        subjectId: _toStr(json['subjectId']),
        name: _toStr(json['name'], 'Materia'),
        code: _toStr(json['code']),
        enrolled: _toInt(json['matriculados']),
        missing: _toInt(json['faltan']),
        cuts: ((json['cortes'] as List?) ?? const [])
            .map((e) => PendingCut.fromJson(Map<String, dynamic>.from(e as Map)))
            .toList(),
      );
}

/// Fila del consolidado: nota final por estudiante.
///
/// El cliente NUNCA recalcula esto. La rúbrica 30/60/10 y los pesos 33/33/34
/// viven solo en el backend; duplicarlos aquí sería garantizar que algún día
/// las dos versiones discrepen sobre quién aprobó.
class ConsolidatedRow {
  final String studentId;
  final String code;
  final String fullName;
  final double finalGrade;
  final bool passed;
  final bool complete;
  final List<CutSummary> cuts;

  const ConsolidatedRow({
    required this.studentId,
    required this.code,
    required this.fullName,
    required this.finalGrade,
    required this.passed,
    required this.complete,
    required this.cuts,
  });

  factory ConsolidatedRow.fromJson(Map<String, dynamic> json) => ConsolidatedRow(
        studentId: _toStr(json['studentId']),
        code: _toStr(json['code']),
        fullName: _toStr(json['fullName'], 'Sin nombre'),
        finalGrade: _toDouble(json['notaFinal']),
        passed: json['aprobado'] == true,
        complete: json['completo'] == true,
        cuts: ((json['cortes'] as List?) ?? const [])
            .map((e) => CutSummary.fromJson(Map<String, dynamic>.from(e as Map)))
            .toList(),
      );
}

enum RiskLevel { low, medium, high }

RiskLevel riskLevelFrom(String? value) {
  switch ((value ?? '').toUpperCase()) {
    case 'HIGH':
    case 'ALTO':
      return RiskLevel.high;
    case 'MEDIUM':
    case 'MEDIO':
      return RiskLevel.medium;
    default:
      return RiskLevel.low;
  }
}

class RiskItem {
  final String studentId;
  final String code;
  final String fullName;
  final String subjectId;
  final double finalGrade;
  final double attendanceRate;
  final int missed;
  final int score;
  final RiskLevel level;
  final List<String> reasons;

  /// Qué se hizo ya con esta alerta. Convierte el tablero en un seguimiento:
  /// sin esto la lista repetía los mismos nombres cada semana sin distinguir el
  /// caso nuevo del que llevas un mes atendiendo.
  final String interventionStatus;
  final String interventionNote;

  const RiskItem({
    required this.studentId,
    required this.code,
    required this.fullName,
    required this.subjectId,
    required this.finalGrade,
    required this.attendanceRate,
    required this.missed,
    required this.score,
    required this.level,
    required this.reasons,
    this.interventionStatus = 'PENDIENTE',
    this.interventionNote = '',
  });

  factory RiskItem.fromJson(Map<String, dynamic> json) => RiskItem(
        studentId: _toStr(json['studentId']),
        code: _toStr(json['code']),
        fullName: _toStr(json['fullName'], 'Sin nombre'),
        subjectId: _toStr(json['subjectId']),
        finalGrade: _toDouble(json['notaFinal']),
        attendanceRate: _toDouble(json['attendanceRate']),
        missed: _toInt(json['missed']),
        score: _toInt(json['riskScore']),
        level: riskLevelFrom(json['level']?.toString()),
        reasons: ((json['motivos'] as List?) ?? const [])
            .map((e) => e.toString())
            .toList(),
        interventionStatus:
            _toStr(json['interventionStatus'], 'PENDIENTE'),
        interventionNote: _toStr(json['interventionNote']),
      );
}

class AppNotification {
  final String id;
  final String title;
  final String message;
  final String type;

  /// URGENT / IMPORTANT / INFO / SYSTEM. Ordena la bandeja y decide el canal
  /// de Android con el que suena.
  final String priority;

  /// Ruta interna a la que lleva al tocarla (`/agenda?item=…`). Vacía si no
  /// apunta a nada. Nunca una URL externa: una notificación no puede sacar al
  /// docente de la aplicación hacia una dirección que alguien haya escrito.
  final String link;
  final DateTime? createdAt;
  final DateTime? readAt;

  const AppNotification({
    required this.id,
    required this.title,
    required this.message,
    required this.type,
    this.priority = 'INFO',
    this.link = '',
    this.createdAt,
    this.readAt,
  });

  bool get isUnread => readAt == null;

  /// ¿Se puede abrir algo al tocarla?
  bool get esNavegable => link.startsWith('/');

  factory AppNotification.fromJson(Map<String, dynamic> json) => AppNotification(
        id: _toStr(json['_id'] ?? json['id']),
        title: _toStr(json['title']),
        message: _toStr(json['message']),
        type: _toStr(json['type'], 'ACTIVITY'),
        priority: _toStr(json['priority'], 'INFO'),
        link: _toStr(json['link']),
        createdAt: DateTime.tryParse(_toStr(json['createdAt'])),
        readAt: json['readAt'] == null
            ? null
            : DateTime.tryParse(_toStr(json['readAt'])),
      );
}

/// Vista previa de un reporte: las mismas filas que saldrán en el PDF/Excel.
///
/// El servidor las construye con el mismo catálogo de columnas que usa para
/// generar el archivo; el cliente solo las pinta, no recalcula nada.
class ReportPreview {
  final List<String> headers;
  final List<List<String>> rows;
  final int total;
  final bool truncado;

  const ReportPreview({
    required this.headers,
    required this.rows,
    required this.total,
    required this.truncado,
  });

  factory ReportPreview.fromJson(Map<String, dynamic> json) => ReportPreview(
        headers: [
          for (final header in (json['headers'] as List? ?? const []))
            _toStr(header),
        ],
        rows: [
          for (final row in (json['rows'] as List? ?? const []))
            [for (final cell in (row as List? ?? const [])) _toStr(cell)],
        ],
        total: _toInt(json['total']),
        truncado: json['truncado'] == true,
      );
}

/// Un estudiante dentro de una materia concreta, con todo lo que el docente
/// necesita ver de un vistazo.
///
/// Es una vista compuesta: el backend expone matrícula, consolidado y riesgo por
/// separado, y unirlos aquí evita que cada pantalla repita el cruce.
class SubjectStudent {
  final Student student;
  final ConsolidatedRow? grades;
  final RiskItem? risk;

  const SubjectStudent({
    required this.student,
    this.grades,
    this.risk,
  });

  double? get finalGrade => grades?.finalGrade;
  RiskLevel get riskLevel => risk?.level ?? RiskLevel.low;
  double? get attendanceRate => risk?.attendanceRate;

  /// `null` cuando aún no hay ninguna nota registrada.
  bool? get isPassing {
    final row = grades;
    if (row == null || row.cuts.every((c) => c.grade == 0 && !c.complete)) {
      return null;
    }
    return row.passed;
  }
}

/// Grupo de una materia. La asistencia y la matrícula cuelgan del grupo, no de
/// la materia: una materia con dos grupos tiene dos listas distintas.
class Group {
  final String id;
  final String name;
  final String? subjectId;
  final String period;

  const Group({
    required this.id,
    required this.name,
    required this.subjectId,
    required this.period,
  });

  factory Group.fromJson(Map<String, dynamic> json) => Group(
        id: (json['_id'] ?? json['id'] ?? '').toString(),
        name: (json['name'] ?? '').toString(),
        subjectId: json['subjectId']?.toString(),
        period: (json['period'] ?? '').toString(),
      );
}
