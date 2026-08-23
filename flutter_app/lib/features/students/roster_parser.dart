/// Parser puro para listas pegadas desde CSV/Excel.
///
/// Conserva los errores por fila para que la persona revise la propuesta antes
/// de enviarla. La unicidad definitiva sigue perteneciendo al backend.
class RosterParseError {
  final int line;
  final String raw;
  final String reason;

  const RosterParseError(this.line, this.raw, this.reason);
}

class RosterParseResult {
  final List<Map<String, dynamic>> rows;
  final List<RosterParseError> errors;
  final int duplicates;

  const RosterParseResult({
    required this.rows,
    required this.errors,
    required this.duplicates,
  });
}

final _emailPattern = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');
final _headerWords = <String>{
  'cedula',
  'documento',
  'identificacion',
  'codigo',
  'nombre',
  'estudiante',
  'apellido',
};

String _normalize(String value) => value
    .toLowerCase()
    .replaceAll(RegExp('[áàä]'), 'a')
    .replaceAll(RegExp('[éèë]'), 'e')
    .replaceAll(RegExp('[íìï]'), 'i')
    .replaceAll(RegExp('[óòö]'), 'o')
    .replaceAll(RegExp('[úùü]'), 'u')
    .trim();

List<String> splitRosterLine(String line, String delimiter) {
  final fields = <String>[];
  final current = StringBuffer();
  var quoted = false;
  for (var index = 0; index < line.length; index++) {
    final char = line[index];
    if (char == '"') {
      if (quoted && index + 1 < line.length && line[index + 1] == '"') {
        current.write('"');
        index++;
      } else {
        quoted = !quoted;
      }
    } else if (char == delimiter && !quoted) {
      fields.add(current.toString().trim());
      current.clear();
    } else {
      current.write(char);
    }
  }
  fields.add(current.toString().trim());
  return fields;
}

String _delimiter(List<String> lines) {
  var best = ';';
  var score = -1;
  for (final candidate in [';', ',', '\t', '|']) {
    final candidateScore = lines
        .take(20)
        .where((line) => splitRosterLine(line, candidate).length >= 2)
        .length;
    if (candidateScore > score) {
      best = candidate;
      score = candidateScore;
    }
  }
  return best;
}

RosterParseResult parseRoster(String input) {
  final rows = <Map<String, dynamic>>[];
  final errors = <RosterParseError>[];
  final seen = <String>{};
  var duplicates = 0;
  final lines = input.replaceFirst('\uFEFF', '').split(RegExp(r'\r?\n'));
  final meaningful = lines.where((line) => line.trim().isNotEmpty).toList();
  if (meaningful.isEmpty) {
    return const RosterParseResult(rows: [], errors: [], duplicates: 0);
  }
  final delimiter = _delimiter(meaningful);

  for (var index = 0; index < lines.length; index++) {
    final raw = lines[index].trim();
    if (raw.isEmpty) continue;
    final fields = splitRosterLine(raw, delimiter);
    if (fields.any((field) => _headerWords.contains(_normalize(field)))) {
      continue;
    }
    if (fields.length < 2) {
      errors.add(
        RosterParseError(
          index + 1,
          raw,
          'Se esperaban al menos cédula y nombre.',
        ),
      );
      continue;
    }
    final codeIndex = fields.indexWhere((field) {
      final clean = field.replaceAll(RegExp(r'[\s.]'), '');
      return RegExp(r'^\d{3,}$').hasMatch(clean);
    });
    if (codeIndex < 0) {
      errors.add(
        RosterParseError(index + 1, raw, 'No se encontró una cédula válida.'),
      );
      continue;
    }
    final code = fields[codeIndex].replaceAll(RegExp(r'[\s.]'), '');
    final name = fields.indexed
        .where(
          (entry) =>
              entry.$1 != codeIndex &&
              RegExp(r'[A-Za-zÁÉÍÓÚáéíóúÑñ]').hasMatch(entry.$2) &&
              !entry.$2.contains('@'),
        )
        .map((entry) => entry.$2)
        .firstOrNull;
    if (name == null || name.trim().length < 3) {
      errors.add(
        RosterParseError(index + 1, raw, 'Falta el nombre del estudiante.'),
      );
      continue;
    }
    final emailCell = fields.where((field) => field.contains('@')).firstOrNull;
    final email = emailCell?.trim().toLowerCase();
    if (email != null && !_emailPattern.hasMatch(email)) {
      errors.add(RosterParseError(index + 1, raw, 'Correo inválido.'));
      continue;
    }
    if (!seen.add(code)) {
      duplicates++;
      continue;
    }
    final remaining = fields.indexed.where(
      (entry) =>
          entry.$1 != codeIndex && entry.$2 != name && entry.$2 != emailCell,
    );
    final program = remaining
        .map((entry) => entry.$2.trim())
        .where((value) => value.isNotEmpty)
        .firstOrNull;
    if (program == null || program.length < 2) {
      errors.add(
        RosterParseError(index + 1, raw, 'Falta el programa del estudiante.'),
      );
      continue;
    }
    rows.add({
      'code': code,
      'fullName': name.replaceAll(RegExp(r'\s+'), ' ').trim(),
      if (email != null) 'email': email,
      'program': program,
    });
  }
  return RosterParseResult(rows: rows, errors: errors, duplicates: duplicates);
}
