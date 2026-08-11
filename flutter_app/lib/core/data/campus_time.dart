/// Hora del campus — funciones puras, sin Flutter.
///
/// Todas las horas que la app enseña se resuelven con el desfase que manda el
/// servidor, no con la zona horaria del teléfono. La diferencia importa: un
/// teléfono con la zona mal configurada —o de alguien que viajó— seguiría
/// mostrando la hora real de la clase, y el contador de "comienza en 25
/// minutos" seguiría siendo correcto porque se calcula sobre instantes
/// absolutos, no sobre horas de pared.
library;

const int _msMinuto = 60000;
const int msDia = 86400000;

/// Desfase por defecto si el servidor no lo envía (Colombia, UTC-5, sin DST).
const int offsetCampusPorDefecto = -300;

/// Partes del día en hora del campus para un instante absoluto.
({int anio, int mes, int dia, int horas, int minutos, int diaSemana}) partesCampus(
  DateTime instante,
  int offsetMinutos,
) {
  final desplazado = instante.toUtc().add(Duration(minutes: offsetMinutos));
  return (
    anio: desplazado.year,
    mes: desplazado.month,
    dia: desplazado.day,
    horas: desplazado.hour,
    minutos: desplazado.minute,
    // DateTime.weekday ya es 1 = lunes … 7 = domingo.
    diaSemana: desplazado.weekday,
  );
}

/// 'AAAA-MM-DD' en hora del campus. Es la clave con la que se agrupa el día.
String fechaCampus(DateTime instante, int offsetMinutos) {
  final p = partesCampus(instante, offsetMinutos);
  return '${p.anio.toString().padLeft(4, '0')}-'
      '${p.mes.toString().padLeft(2, '0')}-'
      '${p.dia.toString().padLeft(2, '0')}';
}

/// Hora de pared del campus, formato 12 h: "10:00 a. m.".
String horaCampus(DateTime instante, int offsetMinutos) {
  final p = partesCampus(instante, offsetMinutos);
  final sufijo = p.horas < 12 ? 'a. m.' : 'p. m.';
  final doce = p.horas % 12 == 0 ? 12 : p.horas % 12;
  return '$doce:${p.minutos.toString().padLeft(2, '0')} $sufijo';
}

/// Medianoche del campus para ese instante, como instante absoluto (UTC).
DateTime inicioDiaCampus(DateTime instante, int offsetMinutos) {
  final p = partesCampus(instante, offsetMinutos);
  return DateTime.utc(p.anio, p.mes, p.dia).subtract(Duration(minutes: offsetMinutos));
}

/// Medianoche del lunes de esa semana, como instante absoluto (UTC).
DateTime inicioSemanaCampus(DateTime instante, int offsetMinutos) {
  final p = partesCampus(instante, offsetMinutos);
  return inicioDiaCampus(instante, offsetMinutos)
      .subtract(Duration(days: p.diaSemana - 1));
}

const _nombresDia = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const _nombresMes = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

String nombreDiaCampus(DateTime instante, int offsetMinutos) =>
    _nombresDia[partesCampus(instante, offsetMinutos).diaSemana - 1];

String nombreMesCampus(DateTime instante, int offsetMinutos) =>
    _nombresMes[partesCampus(instante, offsetMinutos).mes - 1];

/// "martes 11 de agosto".
String fechaLargaCampus(DateTime instante, int offsetMinutos) {
  final p = partesCampus(instante, offsetMinutos);
  return '${nombreDiaCampus(instante, offsetMinutos)} ${p.dia} de '
      '${nombreMesCampus(instante, offsetMinutos)}';
}

/// ¿Ese instante cae hoy, en el campus?
bool esHoyCampus(DateTime instante, int offsetMinutos, [DateTime? ahora]) =>
    fechaCampus(instante, offsetMinutos) ==
    fechaCampus(ahora ?? DateTime.now().toUtc(), offsetMinutos);

/// Minutos que faltan (positivo) o que pasaron (negativo) hasta un instante.
///
/// Redondea hacia arriba para que "faltan 0 minutos" solo aparezca cuando de
/// verdad ya empezó, y no durante los últimos 59 segundos.
int minutosHasta(DateTime instante, DateTime ahora) =>
    (instante.difference(ahora).inMilliseconds / _msMinuto).ceil();

/// Texto de la espera: "32 minutos", "2 h 10 min", "3 días".
String tiempoRestante(int minutos) {
  if (minutos <= 0) return 'ahora';
  if (minutos < 60) return '$minutos ${minutos == 1 ? 'minuto' : 'minutos'}';
  if (minutos < 1440) {
    final horas = minutos ~/ 60;
    final resto = minutos % 60;
    if (resto == 0) return '$horas ${horas == 1 ? 'hora' : 'horas'}';
    return '$horas h $resto min';
  }
  final dias = (minutos / 1440).round();
  return '$dias ${dias == 1 ? 'día' : 'días'}';
}
