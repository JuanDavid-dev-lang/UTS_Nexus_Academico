import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import '../theme/firma.dart';

/// La firma UTS como widget: guion de marca + punto lima (DESIGN.md §4.1).
///
/// Lee los colores de `context.palette`, así que sigue al tono de Apariencia
/// y al modo. [tallo] la sobrescribe solo sobre la superficie de marca, donde
/// el primario sobre el primario no se vería.
class FirmaUts extends StatelessWidget {
  final double largo;
  final bool vertical;
  final Color? tallo;

  const FirmaUts({
    super.key,
    this.largo = FirmaMedidas.largo,
    this.vertical = false,
    this.tallo,
  });

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final colores = coloresDeFirma(
      isDark: palette.isDark,
      primary: palette.primary,
      accent: palette.accent,
      accentSecondary: palette.accentSecondary,
    );
    final tamano = vertical
        ? Size(FirmaMedidas.grosor, largo)
        : Size(largo, FirmaMedidas.grosor);
    return ExcludeSemantics(
      child: CustomPaint(
        size: tamano,
        painter: _PintorDeFirma(
          tallo: tallo ?? colores.tallo,
          punta: colores.punta,
          largo: largo,
          vertical: vertical,
        ),
      ),
    );
  }
}

class _PintorDeFirma extends CustomPainter {
  final Color tallo;
  final Color punta;
  final double largo;
  final bool vertical;

  const _PintorDeFirma({
    required this.tallo,
    required this.punta,
    required this.largo,
    required this.vertical,
  });

  @override
  void paint(Canvas canvas, Size size) => pintarFirma(
    canvas,
    Offset.zero,
    tallo: tallo,
    punta: punta,
    largo: largo,
    vertical: vertical,
  );

  @override
  bool shouldRepaint(_PintorDeFirma old) =>
      old.tallo != tallo ||
      old.punta != punta ||
      old.largo != largo ||
      old.vertical != vertical;
}
