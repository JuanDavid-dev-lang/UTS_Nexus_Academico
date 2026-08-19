import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/data/models.dart';
import '../../core/data/providers.dart';

/// Providers de materias.
///
/// Viven junto a la pantalla que los usa y no en un registro central. El
/// registro central llegó a tener veintinueve providers de diez capacidades:
/// cualquier cambio en cualquier pantalla tocaba ese archivo, así que todos los
/// cambios chocaban ahí y no se podía leer una capacidad sin abrirlo entero.

/// Materias del periodo seleccionado.
final periodSubjectsProvider = Provider<AsyncValue<List<Subject>>>((ref) {
  final period = ref.watch(selectedPeriodProvider);
  return ref.watch(subjectsProvider).whenData(
        (subjects) => subjects.where((s) => s.period == period).toList(),
      );
});

/// Estudiantes de una materia, con sus notas y su nivel de riesgo ya cruzados.
///
/// Es el corazón de la navegación por materia: el docente entra a "Cálculo I" y
/// ve su lista con todo resuelto, sin tener que saltar entre pantallas.
final subjectRosterProvider =
    FutureProvider.family<List<SubjectStudent>, String>((ref, subjectId) async {
  final repository = ref.watch(academicRepositoryProvider);
  final period = ref.watch(selectedPeriodProvider);

  // En paralelo: las tres llamadas son independientes entre sí.
  final results = await Future.wait([
    repository.enrollments(subjectId: subjectId, period: period),
    repository.students(),
    repository.consolidated(period: period, subjectId: subjectId),
    repository.risks(),
  ]);

  final enrollments = results[0] as List<Enrollment>;
  final allStudents = results[1] as List<Student>;
  final grades = results[2] as List<ConsolidatedRow>;
  final risks = results[3] as List<RiskItem>;

  final gradesByStudent = {for (final row in grades) row.studentId: row};
  final riskByStudent = {
    for (final item in risks.where((r) => r.subjectId == subjectId))
      item.studentId: item,
  };

  final enrolledIds = enrollments.map((e) => e.studentId).toSet();

  // Algunas instalaciones capturan notas sin matrícula formal. Si no hay
  // matrículas, se cae a los estudiantes que sí tienen consolidado en esta
  // materia, para no dejar la pantalla vacía cuando sí hay datos.
  final ids = enrolledIds.isNotEmpty
      ? enrolledIds
      : gradesByStudent.keys.toSet();

  final roster = allStudents
      .where((student) => ids.contains(student.id))
      .map((student) => SubjectStudent(
            student: student,
            grades: gradesByStudent[student.id],
            risk: riskByStudent[student.id],
          ))
      .toList();

  // Primero quien necesita atención: riesgo alto arriba, luego medio, luego
  // el resto por nombre.
  roster.sort((a, b) {
    final byRisk = b.riskLevel.index.compareTo(a.riskLevel.index);
    if (byRisk != 0) return byRisk;
    return a.student.fullName.compareTo(b.student.fullName);
  });

  return roster;
});

/// Cuántos estudiantes y cuántos en riesgo tiene cada materia.
/// Alimenta las tarjetas del listado de materias.
class SubjectStats {
  final int students;
  final int atRisk;
  final double averageGrade;

  const SubjectStats({
    required this.students,
    required this.atRisk,
    required this.averageGrade,
  });
}

final subjectStatsProvider =
    FutureProvider.family<SubjectStats, String>((ref, subjectId) async {
  final repository = ref.watch(academicRepositoryProvider);
  final period = ref.watch(selectedPeriodProvider);

  final results = await Future.wait([
    repository.consolidated(period: period, subjectId: subjectId),
    repository.risks(),
  ]);

  final grades = results[0] as List<ConsolidatedRow>;
  final risks = (results[1] as List<RiskItem>)
      .where((r) => r.subjectId == subjectId && r.level != RiskLevel.low);

  final graded = grades.where((row) => row.finalGrade > 0).toList();
  final average = graded.isEmpty
      ? 0.0
      : graded.map((row) => row.finalGrade).reduce((a, b) => a + b) / graded.length;

  return SubjectStats(
    students: grades.length,
    atRisk: risks.map((r) => r.studentId).toSet().length,
    averageGrade: average,
  );
});
