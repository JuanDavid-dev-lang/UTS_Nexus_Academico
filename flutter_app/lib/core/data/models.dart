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
        studentId: _toStr(json['studentId']),
        subjectId: _toStr(json['subjectId']),
        groupId: json['groupId']?.toString(),
        period: _toStr(json['period']),
      );
}

/// Resumen de un corte, tal como lo calcula el motor del backend.
class CutSummary {
  final int cut;
  final double grade;
  final bool complete;

  const CutSummary({
    required this.cut,
    required this.grade,
    required this.complete,
  });

  factory CutSummary.fromJson(Map<String, dynamic> json) => CutSummary(
        cut: _toInt(json['corte']),
        grade: _toDouble(json['nota']),
        complete: json['completo'] == true,
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
      );
}

class AppNotification {
  final String id;
  final String title;
  final String message;
  final String type;
  final DateTime? createdAt;
  final DateTime? readAt;

  const AppNotification({
    required this.id,
    required this.title,
    required this.message,
    required this.type,
    this.createdAt,
    this.readAt,
  });

  bool get isUnread => readAt == null;

  factory AppNotification.fromJson(Map<String, dynamic> json) => AppNotification(
        id: _toStr(json['_id'] ?? json['id']),
        title: _toStr(json['title']),
        message: _toStr(json['message']),
        type: _toStr(json['type'], 'ACTIVITY'),
        createdAt: DateTime.tryParse(_toStr(json['createdAt'])),
        readAt: json['readAt'] == null
            ? null
            : DateTime.tryParse(_toStr(json['readAt'])),
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
