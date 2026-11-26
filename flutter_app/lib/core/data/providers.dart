import 'package:flutter_riverpod/flutter_riverpod.dart';

import './academic_repository.dart';
import './models.dart';
import './periodo_vigente.dart';

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
export '../../features/activities/activities_providers.dart';
export '../../features/agenda/agenda_providers.dart';
export '../../features/feedback/feedback_providers.dart';
export '../../features/grades/grades_providers.dart';
export '../../features/notifications/notifications_providers.dart';
export '../../features/profile/profile_providers.dart';
export '../../features/settings/settings_providers.dart';
export '../../features/students/students_providers.dart';
export '../../features/subjects/subjects_providers.dart';
export '../../features/thesis/thesis_providers.dart';
export './periodo_vigente.dart';

// ── Lo que de verdad comparten todas ────────────────────────────────────────

/// Acceso HTTP a los datos académicos. Lo usan materias, estudiantes, notas,
/// riesgo y notificaciones, así que vive aquí y no en ninguna de ellas.
final academicRepositoryProvider = Provider((ref) => AcademicRepository());

/// El semestre que corre según el servidor, o `null` sin respuesta ni caché.
///
/// Sin `autoDispose`, como el resto: se pide una vez por sesión y lo refresca
/// el `sync:update` de `period`. Un fallo se traga y deja `null`, que hace caer
/// al calendario: sin servidor, abrir en el semestre del mes es mejor que no
/// abrir.
final periodoVigenteProvider = FutureProvider<String?>((ref) async {
  try {
    return await ref.watch(academicRepositoryProvider).periodoActual();
  } catch (_) {
    return null;
  }
});

/// El semestre que el docente eligió a mano en el selector; `null` si no
/// eligió ninguno y se sigue al servidor.
final periodoElegidoProvider = StateProvider<String?>((ref) => null);

/// Periodo académico activo. Lo comparten notas, asistencia y reportes: cambiar
/// de semestre en una pantalla lo cambia en todas, que es lo que un docente
/// espera.
///
/// Se deriva en vez de guardarse: arranca en el del servidor cuando llega (y
/// mientras tanto en el del calendario), y lo que se elige a mano manda.
/// Copiar la respuesta del servidor a un `StateProvider` pisaría la elección
/// del docente si llegara después.
final selectedPeriodProvider = Provider<String>((ref) {
  return periodoEnUso(
    elegido: ref.watch(periodoElegidoProvider),
    delServidor: ref.watch(periodoVigenteProvider).valueOrNull,
  );
});

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
