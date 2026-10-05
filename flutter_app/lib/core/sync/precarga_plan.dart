import '../data/models.dart';

/// Qué precargar y cuándo. Lógica pura: sin red, sin reloj propio.

/// Una lectura que calienta la caché.
enum TipoPrecarga {
  estudiantesDeMateria,
  estudiantesDeGrupo,
  matriculas,
  consolidado,
  pendientes,
  asistencia,
}

class TareaPrecarga {
  final TipoPrecarga tipo;
  final String subjectId;
  final String? groupId;

  const TareaPrecarga(this.tipo, this.subjectId, [this.groupId]);

  @override
  bool operator ==(Object other) =>
      other is TareaPrecarga &&
      other.tipo == tipo &&
      other.subjectId == subjectId &&
      other.groupId == groupId;

  @override
  int get hashCode => Object.hash(tipo, subjectId, groupId);

  @override
  String toString() => '$tipo($subjectId, $groupId)';
}

/// Tope de materias por pasada. Un docente tiene un puñado; el tope existe para
/// que una cuenta anómala no convierta la precarga en cientos de peticiones.
const int maxMateriasPrecarga = 30;

/// Cada cuánto como mucho se repite una precarga completa.
const Duration intervaloPrecarga = Duration(minutes: 30);

/// Solo los docentes: es el rol que pasa lista y anota notas sin red. Para el
/// resto no hay nada que precargar de forma barata (un ADMIN ve todo).
bool precargaAplicaAlRol(String? rol) => rol == 'PROFESSOR';

/// ¿Toca precargar ahora?
bool debePrecargar({
  required String? rol,
  required bool corriendo,
  required DateTime? ultimaCompleta,
  required DateTime ahora,
  Duration minimo = intervaloPrecarga,
}) {
  if (!precargaAplicaAlRol(rol) || corriendo) return false;
  if (ultimaCompleta == null) return true;
  return ahora.difference(ultimaCompleta) >= minimo;
}

/// Las tareas por materia del periodo, en orden de código.
///
/// Reproduce lo que las pantallas piden, para que las claves de caché casen:
/// la lista completa de la materia (desglose de notas y roster), la de cada
/// grupo con el periodo (toma de asistencia: con un solo grupo se pide con su
/// id, con varios una por grupo), matrículas, consolidado, pendientes y
/// asistencia.
List<TareaPrecarga> tareasDeMaterias({
  required List<Subject> subjects,
  required List<Group> groups,
  required String period,
  int tope = maxMateriasPrecarga,
}) {
  final materias =
      subjects.where((s) => s.period == period && s.id.isNotEmpty).toList()
        ..sort((a, b) => a.code.compareTo(b.code));

  final tareas = <TareaPrecarga>[];
  for (final materia in materias.take(tope)) {
    final delGrupo =
        groups
            .where(
              (g) =>
                  g.subjectId == materia.id &&
                  (g.period.isEmpty || g.period == period),
            )
            .toList()
          ..sort((a, b) => a.name.compareTo(b.name));

    tareas.add(TareaPrecarga(TipoPrecarga.estudiantesDeMateria, materia.id));
    if (delGrupo.isEmpty) {
      tareas.add(TareaPrecarga(TipoPrecarga.estudiantesDeGrupo, materia.id));
    }
    for (final grupo in delGrupo) {
      tareas.add(
        TareaPrecarga(TipoPrecarga.estudiantesDeGrupo, materia.id, grupo.id),
      );
    }
    tareas.add(TareaPrecarga(TipoPrecarga.matriculas, materia.id));
    tareas.add(TareaPrecarga(TipoPrecarga.consolidado, materia.id));
    tareas.add(TareaPrecarga(TipoPrecarga.pendientes, materia.id));
    tareas.add(TareaPrecarga(TipoPrecarga.asistencia, materia.id));
  }
  return tareas;
}
