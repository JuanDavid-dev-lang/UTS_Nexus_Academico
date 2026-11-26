import 'package:flutter/material.dart';

/// Firma UTS: un guion en el color de marca seguido de un punto lima,
/// separados por un hueco (DESIGN.md §4.1).
///
/// Es el único detalle decorativo propio de la aplicación. Los números son
/// los mismos del escritorio (`--firma-*` en `desktop/src/styles/tokens.css`):
/// si cambian en uno, cambian en el otro en el mismo commit.
///
/// Es decoración: nunca lleva por sí sola un significado. En la barra
/// inferior el destino activo ya lo dicen la píldora y el color del texto.
abstract final class FirmaMedidas {
  static const double largo = 28;
  static const double grosor = 3;
  static const double punta = 6;
  static const double hueco = 3;
}

/// Colores de la firma para un tema: el guion es el primario en claro y la
/// lima apagada en oscuro (donde el primario ya es lima); el punto, la lima.
({Color tallo, Color punta}) coloresDeFirma({
  required bool isDark,
  required Color primary,
  required Color accent,
  required Color accentSecondary,
}) => (tallo: isDark ? accentSecondary : primary, punta: accent);

/// Pinta la firma con su esquina superior izquierda en [origen].
///
/// [vertical] la gira: el punto queda abajo. Dos tramos planos con extremos
/// redondeados; nada de degradados ni sombras.
void pintarFirma(
  Canvas canvas,
  Offset origen, {
  required Color tallo,
  required Color punta,
  double largo = FirmaMedidas.largo,
  double grosor = FirmaMedidas.grosor,
  double largoPunta = FirmaMedidas.punta,
  double hueco = FirmaMedidas.hueco,
  bool vertical = false,
}) {
  final radio = Radius.circular(grosor / 2);
  final largoTallo = largo - largoPunta - hueco;
  Rect tramo(double desde, double cuanto) => vertical
      ? Rect.fromLTWH(origen.dx, origen.dy + desde, grosor, cuanto)
      : Rect.fromLTWH(origen.dx + desde, origen.dy, cuanto, grosor);

  canvas.drawRRect(
    RRect.fromRectAndRadius(tramo(0, largoTallo), radio),
    Paint()..color = tallo,
  );
  canvas.drawRRect(
    RRect.fromRectAndRadius(tramo(largoTallo + hueco, largoPunta), radio),
    Paint()..color = punta,
  );
}

/// Indicador de la barra inferior con la firma bajo el icono activo.
///
/// Es la píldora de siempre (`RoundedRectangleBorder`) y, encima de su
/// relleno, la firma centrada junto al borde inferior: el mismo marcador de
/// sección que el menú lateral del escritorio.
class IndicadorConFirma extends RoundedRectangleBorder {
  final Color tallo;
  final Color punta;

  const IndicadorConFirma({
    super.borderRadius,
    required this.tallo,
    required this.punta,
  });

  /// Más corta que la de un título: el indicador mide unos 64 dp.
  static const double largo = 18;

  @override
  void paint(Canvas canvas, Rect rect, {TextDirection? textDirection}) {
    super.paint(canvas, rect, textDirection: textDirection);
    // La píldora crece desde el centro al seleccionar: la firma solo aparece
    // cuando ya cabe, para no salirse mientras se anima.
    if (rect.width < largo + 8 || rect.height < 12) return;
    pintarFirma(
      canvas,
      Offset(rect.center.dx - largo / 2, rect.bottom - FirmaMedidas.grosor - 3),
      tallo: tallo,
      punta: punta,
      largo: largo,
      largoPunta: 5,
      hueco: 2,
    );
  }

  @override
  IndicadorConFirma copyWith({
    BorderSide? side,
    BorderRadiusGeometry? borderRadius,
  }) => IndicadorConFirma(
    borderRadius: borderRadius ?? this.borderRadius,
    tallo: tallo,
    punta: punta,
  );

  @override
  ShapeBorder scale(double t) => IndicadorConFirma(
    borderRadius: borderRadius * t,
    tallo: tallo,
    punta: punta,
  );

  @override
  ShapeBorder? lerpFrom(ShapeBorder? a, double t) =>
      a is IndicadorConFirma ? (t < 0.5 ? a : this) : super.lerpFrom(a, t);

  @override
  ShapeBorder? lerpTo(ShapeBorder? b, double t) =>
      b is IndicadorConFirma ? (t < 0.5 ? this : b) : super.lerpTo(b, t);

  @override
  bool operator ==(Object other) =>
      other is IndicadorConFirma &&
      other.borderRadius == borderRadius &&
      other.tallo == tallo &&
      other.punta == punta;

  @override
  int get hashCode => Object.hash(borderRadius, tallo, punta);
}
