/// Puerto de `desktop/tests/unit/appearance-palettes.test.ts`.
///
/// Fija que el motor de color del móvil reproduce exactamente el del
/// escritorio: mismas salidas de referencia, mismo contraste AA y mismos
/// valores institucionales que ya viven en `AppColors`. Si cambias el
/// generador, estas cifras cambian aquí y en el archivo del escritorio en el
/// mismo commit.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:uts_academico/core/theme/app_theme.dart';
import 'package:uts_academico/core/theme/appearance/color_math.dart';
import 'package:uts_academico/core/theme/appearance/palettes.dart';

const double _aa = 4.5;

void main() {
  group('color', () {
    test('hex → HSL → hex conserva el color salvo redondeo', () {
      for (final hex in [
        '#0B5D3B',
        '#1D4ED8',
        '#6D28D9',
        '#BE185D',
        '#334155',
      ]) {
        final vuelta = hslAHex(hexAHsl(hex));
        expect(contraste(vuelta, hex), lessThan(1.1));
      }
    });

    test('normaliza el hex a mayúsculas con almohadilla', () {
      expect(normalizarHex('abc123'), '#ABC123');
      expect(() => normalizarHex('#12'), throwsFormatException);
    });

    test('calcula el contraste WCAG', () {
      expect(contraste('#000000', '#FFFFFF'), closeTo(21, 1e-5));
      expect(contraste('#FFFFFF', '#FFFFFF'), closeTo(1, 1e-5));
    });
  });

  group('tono institucional', () {
    test('coincide con las constantes de AppColors en claro', () {
      final t = tokensDeTono(Tono.institucional, ModoResuelto.light);
      expect(t.bg, '#F4F6F8');
      expect(t.surface, '#FFFFFF');
      expect(t.text, '#16202B');
      expect(t.textMuted, '#5D6B7A');
      expect(t.primary, '#0B5D3B');
      expect(t.primaryHover, '#0D6E46');
      expect(t.primaryActive, '#08472E');
      expect(t.primarySoft, '#E8F2EC');
      expect(t.accent, '#CAD225');
      expect(t.accentStrong, '#626D0F');
      expect(t.accentSecondary, '#8A9615');
      expect(t.accentSoft, '#F4F7D9');
      expect(colorDeHex(t.primary), AppColors.primary);
      expect(colorDeHex(t.accent), AppColors.lime);
      expect(colorDeHex(t.accentStrong), AppColors.accentStrong);
    });

    test('coincide con las constantes de AppColors en oscuro', () {
      final t = tokensDeTono(Tono.institucional, ModoResuelto.dark);
      expect(t.bg, '#232922');
      expect(t.surface, '#33332A');
      expect(t.text, '#EDEFDD');
      expect(t.textMuted, '#A6AA8A');
      expect(t.primary, '#CAD225');
      expect(t.accentSecondary, '#999E3C');
      expect(colorDeHex(t.bg), AppColors.bgDark);
      expect(colorDeHex(t.surface), AppColors.surfaceDark);
      expect(colorDeHex(t.text), AppColors.textDark);
      expect(colorDeHex(t.primary), AppColors.lime);
    });

    test('normal coincide con los semánticos de AppColors', () {
      final claro = tonosSemanticos(VisionColor.normal, ModoResuelto.light);
      expect(claro.success.fg, '#067647');
      expect(claro.danger.fg, '#D92D20');
      expect(colorDeHex(claro.success.fg), AppColors.success);
      expect(colorDeHex(claro.danger.fg), AppColors.danger);

      final oscuro = tonosSemanticos(VisionColor.normal, ModoResuelto.dark);
      expect(oscuro.success.fg, '#4ADE80');
      expect(colorDeHex(oscuro.success.fg), AppColors.successDark);
    });
  });

  group('tonos generados', () {
    final casosPredefinidos = [
      for (final tono in tonosPredefinidos)
        for (final modo in ModoResuelto.values) (tono, modo, null),
    ];
    final casosPersonalizados = [
      for (final color in [
        '#FFFF00',
        '#00FFFF',
        '#000000',
        '#FFFFFF',
        '#FF0000',
        '#808080',
      ])
        for (final modo in ModoResuelto.values)
          (Tono.personalizado, modo, color),
    ];

    for (final (tono, modo, color) in [
      ...casosPredefinidos,
      ...casosPersonalizados,
    ]) {
      test('$tono en $modo (${color ?? "-"}) pasa AA donde lleva texto', () {
        final t = tokensDeTono(tono, modo, color ?? colorPropioPorDefecto);
        expect(contraste(t.text, t.surface), greaterThanOrEqualTo(7));
        expect(contraste(t.textMuted, t.surfaceAlt), greaterThanOrEqualTo(_aa));
        expect(contraste(t.onPrimary, t.primary), greaterThanOrEqualTo(_aa));
        expect(contraste(t.onAccent, t.accent), greaterThanOrEqualTo(_aa));
        expect(contraste(t.accentStrong, t.surface), greaterThanOrEqualTo(_aa));
        if (modo == ModoResuelto.light) {
          expect(
            contraste(t.onPrimary, t.primaryHover),
            greaterThanOrEqualTo(_aa),
          );
          expect(contraste('#FFFFFF', t.brandStart), greaterThanOrEqualTo(_aa));
        } else {
          expect(
            contraste(t.primary, t.surfaceHover),
            greaterThanOrEqualTo(_aa),
          );
        }
      });
    }

    test('los cinco tonos son distintos entre sí', () {
      for (final modo in ModoResuelto.values) {
        final primarios = tonosPredefinidos
            .map((t) => tokensDeTono(t, modo).primary)
            .toSet();
        expect(primarios.length, tonosPredefinidos.length);
      }
    });

    test('personalizado sin color cae al color por defecto, no revienta', () {
      final sinColor = tokensDeTono(Tono.personalizado, ModoResuelto.light);
      final conDefecto = generarTono(colorPropioPorDefecto, ModoResuelto.light);
      expect(sinColor.primary, conDefecto.primary);
      expect(sinColor.accent, conDefecto.accent);
    });

    test('colorPropioPorDefecto es la semilla del océano', () {
      expect(colorPropioPorDefecto, semillas[Tono.oceano]);
    });

    test('salidas de referencia que el escritorio también fija', () {
      final oceanoClaro = generarTono(
        semillas[Tono.oceano]!,
        ModoResuelto.light,
      );
      final amatistaOscuro = generarTono(
        semillas[Tono.amatista]!,
        ModoResuelto.dark,
      );

      expect(oceanoClaro.primary, '#1842B4');
      expect(oceanoClaro.accent, '#6B8DEB');
      expect(amatistaOscuro.primary, '#AF8AEA');
      expect(amatistaOscuro.surface, '#292136');
      expect(oceanoClaro.bg, '#E9ECF7');
      expect(oceanoClaro.textMuted, '#546083');
      expect(amatistaOscuro.textMuted, '#A59AB6');
    });
  });

  group('visión del color', () {
    Iterable<String> superficies(ModoResuelto modo) sync* {
      for (final tono in tonosPredefinidos) {
        final t = tokensDeTono(tono, modo);
        yield t.surface;
        yield t.surfaceAlt;
      }
      final propio = tokensDeTono(Tono.personalizado, modo, '#FFFF00');
      yield propio.surface;
      yield propio.surfaceAlt;
    }

    final adaptadas = VisionColor.values.where((v) => v != VisionColor.normal);

    for (final vision in adaptadas) {
      for (final modo in ModoResuelto.values) {
        test('$vision en $modo: cada estado se lee sobre su chip y sobre '
            'cualquier superficie', () {
          final tonos = tonosSemanticos(vision, modo);
          for (final estado in [
            tonos.success,
            tonos.warning,
            tonos.danger,
            tonos.info,
          ]) {
            expect(
              contraste(estado.fg, estado.soft),
              greaterThanOrEqualTo(_aa),
            );
            for (final fondo in superficies(modo)) {
              expect(contraste(estado.fg, fondo), greaterThanOrEqualTo(_aa));
            }
          }
        });
      }
    }

    test('protanopía y deuteranopía no usan el verde de éxito ni el rojo de '
        'peligro', () {
      for (final vision in [VisionColor.protanopia, VisionColor.deuteranopia]) {
        final tonos = tonosSemanticos(vision, ModoResuelto.light);
        expect(tonos.success.fg, isNot('#067647'));
        expect(tonos.danger.fg, isNot('#D92D20'));
      }
    });

    test('acromatopsia es la única visión que pide escala de grises', () {
      for (final vision in VisionColor.values) {
        expect(pideEscalaDeGrises(vision), vision == VisionColor.acromatopsia);
      }
    });
  });
}
