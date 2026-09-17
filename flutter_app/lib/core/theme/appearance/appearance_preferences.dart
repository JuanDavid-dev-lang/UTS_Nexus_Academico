import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'color_math.dart';
import 'palettes.dart';

/// Grosor de las esquinas de tarjetas, botones, campos y hojas.
///
/// `AppSpacing` sigue fijando los radios base como `static const` —los usan
/// contextos `const` que no pueden depender de una preferencia—: lo que este
/// factor mueve son los componentes que Flutter ya construye a partir de un
/// `ThemeData` (`CardTheme`, `ElevatedButtonTheme`, `InputDecorationTheme`,
/// hojas y diálogos), no las constantes en sí.
enum Esquinas { rectas, suaves, redondeadas }

extension EsquinasFactor on Esquinas {
  double get factor => switch (this) {
    Esquinas.rectas => 0.4,
    Esquinas.suaves => 1.0,
    Esquinas.redondeadas => 1.4,
  };

  String get etiqueta => switch (this) {
    Esquinas.rectas => 'Rectas',
    Esquinas.suaves => 'Suaves',
    Esquinas.redondeadas => 'Redondeadas',
  };
}

/// Tamaño de letra relativo al que ya pide el sistema: los dos se multiplican,
/// nunca se reemplazan uno al otro.
enum TamanoTexto { normal, grande, muyGrande }

extension TamanoTextoFactor on TamanoTexto {
  double get factor => switch (this) {
    TamanoTexto.normal => 1.0,
    TamanoTexto.grande => 1.125,
    TamanoTexto.muyGrande => 1.25,
  };

  String get etiqueta => switch (this) {
    TamanoTexto.normal => 'Normal',
    TamanoTexto.grande => 'Grande',
    TamanoTexto.muyGrande => 'Muy grande',
  };
}

extension VisionColorEtiqueta on VisionColor {
  String get etiqueta => switch (this) {
    VisionColor.normal => 'Normal',
    VisionColor.protanopia => 'Protanopía',
    VisionColor.deuteranopia => 'Deuteranopía',
    VisionColor.tritanopia => 'Tritanopía',
    VisionColor.acromatopsia => 'Acromatopsia',
  };

  String get descripcion => switch (this) {
    VisionColor.normal => 'Los colores de siempre.',
    VisionColor.protanopia =>
      'Dificultad para distinguir el rojo del verde. Los estados usan azul y naranja.',
    VisionColor.deuteranopia =>
      'La forma más común de daltonismo. Los estados usan azul y naranja.',
    VisionColor.tritanopia =>
      'Dificultad para distinguir el azul del amarillo. Los estados usan verde azulado y rojo.',
    VisionColor.acromatopsia =>
      'Sin percepción del color. La interfaz pasa a escala de grises y los estados se separan por contraste.',
  };
}

extension TonoEtiqueta on Tono {
  String get etiqueta => switch (this) {
    Tono.institucional => 'Institucional',
    Tono.oceano => 'Océano',
    Tono.amatista => 'Amatista',
    Tono.orquidea => 'Orquídea',
    Tono.grafito => 'Grafito',
    Tono.personalizado => 'Color propio',
  };

  String get descripcion => switch (this) {
    Tono.institucional => 'Verde UTS y lima',
    Tono.oceano => 'Azul profundo',
    Tono.amatista => 'Violeta',
    Tono.orquidea => 'Magenta',
    Tono.grafito => 'Gris pizarra',
    Tono.personalizado => 'El que tú elijas',
  };
}

/// Preferencias de apariencia que no son el modo claro/oscuro/sistema: ese
/// sigue viviendo en `ThemeModeController` (`theme_mode` en disco), sin
/// tocar, para no romper lo que ya depende de él. Esto cubre los cuatro ejes
/// nuevos: tono de interfaz, color propio, visión del color y estilo.
@immutable
class AparienciaPreferencias {
  final Tono tono;
  final String colorPropio;
  final VisionColor vision;
  final Esquinas esquinas;
  final TamanoTexto tamanoTexto;
  final bool reducirMovimiento;

  const AparienciaPreferencias({
    this.tono = Tono.institucional,
    this.colorPropio = colorPropioPorDefecto,
    this.vision = VisionColor.normal,
    this.esquinas = Esquinas.suaves,
    this.tamanoTexto = TamanoTexto.normal,
    this.reducirMovimiento = false,
  });

  static const defecto = AparienciaPreferencias();

  AparienciaPreferencias copyWith({
    Tono? tono,
    String? colorPropio,
    VisionColor? vision,
    Esquinas? esquinas,
    TamanoTexto? tamanoTexto,
    bool? reducirMovimiento,
  }) => AparienciaPreferencias(
    tono: tono ?? this.tono,
    colorPropio: colorPropio ?? this.colorPropio,
    vision: vision ?? this.vision,
    esquinas: esquinas ?? this.esquinas,
    tamanoTexto: tamanoTexto ?? this.tamanoTexto,
    reducirMovimiento: reducirMovimiento ?? this.reducirMovimiento,
  );

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is AparienciaPreferencias &&
          tono == other.tono &&
          colorPropio == other.colorPropio &&
          vision == other.vision &&
          esquinas == other.esquinas &&
          tamanoTexto == other.tamanoTexto &&
          reducirMovimiento == other.reducirMovimiento;

  @override
  int get hashCode => Object.hash(
    tono,
    colorPropio,
    vision,
    esquinas,
    tamanoTexto,
    reducirMovimiento,
  );
}

Tono _tonoDesdeTexto(String? valor) => Tono.values.firstWhere(
  (t) => t.name == valor,
  orElse: () => Tono.institucional,
);

VisionColor _visionDesdeTexto(String? valor) => VisionColor.values.firstWhere(
  (v) => v.name == valor,
  orElse: () => VisionColor.normal,
);

Esquinas _esquinasDesdeTexto(String? valor) => Esquinas.values.firstWhere(
  (e) => e.name == valor,
  orElse: () => Esquinas.suaves,
);

TamanoTexto _tamanoDesdeTexto(String? valor) => TamanoTexto.values.firstWhere(
  (t) => t.name == valor,
  orElse: () => TamanoTexto.normal,
);

String _colorPropioDesdeTexto(String? valor) {
  if (valor == null || !esHexValido(valor)) return colorPropioPorDefecto;
  return normalizarHex(valor);
}

/// Persiste y expone las preferencias de apariencia (sin el modo de tema).
class AparienciaController extends StateNotifier<AparienciaPreferencias> {
  AparienciaController(super.inicial);

  static const _claveTono = 'apariencia_tono';
  static const _claveColorPropio = 'apariencia_color_propio';
  static const _claveVision = 'apariencia_vision';
  static const _claveEsquinas = 'apariencia_esquinas';
  static const _claveTamanoTexto = 'apariencia_tamano_texto';
  static const _claveReducirMovimiento = 'apariencia_reducir_movimiento';

  /// Lee lo guardado. Se llama desde `main()` **antes** de `runApp`, igual
  /// que [ThemeModeController.cargarInicial]: leerlo después dejaría el
  /// primer fotograma con el tono institucional y lo cambiaría a continuación.
  static Future<AparienciaPreferencias> cargarInicial() async {
    final prefs = await SharedPreferences.getInstance();
    return AparienciaPreferencias(
      tono: _tonoDesdeTexto(prefs.getString(_claveTono)),
      colorPropio: _colorPropioDesdeTexto(prefs.getString(_claveColorPropio)),
      vision: _visionDesdeTexto(prefs.getString(_claveVision)),
      esquinas: _esquinasDesdeTexto(prefs.getString(_claveEsquinas)),
      tamanoTexto: _tamanoDesdeTexto(prefs.getString(_claveTamanoTexto)),
      reducirMovimiento: prefs.getBool(_claveReducirMovimiento) ?? false,
    );
  }

  Future<void> setTono(Tono tono) async {
    if (tono == state.tono) return;
    state = state.copyWith(tono: tono);
    await _guardarTexto(_claveTono, tono.name);
  }

  /// Ignora un hex inválido en vez de guardar algo que luego no se puede
  /// releer: `esHexValido` es la misma comprobación que usa el campo de
  /// texto, así que llegar aquí con algo corrupto sería un error del llamador.
  Future<void> setColorPropio(String hex) async {
    if (!esHexValido(hex)) return;
    final normalizado = normalizarHex(hex);
    if (normalizado == state.colorPropio) return;
    state = state.copyWith(colorPropio: normalizado);
    await _guardarTexto(_claveColorPropio, normalizado);
  }

  Future<void> setVision(VisionColor vision) async {
    if (vision == state.vision) return;
    state = state.copyWith(vision: vision);
    await _guardarTexto(_claveVision, vision.name);
  }

  Future<void> setEsquinas(Esquinas esquinas) async {
    if (esquinas == state.esquinas) return;
    state = state.copyWith(esquinas: esquinas);
    await _guardarTexto(_claveEsquinas, esquinas.name);
  }

  Future<void> setTamanoTexto(TamanoTexto tamano) async {
    if (tamano == state.tamanoTexto) return;
    state = state.copyWith(tamanoTexto: tamano);
    await _guardarTexto(_claveTamanoTexto, tamano.name);
  }

  Future<void> setReducirMovimiento(bool valor) async {
    if (valor == state.reducirMovimiento) return;
    state = state.copyWith(reducirMovimiento: valor);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_claveReducirMovimiento, valor);
  }

  /// Vuelve a los valores de fábrica. No toca `theme_mode`: seguir al sistema
  /// o quedarse en oscuro es una decisión aparte.
  Future<void> restablecer() async {
    state = AparienciaPreferencias.defecto;
    final prefs = await SharedPreferences.getInstance();
    await Future.wait([
      prefs.remove(_claveTono),
      prefs.remove(_claveColorPropio),
      prefs.remove(_claveVision),
      prefs.remove(_claveEsquinas),
      prefs.remove(_claveTamanoTexto),
      prefs.remove(_claveReducirMovimiento),
    ]);
  }

  Future<void> _guardarTexto(String clave, String valor) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(clave, valor);
  }
}

/// Preferencias de apariencia activas. Lo inicializa `main()` con lo que
/// había en disco, igual que `themeModeProvider`.
final aparienciaProvider =
    StateNotifierProvider<AparienciaController, AparienciaPreferencias>((ref) {
      throw UnimplementedError('aparienciaProvider se sobrescribe en main()');
    });
