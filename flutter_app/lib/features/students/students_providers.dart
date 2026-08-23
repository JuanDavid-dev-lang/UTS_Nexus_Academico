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
