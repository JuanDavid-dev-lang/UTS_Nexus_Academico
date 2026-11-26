/// Lectura de un listado desde archivo o foto: qué se lee en el teléfono, qué
/// va al escáner del servidor y cómo cae la propuesta en la revisión de la
/// lista pegada (sin escribir nada).
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:uts_academico/features/students/roster_parser.dart';
import 'package:uts_academico/features/students/roster_scan.dart';

void main() {
  group('destinoDeArchivo', () {
    test('CSV, TSV y TXT se leen en el teléfono', () {
      for (final nombre in ['lista.csv', 'LISTA.TSV', 'a.b.txt']) {
        expect(destinoDeArchivo(nombre), DestinoArchivoListado.local);
      }
    });

    test('hoja de cálculo, PDF y fotos van al servidor', () {
      for (final nombre in [
        'lista.xlsx',
        'lista.xls',
        'acta.PDF',
        'foto.jpg',
        'foto.jpeg',
        'captura.png',
        'img.webp',
      ]) {
        expect(destinoDeArchivo(nombre), DestinoArchivoListado.servidor);
      }
    });

    test('lo demás no se sube', () {
      for (final nombre in ['lista.docx', 'foto.heic', 'sin_extension', 'x.']) {
        expect(destinoDeArchivo(nombre), DestinoArchivoListado.noAdmitido);
      }
    });
  });

  test('tipoParaSubir declara el mimetype que acepta el multer de la ruta', () {
    expect(tipoParaSubir('foto.JPG'), 'image/jpeg');
    expect(tipoParaSubir('acta.pdf'), 'application/pdf');
    expect(
      tipoParaSubir('lista.xlsx'),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(tipoParaSubir('lista.csv'), isNull);
  });

  group('PropuestaDeListado', () {
    final propuesta = PropuestaDeListado.fromJson({
      'ok': true,
      'origen': 'ocr',
      'avisos': ['Página 2 borrosa'],
      'filas': [
        {
          'code': '1098765432',
          'fullName': 'ANA MARIA RODRIGUEZ',
          'email': 'ana@uts.edu.co',
          'confianza': 0.95,
          'avisos': <String>[],
        },
        {
          'code': '1098765433',
          'fullName': 'JUAN; PEREZ',
          'program': 'Sistemas',
          'confianza': 0.42,
        },
        {'code': '', 'fullName': '', 'confianza': 'no es número'},
      ],
    });

    test('lee filas, confianza y avisos', () {
      expect(propuesta.origen, 'ocr');
      expect(propuesta.avisos, ['Página 2 borrosa']);
      expect(propuesta.filas, hasLength(3));
      expect(propuesta.filas.first.email, 'ana@uts.edu.co');
      expect(propuesta.filas.first.program, isNull);
    });

    test('baja confianza o sin confianza es dudosa', () {
      expect(propuesta.dudosas.map((f) => f.etiqueta), [
        'JUAN; PEREZ',
        'fila sin datos',
      ]);
    });

    test('comoTexto cae en la misma revisión que la lista pegada', () {
      final texto = propuesta.comoTexto();
      // Un `;` dentro de un nombre no puede abrir otra columna.
      expect(texto.split('\n')[1], '1098765433;JUAN  PEREZ;Sistemas');
      final revision = parseRoster(texto, exigirPrograma: false);
      expect(revision.rows.map((r) => r['code']), [
        '1098765432',
        '1098765433',
      ]);
      expect(revision.rows.first['email'], 'ana@uts.edu.co');
    });

    test('el resumen nombra las dudosas', () {
      expect(propuesta.resumen(), contains('2 dudosas'));
      expect(propuesta.resumen(), contains('JUAN; PEREZ'));
    });

    test('un PDF con texto lo dice; uno vacío pide revisar el archivo', () {
      final conTexto = PropuestaDeListado.fromJson({
        'origen': 'pdf-texto',
        'filas': [
          {'code': '1234567', 'fullName': 'ANA', 'confianza': 1},
        ],
      });
      expect(conTexto.resumen(), contains('traía texto'));
      expect(
        const PropuestaDeListado(origen: 'ocr', avisos: [], filas: []).resumen(),
        contains('No se encontró'),
      );
    });

    test('un cuerpo sin filas no revienta', () {
      final vacia = PropuestaDeListado.fromJson({'ok': true});
      expect(vacia.filas, isEmpty);
      expect(vacia.comoTexto(), '');
    });
  });

  group('mensajeDeFalloDeLectura', () {
    test('sin respuesta dice que leer necesita conexión', () {
      expect(
        mensajeDeFalloDeLectura(
          status: null,
          sinRespuesta: true,
          mensaje: 'No hay conexión con el servidor.',
        ),
        contains('necesita conexión'),
      );
    });

    test('el 503 es el servicio de lectura, no el servidor', () {
      expect(
        mensajeDeFalloDeLectura(
          status: 503,
          sinRespuesta: false,
          mensaje: 'El servidor tuvo un problema. Intenta de nuevo.',
        ),
        contains('servicio de lectura'),
      );
    });

    test('un 400 o un 422 llega con su mensaje', () {
      expect(
        mensajeDeFalloDeLectura(
          status: 422,
          sinRespuesta: false,
          mensaje: 'No se encontró una tabla en la imagen.',
        ),
        'No se encontró una tabla en la imagen.',
      );
    });
  });
}
