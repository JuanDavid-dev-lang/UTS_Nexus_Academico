import 'package:flutter_riverpod/flutter_riverpod.dart';

import './academic_repository.dart';
import './models.dart';

// ── Índice de providers ─────────────────────────────────────────────────────
//
// Este archivo llegó a tener veintinueve providers de diez capacidades
// distintas. Todas las pantallas lo tocaban, así que todos los cambios
// chocaban aquí y no se podía leer una capacidad sin abrirlo entero.
//
// Ahora **cada capacidad guarda los suyos junto a su pantalla** y esto es solo
// el índice, más lo poco que de verdad comparten todas. Un índice de veinte
// líneas de `export` no es un archivo central: es un sitio desde el que
// navegar. Lo que era un problema no era el import compartido, era que el
// código viviera todo junto.
export '../../features/agenda/agenda_providers.dart';
export '../../features/feedback/feedback_providers.dart';
export '../../features/grades/grades_providers.dart';
export '../../features/notifications/notifications_providers.dart';
export '../../features/profile/profile_providers.dart';
export '../../features/settings/settings_providers.dart';
export '../../features/students/students_providers.dart';
export '../../features/subjects/subjects_providers.dart';
export '../../features/thesis/thesis_providers.dart';

// ── Lo que de verdad comparten todas ────────────────────────────────────────

/// Acceso HTTP a los datos académicos. Lo usan materias, estudiantes, notas,
/// riesgo y notificaciones, así que vive aquí y no en ninguna de ellas.
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

/// Listado global de materias del docente. Es la raíz de la navegación por
/// materia, así que lo consultan varias capacidades a la vez.
final subjectsProvider = FutureProvider<List<Subject>>((ref) {
  return ref.watch(academicRepositoryProvider).subjects();
});

/// Directorio completo de estudiantes del docente.
final studentsProvider = FutureProvider<List<Student>>((ref) {
  return ref.watch(academicRepositoryProvider).students();
});

/// Riesgo académico. Lo leen el panel, el detalle de materia y las tarjetas de
/// resumen: es dato transversal, no de una pantalla.
final risksProvider = FutureProvider<List<RiskItem>>((ref) {
  return ref.watch(academicRepositoryProvider).risks();
});
