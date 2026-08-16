import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/agenda.dart';
import '../services/agenda_repository.dart';
import '../services/feedback_service.dart';
import '../services/profile_service.dart';
import '../services/thesis_service.dart';
import 'academic_repository.dart';
import 'campus_time.dart';
import 'models.dart';

/// Registro central de providers.
///
/// Antes cada pantalla declaraba los suyos (`studentsProvider` vivía dentro de
/// `students_page.dart`), lo que obligaba a importar una pantalla para usar sus
/// datos y hacía imposible saber qué invalidar cuando llegaba un evento de
/// sincronización.
final academicRepositoryProvider = Provider((ref) => AcademicRepository());

/// Periodo académico activo. Lo comparten notas, asistencia y reportes: cambiar
/// de semestre en una pantalla lo cambia en todas, que es lo que un docente
/// espera.
final selectedPeriodProvider = StateProvider<String>((ref) => currentPeriod());

String currentPeriod([DateTime? now]) {
  final date = now ?? DateTime.now();
  return '${date.year}-${date.month <= 6 ? 1 : 2}';
}

List<String> recentPeriods({int count = 6, DateTime? now}) {
  final date = now ?? DateTime.now();
  var year = date.year;
  var half = date.month <= 6 ? 1 : 2;

  return List.generate(count, (_) {
    final value = '$year-$half';
    if (half == 1) {
      half = 2;
      year -= 1;
    } else {
      half = 1;
    }
    return value;
  });
}

final subjectsProvider = FutureProvider<List<Subject>>((ref) {
  return ref.watch(academicRepositoryProvider).subjects();
});

/// Materias del periodo seleccionado.
final periodSubjectsProvider = Provider<AsyncValue<List<Subject>>>((ref) {
  final period = ref.watch(selectedPeriodProvider);
  return ref.watch(subjectsProvider).whenData(
        (subjects) => subjects.where((s) => s.period == period).toList(),
      );
});

final studentsProvider = FutureProvider<List<Student>>((ref) {
  return ref.watch(academicRepositoryProvider).students();
});

/// Materia por la que está filtrado el directorio. `null` = todas las del docente.
final studentSubjectFilterProvider = StateProvider<String?>((ref) => null);

/// Directorio acotado a la materia seleccionada.
///
/// El recorte lo hace el backend contra la matrícula. Filtrar en el cliente la
/// lista completa parece equivalente y no lo es: el listado global no dice a qué
/// materia pertenece cada estudiante, así que no hay nada por lo que filtrar.
final filteredStudentsProvider = FutureProvider<List<Student>>((ref) {
  final subjectId = ref.watch(studentSubjectFilterProvider);
  return ref.watch(academicRepositoryProvider).students(subjectId: subjectId);
});

/// Grupos del docente. Cambian poco, así que se cachean durante la sesión.
final groupsProvider = FutureProvider<List<Group>>((ref) {
  return ref.watch(academicRepositoryProvider).groups();
});

// ── Agenda académica ────────────────────────────────────────────────────────

final agendaRepositoryProvider = Provider((ref) => AgendaRepository());
final notificationPrefsRepositoryProvider = Provider((ref) => NotificationPrefsRepository());

/// Día ancla de la agenda. Lo mueven las flechas y el botón "Hoy".
final agendaAnclaProvider = StateProvider<DateTime>((ref) => DateTime.now().toUtc());

/// Clase en curso y próxima. Es lo que alimenta la tarjeta destacada del panel
/// y de la agenda; el contador de minutos lo lleva el reloj local del widget,
/// no una petición por minuto.
final agendaResumenProvider = FutureProvider<AgendaResumen>((ref) {
  return ref.watch(agendaRepositoryProvider).resumen();
});

/// Agenda de la semana del día ancla. La semana empieza en lunes.
final agendaSemanaProvider = FutureProvider<AgendaRango>((ref) {
  final ancla = ref.watch(agendaAnclaProvider);
  final desde = inicioSemanaCampus(ancla, offsetCampusPorDefecto);
  return ref.watch(agendaRepositoryProvider).rango(
        desde: desde,
        hasta: desde.add(const Duration(days: 7)),
      );
});

/// Agenda de los próximos siete días. Es la que se usa para programar los
/// recordatorios locales del teléfono.
final agendaProximaProvider = FutureProvider<AgendaRango>((ref) {
  final ahora = DateTime.now().toUtc();
  return ref.watch(agendaRepositoryProvider).rango(
        desde: inicioDiaCampus(ahora, offsetCampusPorDefecto),
        hasta: ahora.add(const Duration(days: 8)),
      );
});

final notificationPrefsProvider =
    FutureProvider<({PreferenciasNotificacion preferencias, bool pushConfigurado})>((ref) {
  return ref.watch(notificationPrefsRepositoryProvider).leer();
});

final risksProvider = FutureProvider<List<RiskItem>>((ref) {
  return ref.watch(academicRepositoryProvider).risks();
});

// ── Buzón de sugerencias ────────────────────────────────────────────────────

final feedbackServiceProvider = Provider((ref) => FeedbackService());

/// Lo que este docente ha enviado al buzón (el servidor filtra por autor).
final feedbackProvider = FutureProvider<List<FeedbackApp>>((ref) {
  return ref.watch(feedbackServiceProvider).listar();
});

// ── Trabajos de grado ───────────────────────────────────────────────────────

final profileServiceProvider = Provider((ref) => ProfileService());

/// Ficha propia. Es de donde sale el flag de director de trabajo de grado.
final miPerfilProvider = FutureProvider<Profile>((ref) {
  return ref.watch(profileServiceProvider).me();
});

/// ¿Este docente dirige trabajos de grado? Decide si la sección aparece en el
/// menú. `false` mientras carga o si falla: mejor un menú corto un instante
/// que una sección que responde 403 al tocarla.
final esDirectorProvider = Provider<bool>((ref) {
  return ref.watch(miPerfilProvider).maybeWhen(
        data: (perfil) => perfil.esDirectorTrabajoGrado,
        orElse: () => false,
      );
});

final thesisServiceProvider = Provider((ref) => ThesisService());

/// Formatos oficiales, opcionalmente filtrados por etapa (null = todas).
final thesisFormatsProvider =
    FutureProvider.family<List<FormatoTrabajoGrado>, String?>((ref, etapa) {
  return ref.watch(thesisServiceProvider).listar(etapa: etapa);
});

final notificationsProvider = FutureProvider<List<AppNotification>>((ref) {
  return ref.watch(academicRepositoryProvider).notifications();
});

final unreadCountProvider = Provider<int>((ref) {
  return ref.watch(notificationsProvider).maybeWhen(
        data: (items) => items.where((n) => n.isUnread).length,
        orElse: () => 0,
      );
});

final consolidatedProvider =
    FutureProvider.family<List<ConsolidatedRow>, String?>((ref, subjectId) {
  final period = ref.watch(selectedPeriodProvider);
  return ref
      .watch(academicRepositoryProvider)
      .consolidated(period: period, subjectId: subjectId);
});

/// Lo que queda por calificar en el periodo seleccionado.
final pendingGradesProvider =
    FutureProvider.family<List<PendingSubject>, String?>((ref, subjectId) {
  final period = ref.watch(selectedPeriodProvider);
  return ref
      .watch(academicRepositoryProvider)
      .pendingGrades(period: period, subjectId: subjectId);
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
