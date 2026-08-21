import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/data/models.dart';
import '../../core/data/providers.dart';

/// Providers del directorio de estudiantes.

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

/// Término de búsqueda de texto en el directorio global.
final studentSearchQueryProvider = StateProvider<String>((ref) => '');

/// Directorio filtrado por materia y acotado por el término de búsqueda.
///
/// Si la lista de estudiantes es mayor a 500 registros, realiza el filtrado
/// en un Isolate secundario mediante [compute] para evitar bloquear el hilo
/// de la UI mientras el docente escribe.
final filteredAndSearchedStudentsProvider = FutureProvider<List<Student>>((ref) async {
  final studentsAsync = await ref.watch(filteredStudentsProvider.future);
  final query = ref.watch(studentSearchQueryProvider);

  if (query.trim().isEmpty) return studentsAsync;

  if (studentsAsync.length > 500) {
    return compute(
      _filtrarEstudiantesIsolate,
      _FiltroEstudiantesParams(studentsAsync, query),
    );
  } else {
    final term = query.trim().toLowerCase();
    return studentsAsync.where((s) {
      return s.fullName.toLowerCase().contains(term) ||
             s.code.toLowerCase().contains(term) ||
             s.program.toLowerCase().contains(term);
    }).toList();
  }
});

/// Parámetros para la función de filtrado ejecutada en el Isolate.
class _FiltroEstudiantesParams {
  final List<Student> estudiantes;
  final String query;
  const _FiltroEstudiantesParams(this.estudiantes, this.query);
}

/// Función de alto nivel para filtrar estudiantes en un Isolate secundario.
List<Student> _filtrarEstudiantesIsolate(_FiltroEstudiantesParams params) {
  final term = params.query.trim().toLowerCase();
  return params.estudiantes.where((s) {
    return s.fullName.toLowerCase().contains(term) ||
           s.code.toLowerCase().contains(term) ||
           s.program.toLowerCase().contains(term);
  }).toList();
}

