import 'package:flutter_test/flutter_test.dart';
import 'package:uts_academico/core/data/models.dart';
import 'package:uts_academico/features/attendance/excusa_sheet.dart';

void main() {
  group('excusa de una falta', () {
    test('nombra el motivo guardado', () {
      expect(
        etiquetaDeExcusa({
          'present': false,
          'excusa': {'motivo': 'MEDICA', 'detalle': ''},
        }),
        'Incapacidad médica',
      );
    });

    test('sin excusa no hay etiqueta', () {
      expect(etiquetaDeExcusa({'present': false, 'excusa': null}), isNull);
      expect(etiquetaDeExcusa({'present': false}), isNull);
    });
  });

  group('alerta temprana por corte', () {
    test('el corte bajo va primero en los motivos', () {
      final item = RiskItem.fromJson({
        'studentId': 'e1',
        'code': '1098',
        'fullName': 'ANA',
        'subjectId': 'm1',
        'level': 'LOW',
        'motivos': ['3 clases perdidas.'],
        'cortesBajos': [
          {'corte': 1, 'nota': 2.6},
        ],
      });
      expect(item.cortesBajos.single.corte, 1);
      expect(item.reasons.first, contains('Corte 1 en 2.6'));
      expect(item.reasons, hasLength(2));
    });
  });

  group('enlaces de notificación', () {
    test('las rutas del escritorio se traducen a las del móvil', () {
      expect(rutaMovilDe('/riesgo?buscar=1098'), '/');
      expect(rutaMovilDe('/estudiantes?buscar=1098'), '/students');
    });

    test('una ruta del móvil pasa igual', () {
      expect(
        rutaMovilDe('/agenda?item=class:x:2026-10-27'),
        '/agenda?item=class:x:2026-10-27',
      );
    });
  });
}
