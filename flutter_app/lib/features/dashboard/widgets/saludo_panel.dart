import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/rubri.dart';

const _dias = [
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
  'domingo',
];
const _meses = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/// «Buenos días», «Buenas tardes» o «Buenas noches» según la hora local.
String saludoSegunHora(DateTime ahora) {
  if (ahora.hour < 12) return 'Buenos días';
  if (ahora.hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

/// «lunes, 21 de septiembre».
String fechaLarga(DateTime fecha) =>
    '${_dias[fecha.weekday - 1]}, ${fecha.day} de ${_meses[fecha.month - 1]}';

/// Cabecera del panel: la fecha, el saludo con el nombre y Rubri.
///
/// Es la misma apertura que tiene el escritorio —fecha en versalitas, saludo
/// grande, una línea de contexto— y no una tarjeta más: va directamente sobre
/// el fondo para que el primer bloque de la pantalla sea una persona saludando
/// y no un recuadro. Rubri va a la derecha, pequeño y flotando; es la única
/// ilustración de la pantalla y por eso se nota.
class SaludoPanel extends StatelessWidget {
  final String nombre;
  final DateTime ahora;

  const SaludoPanel({super.key, required this.nombre, required this.ahora});

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.gap),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  fechaLarga(ahora).toUpperCase(),
                  style: AppType.captionStrong.copyWith(
                    letterSpacing: 0.8,
                    color: palette.muted,
                  ),
                ),
                const SizedBox(height: 4),
                RichText(
                  text: TextSpan(
                    style: AppType.h2.copyWith(
                      color: palette.text,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.6,
                      height: 1.1,
                    ),
                    children: [
                      TextSpan(text: '${saludoSegunHora(ahora)},\n'),
                      TextSpan(
                        text: nombre,
                        style: TextStyle(color: palette.primary),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'Este es el estado de tus grupos.',
                  style: AppType.body.copyWith(color: palette.muted),
                ),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.gapSm),
          const Rubri(emotion: RubriEmotion.happy, size: 84),
        ],
      ),
    );
  }
}

/// Aviso de lo que pide atención hoy: cuántos estudiantes en riesgo, con un
/// toque que lleva a la lista. Solo aparece cuando hay alguien; un aviso
/// permanente que dijera «0 estudiantes» sería ruido en la primera pantalla.
class AvisoDeAtencion extends StatelessWidget {
  final int enRiesgo;
  final VoidCallback onTap;

  const AvisoDeAtencion({
    super.key,
    required this.enRiesgo,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final tono = SemanticTone.of(context, SemanticKind.warning);
    final palette = context.palette;
    final texto = enRiesgo == 1
        ? '1 estudiante necesita seguimiento'
        : '$enRiesgo estudiantes necesitan seguimiento';

    return Semantics(
      button: true,
      label: texto,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.gap,
              vertical: AppSpacing.gapSm + 2,
            ),
            decoration: BoxDecoration(
              color: tono.bg,
              borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
              border: Border.all(color: tono.border),
            ),
            child: Row(
              children: [
                Container(
                  width: 34,
                  height: 34,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: palette.surface.withValues(alpha: 0.7),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    Icons.warning_amber_rounded,
                    size: 18,
                    color: tono.fg,
                  ),
                ),
                const SizedBox(width: AppSpacing.gapSm + 2),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        texto,
                        style: AppType.bodyStrong.copyWith(color: palette.text),
                      ),
                      Text(
                        'Revisa el detalle y decide la intervención',
                        style: AppType.caption.copyWith(color: palette.muted),
                      ),
                    ],
                  ),
                ),
                Icon(Icons.arrow_forward_rounded, size: 18, color: tono.fg),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
