/// Qué semestre se enseña. Lógica pura, sin Flutter ni red.
///
/// El semestre que corre lo decide el servidor (`GET /periods/current`) con
/// las fechas que pone la administración; el teléfono ya no lo deduce del mes
/// de su reloj salvo como último respaldo. Lo que el docente elige a mano en el
/// selector manda sobre los dos: el servidor respondiendo tarde no le cambia
/// el semestre que está mirando.
library;

final _patron = RegExp(r'^\d{4}-[1-4]$');

/// Si una cadena tiene la forma de un periodo (`2026-1`).
bool esPeriodoValido(String valor) => _patron.hasMatch(valor);

/// El periodo del calendario: enero–junio es `-1`, julio–diciembre `-2`.
String currentPeriod([DateTime? now]) {
  final date = now ?? DateTime.now();
  return '${date.year}-${date.month <= 6 ? 1 : 2}';
}

/// Los periodos recientes del calendario, del más nuevo al más viejo.
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

/// El periodo en uso: el elegido a mano, si no el del servidor, si no el del
/// calendario.
String periodoEnUso({String? elegido, String? delServidor, DateTime? ahora}) {
  if (elegido != null && esPeriodoValido(elegido)) return elegido;
  if (delServidor != null && esPeriodoValido(delServidor)) return delServidor;
  return currentPeriod(ahora);
}

/// Opciones del selector: los recientes más el vigente del servidor, sin
/// repetir y del más nuevo al más viejo. En diciembre el servidor ya puede
/// decir `2027-1`, que no está entre los recientes del calendario.
List<String> opcionesDePeriodo(String vigente, {int count = 6, DateTime? now}) {
  final todos = {vigente, ...recentPeriods(count: count, now: now)}.toList();
  int clave(String p) {
    final partes = p.split('-');
    return (int.tryParse(partes.first) ?? 0) * 10 +
        (partes.length > 1 ? int.tryParse(partes[1]) ?? 0 : 0);
  }

  todos.sort((a, b) => clave(b).compareTo(clave(a)));
  return todos;
}
