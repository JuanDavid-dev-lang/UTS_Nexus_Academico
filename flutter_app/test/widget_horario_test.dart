/// Datos para el widget "Horario". Función pura, sin `home_widget` ni Android:
/// fija qué se guarda para el widget nativo, para que el formato no diverja
/// del código Kotlin que lo lee sin que ninguna prueba se entere.
library;

import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:uts_academico/features/agenda/data/agenda_models.dart';
import 'package:uts_academico/features/agenda/widget_horario.dart';

const _offset = -300; // Colombia, UTC-5.

AgendaItem _clase({
  required String id,
  required DateTime inicio,
  required DateTime fin,
  String titulo = 'Ingeniería del Software',
  String grupo = 'A194',
  String aula = '301',
}) {
  return AgendaItem(
    id: id,
    origen: 'schedule',
    sourceId: id,
    tipo: AgendaTipo.clase,
    titulo: titulo,
    descripcion: '',
    inicio: inicio,
    fin: fin,
    duracionMinutos: fin.difference(inicio).inMinutes,
    todoElDia: false,
    fecha: '',
    materiaId: 'materia-1',
    materia: titulo,
    codigoMateria: 'PIS701',
    grupo: grupo,
    docente: '',
    aula: aula,
    periodo: '2026-2',
    prioridad: 'MEDIUM',
    recordatorios: const [],
    estado: EstadoAgenda.proxima,
  );
}

void main() {
  group('proximasClasesParaWidget', () {
    test('descarta lo que ya terminó y lo que no es clase', () {
      final ahora = DateTime.parse('2026-09-27T15:00:00.000Z'); // domingo
      final terminada = _clase(
        id: 'a',
        inicio: ahora.subtract(const Duration(hours: 3)),
        fin: ahora.subtract(const Duration(hours: 2)),
      );
      final futura = _clase(
        id: 'b',
        inicio: ahora.add(const Duration(hours: 1)),
        fin: ahora.add(const Duration(hours: 2)),
      );
      final noEsClase = AgendaItem(
        id: 'c',
        origen: 'calendar',
        sourceId: 'c',
        tipo: AgendaTipo.parcial,
        titulo: 'Parcial',
        descripcion: '',
        inicio: ahora.add(const Duration(hours: 1)),
        fin: ahora.add(const Duration(hours: 2)),
        duracionMinutos: 60,
        todoElDia: false,
        fecha: '',
        materiaId: '',
        materia: '',
        codigoMateria: '',
        grupo: '',
        docente: '',
        aula: '',
        periodo: '',
        prioridad: 'MEDIUM',
        recordatorios: const [],
        estado: EstadoAgenda.proxima,
      );

      final filas = proximasClasesParaWidget(
        [terminada, futura, noEsClase],
        offsetCampusMinutos: _offset,
        ahora: ahora,
      );

      expect(filas, hasLength(1));
      expect(filas.single.titulo, 'Ingeniería del Software');
    });

    test('descarta lo que empieza fuera de la ventana de 7 días', () {
      final ahora = DateTime.parse('2026-09-27T15:00:00.000Z');
      final dentro = _clase(
        id: 'a',
        inicio: ahora.add(const Duration(days: 6)),
        fin: ahora.add(const Duration(days: 6, hours: 1)),
      );
      final fuera = _clase(
        id: 'b',
        inicio: ahora.add(const Duration(days: 8)),
        fin: ahora.add(const Duration(days: 8, hours: 1)),
      );

      final filas = proximasClasesParaWidget(
        [dentro, fuera],
        offsetCampusMinutos: _offset,
        ahora: ahora,
        diasVentana: 7,
      );

      expect(filas, hasLength(1));
      expect(filas.single.inicioMillis, dentro.inicio.millisecondsSinceEpoch);
    });

    test('ordena por hora de inicio, sin importar el orden de entrada', () {
      final ahora = DateTime.parse('2026-09-27T15:00:00.000Z');
      final segunda = _clase(
        id: 'segunda',
        inicio: ahora.add(const Duration(hours: 5)),
        fin: ahora.add(const Duration(hours: 6)),
      );
      final primera = _clase(
        id: 'primera',
        inicio: ahora.add(const Duration(hours: 1)),
        fin: ahora.add(const Duration(hours: 2)),
      );

      final filas = proximasClasesParaWidget(
        [segunda, primera],
        offsetCampusMinutos: _offset,
        ahora: ahora,
      );

      expect(filas.map((f) => f.inicioMillis), [
        primera.inicio.millisecondsSinceEpoch,
        segunda.inicio.millisecondsSinceEpoch,
      ]);
    });

    test('respeta el tope de filas', () {
      final ahora = DateTime.parse('2026-09-27T15:00:00.000Z');
      final items = List.generate(
        5,
        (i) => _clase(
          id: 'clase-$i',
          inicio: ahora.add(Duration(hours: i + 1)),
          fin: ahora.add(Duration(hours: i + 2)),
        ),
      );

      final filas = proximasClasesParaWidget(
        items,
        offsetCampusMinutos: _offset,
        ahora: ahora,
        tope: 2,
      );

      expect(filas, hasLength(2));
    });

    test('formatea fecha del campus, día corto, hora y detalle', () {
      // 2026-09-27T15:00:00Z es 2026-09-27 10:00 en el campus (UTC-5).
      final inicio = DateTime.parse('2026-09-27T15:00:00.000Z');
      final fin = DateTime.parse('2026-09-27T17:00:00.000Z');
      final item = _clase(id: 'a', inicio: inicio, fin: fin);

      final filas = proximasClasesParaWidget(
        [item],
        offsetCampusMinutos: _offset,
        ahora: inicio.subtract(const Duration(hours: 1)),
      );

      final fila = filas.single;
      expect(fila.fecha, '2026-09-27');
      expect(fila.dia, 'dom 27 sep');
      expect(fila.hora, '10:00 a. m. – 12:00 p. m.');
      expect(fila.titulo, 'Ingeniería del Software');
      expect(fila.detalle, 'Grupo A194 · Aula 301');
    });

    test('el detalle queda vacío sin grupo ni aula', () {
      final inicio = DateTime.parse('2026-09-27T15:00:00.000Z');
      final item = _clase(
        id: 'a',
        inicio: inicio,
        fin: inicio.add(const Duration(hours: 1)),
        grupo: '',
        aula: '',
      );

      final filas = proximasClasesParaWidget(
        [item],
        offsetCampusMinutos: _offset,
        ahora: inicio.subtract(const Duration(hours: 1)),
      );

      expect(filas.single.detalle, '');
    });

    test('lista vacía sin clases futuras', () {
      final ahora = DateTime.parse('2026-09-27T15:00:00.000Z');
      final terminada = _clase(
        id: 'a',
        inicio: ahora.subtract(const Duration(hours: 2)),
        fin: ahora.subtract(const Duration(hours: 1)),
      );

      final filas = proximasClasesParaWidget(
        [terminada],
        offsetCampusMinutos: _offset,
        ahora: ahora,
      );

      expect(filas, isEmpty);
    });
  });

  group('serializarHorarioWidget', () {
    test('codifica el desfase y las filas como JSON', () {
      final inicio = DateTime.parse('2026-09-27T15:00:00.000Z');
      final item = _clase(id: 'a', inicio: inicio, fin: inicio.add(const Duration(hours: 1)));

      final json = jsonDecode(
        serializarHorarioWidget(
          [item],
          offsetCampusMinutos: _offset,
          ahora: inicio.subtract(const Duration(hours: 1)),
        ),
      ) as Map<String, dynamic>;

      expect(json['offsetCampusMinutos'], _offset);
      final items = json['items'] as List;
      expect(items, hasLength(1));
      expect((items.single as Map)['titulo'], 'Ingeniería del Software');
    });

    test('lista vacía sigue siendo un JSON válido', () {
      final json = jsonDecode(
        serializarHorarioWidget(const [], offsetCampusMinutos: _offset),
      ) as Map<String, dynamic>;

      expect(json['items'], isEmpty);
      expect(json['offsetCampusMinutos'], _offset);
    });
  });

  group('rangoHorasWidget', () {
    // Campus a -300: 12:00Z son las 7:00 a. m.
    final siete = DateTime.parse('2026-10-05T12:00:00Z');

    test('misma mitad del día: el sufijo va una sola vez', () {
      expect(
        rangoHorasWidget(siete, siete.add(const Duration(hours: 2)), -300),
        '7:00 – 9:00 a. m.',
      );
    });

    test('cruza el mediodía: cada hora con su sufijo', () {
      expect(
        rangoHorasWidget(siete.add(const Duration(hours: 3)), siete.add(const Duration(hours: 5)), -300),
        '10:00 a. m. – 12:00 p. m.',
      );
    });
  });
}
