import 'package:flutter_test/flutter_test.dart';
import 'package:uts_academico/features/students/roster_parser.dart';

void main() {
  test('lee CSV real con comas entre comillas y correo opcional', () {
    final result = parseRoster(
      'cedula,nombre,correo,programa\n'
      '1098765432,"Pérez, Ana", ANA@UTS.EDU.CO ,Sistemas\n'
      '1098765433,Juan Gómez,,Contaduría',
    );

    expect(result.errors, isEmpty);
    expect(result.rows[0], containsPair('fullName', 'Pérez, Ana'));
    expect(result.rows[0], containsPair('email', 'ana@uts.edu.co'));
    expect(result.rows[1].containsKey('email'), isFalse);
  });

  test(
    'reporta errores por fila y duplicados sin omitirlos silenciosamente',
    () {
      final result = parseRoster(
        '1098765432;Ana Gómez;ana@\n'
        '1098765433;Juan Gómez;Sistemas\n'
        '1098765433;Juan Repetido;Sistemas',
      );

      expect(result.errors.single.line, 1);
      expect(result.errors.single.reason, 'Correo inválido.');
      expect(result.rows, hasLength(1));
      expect(result.duplicates, 1);
    },
  );

  test('tolera texto vacío sin fabricar estudiantes', () {
    final result = parseRoster('  \n');
    expect(result.rows, isEmpty);
    expect(result.errors, isEmpty);
  });

  test('no propone una fila sin programa', () {
    final result = parseRoster('1098765432;Ana Gómez;ana@uts.edu.co');

    expect(result.rows, isEmpty);
    expect(result.errors.single.reason, 'Falta el programa del estudiante.');
  });

  test('al matricular en un grupo basta documento y nombre', () {
    final result = parseRoster(
      '1098765432;Ana Gómez\n1098765433;Juan Pérez;Sistemas',
      exigirPrograma: false,
    );

    expect(result.errors, isEmpty);
    expect(result.rows[0], {'code': '1098765432', 'fullName': 'Ana Gómez'});
    expect(result.rows[1], containsPair('program', 'Sistemas'));
  });

  test('un nombre con números es un error de su línea, no de todo el lote', () {
    // El servidor rechaza el lote entero con un 400 si un nombre lleva un
    // número; aquí se queda en su línea y el resto de la lista sigue.
    final result = parseRoster(
      '1098765432;Ana Gómez 2\n1098765433;Juan Pérez',
      exigirPrograma: false,
    );

    expect(result.rows.single['code'], '1098765433');
    expect(result.errors.single.line, 1);
    expect(result.errors.single.reason, contains('solo letras'));
  });

  test('los signos que el servidor quita no invalidan el nombre', () {
    final result = parseRoster(
      "1098765432;O'Neil Gómez-Pinzón",
      exigirPrograma: false,
    );

    expect(result.errors, isEmpty);
  });
}
