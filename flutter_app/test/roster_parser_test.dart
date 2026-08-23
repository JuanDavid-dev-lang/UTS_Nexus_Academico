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
}
