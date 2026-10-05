/// Datos para el widget de Android "Horario".
///
/// Función pura: toma la agenda ya cargada por la app y produce exactamente lo
/// que el `AppWidgetProvider` de Kotlin necesita para pintar, sin que el lado
/// nativo tenga que calcular ninguna hora. La hora de cada clase ya viene
/// resuelta en hora del campus (`core/data/campus_time.dart`), así que aquí
/// solo se formatea; lo único que decide el lado nativo, en cada repintado, es
/// si una fila sigue siendo futura y si su fecha es "Hoy" o "Mañana" —eso
/// cambia con el reloj, no con la sincronización, y el widget se repinta cada
/// 30 minutos aunque la app no haya vuelto a abrirse.
library;

import 'dart:convert';

import '../../core/data/campus_time.dart';
import 'data/agenda_models.dart';
import '../../core/data/etiqueta_grupo.dart';

/// Clave de `HomeWidget.saveWidgetData`/`getSharedPreferences` para el widget
/// "Horario". Un solo sitio para que Dart y Kotlin no diverjan en el nombre.
const claveDatosHorarioWidget = 'horario_datos';

/// Días hacia delante que se envían al widget. Igual que
/// `agendaProximaProvider`: es la ventana que ya trae el servidor, así que no
/// hace falta una segunda consulta solo para el widget.
const diasVentanaWidgetHorario = 7;

/// Tope de filas que se guardan. No es el número de filas que pinta el
/// widget —eso lo decide el layout nativo, hoy 4— sino un límite de
/// seguridad para no guardar el horario de todo el semestre en cada
/// sincronización.
const topeFilasWidgetHorario = 20;

/// Una fila ya formateada, lista para convertirse a JSON.
class FilaHorarioWidget {
  /// Instante absoluto de inicio y fin, en milisegundos desde época. El lado
  /// nativo los usa para decidir si la fila ya terminó, no para calcular
  /// ninguna hora de pared.
  final int inicioMillis;
  final int finMillis;

  /// Fecha del campus, 'AAAA-MM-DD'. Es contra la que el widget compara "hoy"
  /// y "mañana" en cada repintado.
  final String fecha;

  /// Día ya formateado para cuando no es ni hoy ni mañana: "jue 2 oct".
  final String dia;

  /// Rango horario ya formateado en hora del campus: "10:00 a. m. – 12:00 p. m.".
  final String hora;
  final String titulo;

  /// "Grupo A194 · Aula 301". Vacío si la clase no tiene ni grupo ni aula.
  final String detalle;

  const FilaHorarioWidget({
    required this.inicioMillis,
    required this.finMillis,
    required this.fecha,
    required this.dia,
    required this.hora,
    required this.titulo,
    required this.detalle,
  });

  Map<String, Object?> toJson() => {
        'inicioMillis': inicioMillis,
        'finMillis': finMillis,
        'fecha': fecha,
        'dia': dia,
        'hora': hora,
        'titulo': titulo,
        'detalle': detalle,
      };
}

const _diasCortos = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
const _mesesCortos = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

/// "jue 2 oct", en hora del campus.
String _diaCorto(DateTime instante, int offsetMinutos) {
  final p = partesCampus(instante, offsetMinutos);
  return '${_diasCortos[p.diaSemana - 1]} ${p.dia} ${_mesesCortos[p.mes - 1]}';
}

/// Selecciona y formatea las próximas clases para el widget.
///
/// Solo clases (`AgendaTipo.clase`): el widget de horario enseña justo eso, un
/// horario, no la agenda completa con parciales y entregas. Solo las que no
/// han terminado, con inicio dentro de los próximos [diasVentana] días, en
/// orden de inicio y como mucho [topeFilasWidgetHorario].
///
/// No recorta a las 3 o 4 filas que el widget muestra: ese recorte lo hace el
/// lado nativo en cada repintado, sobre lo que en ese momento siga siendo
/// futuro. Recortarlo aquí dejaría clases "fantasma" desaparecidas del widget
/// hasta la siguiente sincronización de la app, en vez de al pasar su hora.
List<FilaHorarioWidget> proximasClasesParaWidget(
  List<AgendaItem> items, {
  required int offsetCampusMinutos,
  DateTime? ahora,
  int diasVentana = diasVentanaWidgetHorario,
  int tope = topeFilasWidgetHorario,
}) {
  final referencia = (ahora ?? DateTime.now()).toUtc();
  final limite = referencia.add(Duration(days: diasVentana));

  final futuras = items
      .where((item) => item.esClase)
      .where((item) => item.fin.isAfter(referencia))
      .where((item) => item.inicio.isBefore(limite))
      .toList()
    ..sort((a, b) => a.inicio.compareTo(b.inicio));

  return futuras.take(tope).map((item) {
    final detalle = [
      if (item.grupo.isNotEmpty) etiquetaGrupo(item.grupo),
      if (item.aula.isNotEmpty) 'Aula ${item.aula}',
    ].join(' · ');
    return FilaHorarioWidget(
      inicioMillis: item.inicio.millisecondsSinceEpoch,
      finMillis: item.fin.millisecondsSinceEpoch,
      fecha: fechaCampus(item.inicio, offsetCampusMinutos),
      dia: _diaCorto(item.inicio, offsetCampusMinutos),
      hora: rangoHorasWidget(item.inicio, item.fin, offsetCampusMinutos),
      titulo: item.titulo.isNotEmpty ? item.titulo : item.materia,
      detalle: detalle,
    );
  }).toList();
}

/// Rango de una clase para la columna estrecha del widget.
///
/// «7:00 a. m. – 9:00 a. m.» no cabe en los 96 dp de la columna y se partía a
/// media palabra («9:00 / a. m.»). Si las dos horas caen en la misma mitad
/// del día, el sufijo va una sola vez: «7:00 – 9:00 a. m.». Dentro de cada
/// hora los espacios son no separables: si el rango no cabe en una línea,
/// se corta junto al guion y no en «p. / m.».
String rangoHorasWidget(DateTime inicio, DateTime fin, int offsetCampusMinutos) {
  const nbsp = ' ';
  final desde = horaCampus(inicio, offsetCampusMinutos);
  final hasta = horaCampus(fin, offsetCampusMinutos);
  final sufijoDesde = desde.substring(desde.indexOf(' ') + 1);
  final sufijoHasta = hasta.substring(hasta.indexOf(' ') + 1);
  String pegada(String hora) => hora.replaceAll(' ', nbsp);
  if (sufijoDesde == sufijoHasta) {
    return '${desde.substring(0, desde.indexOf(' '))} – ${pegada(hasta)}';
  }
  return '${pegada(desde)} – ${pegada(hasta)}';
}

/// JSON que se guarda en el almacenamiento del widget bajo
/// [claveDatosHorarioWidget].
///
/// Es una única cadena porque `home_widget` solo admite tipos primitivos en
/// `saveWidgetData` (bool, int, double, String): la lista entera va
/// serializada como un solo valor en vez de una entrada por clase.
String serializarHorarioWidget(
  List<AgendaItem> items, {
  required int offsetCampusMinutos,
  DateTime? ahora,
}) {
  final filas = proximasClasesParaWidget(
    items,
    offsetCampusMinutos: offsetCampusMinutos,
    ahora: ahora,
  );
  return jsonEncode({
    'offsetCampusMinutos': offsetCampusMinutos,
    'items': filas.map((f) => f.toJson()).toList(),
  });
}
