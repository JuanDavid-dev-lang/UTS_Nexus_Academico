/// Enlaces desde los widgets de la pantalla de inicio. Función pura: fija que
/// una URI que no case con la lista blanca no abre ninguna pantalla, igual que
/// el payload de una notificación local (`_rutaDeCarga`) no puede sacar al
/// docente hacia una dirección arbitraria.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:uts_academico/core/home_widget/home_widget_links.dart';

void main() {
  group('rutaDesdeUriWidget', () {
    test('resuelve cada destino permitido', () {
      expect(rutaDesdeUriWidget(Uri.parse('utsnexus://abrir/grades')), '/grades');
      expect(rutaDesdeUriWidget(Uri.parse('utsnexus://abrir/attendance')), '/attendance');
      expect(rutaDesdeUriWidget(Uri.parse('utsnexus://abrir/agenda')), '/agenda');
      expect(rutaDesdeUriWidget(Uri.parse('utsnexus://abrir/subjects')), '/subjects');
    });

    test('null sin URI', () {
      expect(rutaDesdeUriWidget(null), isNull);
    });

    test('null con un esquema distinto', () {
      expect(rutaDesdeUriWidget(Uri.parse('https://abrir/grades')), isNull);
    });

    test('null con un anfitrión distinto de "abrir"', () {
      expect(rutaDesdeUriWidget(Uri.parse('utsnexus://otro/grades')), isNull);
    });

    test('null con un segmento fuera de la lista blanca', () {
      expect(rutaDesdeUriWidget(Uri.parse('utsnexus://abrir/settings')), isNull);
      expect(rutaDesdeUriWidget(Uri.parse('utsnexus://abrir/admin-supervision')), isNull);
    });

    test('null con más de un segmento de ruta', () {
      expect(rutaDesdeUriWidget(Uri.parse('utsnexus://abrir/grades/extra')), isNull);
    });

    test('null sin ningún segmento', () {
      expect(rutaDesdeUriWidget(Uri.parse('utsnexus://abrir/')), isNull);
      expect(rutaDesdeUriWidget(Uri.parse('utsnexus://abrir')), isNull);
    });
  });
}
