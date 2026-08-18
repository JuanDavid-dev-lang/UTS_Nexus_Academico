/// Hora del campus. Funciones puras, sin widgets ni red.
///
/// Fijan lo que no puede cambiar en silencio: que "10:00" son las diez del
/// campus y no las del reloj del teléfono, y que el contador de la próxima
/// clase cuente sobre instantes absolutos. Un fallo aquí no rompe la pantalla:
/// simplemente enseña una hora equivocada, que es peor.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:uts_academico/core/data/campus_time.dart';
import 'package:uts_academico/features/agenda/data/agenda_models.dart';

const offset = -300; // Colombia, UTC-5, sin horario de verano.

void main() {
  group('hora del campus', () {
    test('no usa la zona horaria del teléfono', () {
      final instante = DateTime.parse('2026-08-10T15:00:00.000Z');
      expect(horaCampus(instante, offset), '10:00 a. m.');
      expect(horaCampus(DateTime.parse('2026-08-10T17:00:00.000Z'), offset), '12:00 p. m.');
      expect(horaCampus(DateTime.parse('2026-08-10T05:00:00.000Z'), offset), '12:00 a. m.');
    });

    test('la fecha del campus puede ser el día anterior al UTC', () {
      // 03:00 UTC del día 11 son las 22:00 del día 10 en el campus.
      expect(fechaCampus(DateTime.parse('2026-08-11T03:00:00.000Z'), offset), '2026-08-10');
    });

    test('el día empieza a la medianoche del campus', () {
      final inicio = inicioDiaCampus(DateTime.parse('2026-08-10T18:00:00.000Z'), offset);
      expect(inicio.toIso8601String(), '2026-08-10T05:00:00.000Z');
    });

    test('la semana empieza en lunes', () {
      // Miércoles 12 de agosto de 2026, 14:00 del campus.
      final miercoles = DateTime.parse('2026-08-12T19:00:00.000Z');
      expect(fechaCampus(inicioSemanaCampus(miercoles, offset), offset), '2026-08-10');
    });

    test('reconoce el día de hoy en hora del campus', () {
      final ahora = DateTime.parse('2026-08-11T03:00:00.000Z'); // 22:00 del día 10
      expect(esHoyCampus(DateTime.parse('2026-08-10T15:00:00.000Z'), offset, ahora), isTrue);
      expect(esHoyCampus(DateTime.parse('2026-08-11T15:00:00.000Z'), offset, ahora), isFalse);
    });

    test('el nombre del día sale del calendario del campus', () {
      expect(nombreDiaCampus(DateTime.parse('2026-08-10T15:00:00.000Z'), offset), 'lunes');
      expect(nombreMesCampus(DateTime.parse('2026-08-10T15:00:00.000Z'), offset), 'agosto');
      expect(fechaLargaCampus(DateTime.parse('2026-08-10T15:00:00.000Z'), offset),
          'lunes 10 de agosto');
    });
  });

  group('cuenta atrás', () {
    test('redondea hacia arriba para no decir "0 minutos" antes de tiempo', () {
      final inicio = DateTime.parse('2026-08-10T15:00:00.000Z');
      expect(minutosHasta(inicio, DateTime.parse('2026-08-10T14:59:01.000Z')), 1);
      expect(minutosHasta(inicio, DateTime.parse('2026-08-10T15:00:00.000Z')), 0);
      expect(minutosHasta(inicio, DateTime.parse('2026-08-10T14:28:00.000Z')), 32);
    });

    test('una clase ya empezada da minutos negativos', () {
      final inicio = DateTime.parse('2026-08-10T15:00:00.000Z');
      expect(minutosHasta(inicio, DateTime.parse('2026-08-10T15:10:00.000Z')), -10);
    });

    test('describe la espera en la unidad que corresponde', () {
      expect(tiempoRestante(32), '32 minutos');
      expect(tiempoRestante(1), '1 minuto');
      expect(tiempoRestante(120), '2 horas');
      expect(tiempoRestante(150), '2 h 30 min');
      expect(tiempoRestante(2880), '2 días');
      expect(tiempoRestante(0), 'ahora');
    });
  });

  group('AgendaItem', () {
    final json = {
      'id': 'class:abc:2026-08-10',
      'origen': 'schedule',
      'sourceId': 'abc',
      'kind': 'CLASS',
      'type': 'CLASS',
      'title': 'Programación II',
      'description': '',
      'startAt': '2026-08-10T15:00:00.000Z',
      'endAt': '2026-08-10T17:00:00.000Z',
      'durationMinutes': 120,
      'allDay': false,
      'date': '2026-08-10',
      'subjectId': 'm1',
      'subjectName': 'Programación II',
      'subjectCode': 'PRG2',
      'groupName': '2A',
      'teacherName': 'Ana Ruiz',
      'classroom': '304',
      'period': '2026-2',
      'priority': 'MEDIUM',
      'reminderMinutes': [15, 60],
      'status': 'EN_CURSO',
    };

    test('lee las horas como instantes absolutos', () {
      final item = AgendaItem.fromJson(json);
      expect(item.inicio.isUtc, isTrue);
      expect(horaCampus(item.inicio, offset), '10:00 a. m.');
      expect(item.duracionMinutos, 120);
      expect(item.estado, EstadoAgenda.enCurso);
      expect(item.esClase, isTrue);
      expect(item.recordatorios, [15, 60]);
    });

    test('sobrevive a un tipo desconocido en vez de fallar', () {
      final item = AgendaItem.fromJson({...json, 'type': 'ALGO_NUEVO'});
      expect(item.tipo, AgendaTipo.actividad);
    });

    test('una fecha inválida no revienta el parseo', () {
      final item = AgendaItem.fromJson({...json, 'startAt': 'no es una fecha'});
      expect(item.inicio.millisecondsSinceEpoch, 0);
    });

    test('ida y vuelta por JSON conserva lo que se cachea', () {
      final item = AgendaItem.fromJson(json);
      final copia = AgendaItem.fromJson(item.toJson());
      expect(copia.id, item.id);
      expect(copia.inicio, item.inicio);
      expect(copia.aula, item.aula);
      expect(copia.estado, item.estado);
    });
  });

  group('PreferenciasNotificacion', () {
    test('los valores por defecto dejan recibir lo importante', () {
      final p = PreferenciasNotificacion.fromJson(const {});
      expect(p.clases, isTrue);
      expect(p.riesgo, isTrue);
      // La sincronización es ruido técnico: apagada salvo que se pida.
      expect(p.sincronizacion, isFalse);
      expect(p.antelacionesClase, [15]);
    });

    test('lee la franja de silencio', () {
      final p = PreferenciasNotificacion.fromJson(const {
        'quietHours': {'enabled': true, 'start': '22:00', 'end': '07:00'},
        'classLeadMinutes': [5, 30],
      });
      expect(p.silencioActivo, isTrue);
      expect(p.silencioDesde, '22:00');
      expect(p.antelacionesClase, [5, 30]);
    });

    test('ida y vuelta por JSON conserva la configuración', () {
      const original = PreferenciasNotificacion.porDefecto;
      final copia = PreferenciasNotificacion.fromJson(original.toJson());
      expect(copia.antelacionesClase, original.antelacionesClase);
      expect(copia.silencioDesde, original.silencioDesde);
      expect(copia.push, original.push);
    });
  });

  group('AgendaResumen', () {
    test('lee la clase en curso y la próxima con sus contadores', () {
      final resumen = AgendaResumen.fromJson({
        'campusOffsetMinutes': -300,
        'enCurso': {
          'id': 'class:a:2026-08-10',
          'startAt': '2026-08-10T15:00:00.000Z',
          'endAt': '2026-08-10T17:00:00.000Z',
          'type': 'CLASS',
          'title': 'Programación II',
          'date': '2026-08-10',
          'minutosRestantes': 45,
        },
        'proxima': {
          'id': 'class:b:2026-08-10',
          'startAt': '2026-08-10T19:00:00.000Z',
          'endAt': '2026-08-10T21:00:00.000Z',
          'type': 'CLASS',
          'title': 'Cálculo I',
          'date': '2026-08-10',
          'minutosPara': 165,
        },
        'hoy': [],
        'proximosEventos': [],
      });

      expect(resumen.enCurso?.titulo, 'Programación II');
      expect(resumen.minutosRestantes, 45);
      expect(resumen.proxima?.titulo, 'Cálculo I');
      expect(resumen.minutosPara, 165);
      expect(resumen.offsetCampusMinutos, -300);
    });

    test('un resumen sin clases no inventa ninguna', () {
      final resumen = AgendaResumen.fromJson(const {
        'enCurso': null,
        'proxima': null,
        'hoy': [],
        'proximosEventos': [],
      });
      expect(resumen.enCurso, isNull);
      expect(resumen.proxima, isNull);
      expect(resumen.offsetCampusMinutos, -300);
    });
  });
}
