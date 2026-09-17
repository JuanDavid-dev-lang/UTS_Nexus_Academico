/// Aritmética de color para las paletas: hex ↔ HSL y contraste WCAG.
///
/// Todo se redondea a enteros —tono en grados, saturación y luminosidad en
/// porcentaje, canales en 0–255— y no es un capricho: este archivo replica
/// línea por línea `desktop/src/domain/appearance/color.ts`, y con decimales
/// cada lenguaje redondearía distinto y el mismo color propio saldría con
/// otro hex en el escritorio. Las pruebas de los dos clientes fijan las
/// mismas salidas de referencia.
library;

import 'dart:math' as math;

final RegExp _hexPattern = RegExp(r'^#?([0-9a-fA-F]{6})$');

bool esHexValido(String valor) => _hexPattern.hasMatch(valor.trim());

/// `#abc123` o `abc123` → `#ABC123`. Lanza [FormatException] si no es un hex
/// de seis cifras.
String normalizarHex(String valor) {
  final coincidencia = _hexPattern.firstMatch(valor.trim());
  final grupo = coincidencia?.group(1);
  if (grupo == null) throw FormatException('Color no válido: $valor');
  return '#${grupo.toUpperCase()}';
}

/// Canales rojo, verde y azul (0–255) de un hex de seis cifras.
(int, int, int) hexARgb(String hex) {
  final limpio = normalizarHex(hex).substring(1);
  return (
    int.parse(limpio.substring(0, 2), radix: 16),
    int.parse(limpio.substring(2, 4), radix: 16),
    int.parse(limpio.substring(4, 6), radix: 16),
  );
}

num limitar(num valor, num min, num max) => math.max(min, math.min(max, valor));

String rgbAHex(num r, num g, num b) {
  String canal(num valor) =>
      limitar(valor, 0, 255).round().toRadixString(16).padLeft(2, '0');
  return '#${canal(r)}${canal(g)}${canal(b)}'.toUpperCase();
}

/// Tono (grados 0–359), saturación y luminosidad (porcentaje 0–100), siempre
/// enteros: son los que produce [hexAHsl] y los que consume [hslAHex].
class Hsl {
  final int h;
  final int s;
  final int l;

  const Hsl({required this.h, required this.s, required this.l});

  Hsl copyWith({int? h, int? s, int? l}) =>
      Hsl(h: h ?? this.h, s: s ?? this.s, l: l ?? this.l);

  @override
  String toString() => 'Hsl(h: $h, s: $s, l: $l)';
}

Hsl hexAHsl(String hex) {
  final (r0, g0, b0) = hexARgb(hex);
  final r = r0 / 255;
  final g = g0 / 255;
  final b = b0 / 255;
  final maxV = math.max(r, math.max(g, b));
  final minV = math.min(r, math.min(g, b));
  final l = (maxV + minV) / 2;
  final d = maxV - minV;

  var h = 0.0;
  var s = 0.0;
  if (d != 0) {
    s = d / (1 - (2 * l - 1).abs());
    if (maxV == r) {
      h = 60 * (((g - b) / d) % 6);
    } else if (maxV == g) {
      h = 60 * ((b - r) / d + 2);
    } else {
      h = 60 * ((r - g) / d + 4);
    }
  }
  if (h < 0) h += 360;

  return Hsl(h: h.round() % 360, s: (s * 100).round(), l: (l * 100).round());
}

String hslAHex(Hsl hsl) {
  final sat = limitar(hsl.s, 0, 100) / 100;
  final lum = limitar(hsl.l, 0, 100) / 100;
  final c = (1 - (2 * lum - 1).abs()) * sat;
  final hp = (((hsl.h % 360) + 360) % 360) / 60;
  final x = c * (1 - ((hp % 2) - 1).abs());

  List<num> rgb;
  if (hp < 1) {
    rgb = [c, x, 0];
  } else if (hp < 2) {
    rgb = [x, c, 0];
  } else if (hp < 3) {
    rgb = [0, c, x];
  } else if (hp < 4) {
    rgb = [0, x, c];
  } else if (hp < 5) {
    rgb = [x, 0, c];
  } else {
    rgb = [c, 0, x];
  }

  final m = lum - c / 2;
  return rgbAHex((rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255);
}

double _canalLineal(int canal) {
  final c = canal / 255;
  return c <= 0.03928
      ? c / 12.92
      : math.pow((c + 0.055) / 1.055, 2.4).toDouble();
}

double luminanciaRelativa(String hex) {
  final (r, g, b) = hexARgb(hex);
  return 0.2126 * _canalLineal(r) +
      0.7152 * _canalLineal(g) +
      0.0722 * _canalLineal(b);
}

/// Relación de contraste WCAG 2.x, de 1 a 21.
double contraste(String a, String b) {
  final la = luminanciaRelativa(a);
  final lb = luminanciaRelativa(b);
  return (math.max(la, lb) + 0.05) / (math.min(la, lb) + 0.05);
}

/// Mueve la luminosidad de un paso en paso hasta que el color contraste al
/// menos [minimo] contra [fondo]. [direccion] -1 oscurece, +1 aclara. Si ni
/// el negro ni el blanco llegan, devuelve el extremo: es lo más legible que
/// existe.
Hsl ajustarHastaContraste(
  Hsl base,
  String fondo,
  double minimo,
  int direccion,
) {
  assert(direccion == -1 || direccion == 1);
  var actual = base;
  while (contraste(hslAHex(actual), fondo) < minimo) {
    final siguiente = actual.l + direccion;
    if (siguiente < 0 || siguiente > 100) break;
    actual = actual.copyWith(l: siguiente);
  }
  return actual;
}
