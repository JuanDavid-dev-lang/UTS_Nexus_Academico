import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:uts_academico/core/theme/firma.dart';

void main() {
  group('coloresDeFirma', () {
    const primario = Color(0xFF0B5D3B);
    const lima = Color(0xFFCAD225);
    const limaApagada = Color(0xFF999E3C);

    test('en claro el guion es el primario y el punto la lima', () {
      final c = coloresDeFirma(
        isDark: false,
        primary: primario,
        accent: lima,
        accentSecondary: limaApagada,
      );
      expect(c.tallo, primario);
      expect(c.punta, lima);
    });

    test('en oscuro el guion no repite la lima del punto', () {
      // El primario en oscuro ES la lima: sin esto la firma sería un solo
      // tramo y dejaría de leerse como guion y punto.
      final c = coloresDeFirma(
        isDark: true,
        primary: lima,
        accent: lima,
        accentSecondary: limaApagada,
      );
      expect(c.tallo, limaApagada);
      expect(c.tallo, isNot(c.punta));
    });
  });

  test('el indicador conserva sus colores al copiarse y escalarse', () {
    // NavigationBar copia y escala la forma del tema; si perdiera los colores
    // la firma desaparecería de la barra sin ningún error.
    const forma = IndicadorConFirma(
      borderRadius: BorderRadius.all(Radius.circular(8)),
      tallo: Colors.green,
      punta: Colors.lime,
    );
    final copia = forma.copyWith(borderRadius: BorderRadius.circular(4));
    expect(copia, isA<IndicadorConFirma>());
    expect(copia.tallo, Colors.green);
    expect(forma.scale(2), isA<IndicadorConFirma>());
  });
}
