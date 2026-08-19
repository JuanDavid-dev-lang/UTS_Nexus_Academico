import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/campus_time.dart';
import '../../../core/data/providers.dart';
import '../data/agenda_models.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/ui_kit.dart';

/// Clase actual y próxima, con contador.
///
/// El contador se recalcula con el reloj del teléfono a partir de la hora que
/// dio el servidor. Refrescar la consulta cada minuto solo para restar sería
/// una petición por minuto y batería tirada; la hora de la clase, en cambio,
/// nunca sale del teléfono.
class NextClassCard extends ConsumerStatefulWidget {
  /// `true` en el panel: solo la información imprescindible.
  final bool compacto;
  final VoidCallback? onVerAgenda;

  const NextClassCard({super.key, this.compacto = false, this.onVerAgenda});

  @override
  ConsumerState<NextClassCard> createState() => _NextClassCardState();
}

class _NextClassCardState extends ConsumerState<NextClassCard> {
  Timer? _reloj;
  DateTime _ahora = DateTime.now().toUtc();

  @override
  void initState() {
    super.initState();
    // Cada 30 s: suficiente para que "en 25 minutos" no se quede obsoleto y lo
    // bastante espaciado para no despertar la pantalla sin motivo.
    _reloj = Timer.periodic(const Duration(seconds: 30), (_) {
      if (mounted) setState(() => _ahora = DateTime.now().toUtc());
    });
  }

  @override
  void dispose() {
    _reloj?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final resumen = ref.watch(agendaResumenProvider);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    // El gris canónico está calibrado para texto sobre blanco; en oscuro hay
    // que aclararlo o cae por debajo del contraste que exige DESIGN.md.
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;

    return resumen.when(
      loading: () => const AppCard(child: SkeletonBox(height: 84)),
      error: (_, __) => AppCard(
        child: Row(
          children: [
            const Icon(Icons.event_busy_outlined, size: 18),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                'No se pudo consultar tu próxima clase.',
                style: AppType.body.copyWith(color: muted),
              ),
            ),
          ],
        ),
      ),
      data: (datos) {
        final offset = datos.offsetCampusMinutos;
        final enCurso = datos.enCurso;
        final proxima = datos.proxima;

        if (enCurso == null && proxima == null) {
          return AppCard(
            child: Row(
              children: [
                const Icon(Icons.event_available_outlined, size: 18),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'No tienes clases programadas en los próximos días.',
                    style: AppType.body,
                  ),
                ),
              ],
            ),
          );
        }

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (enCurso != null)
              _Bloque(
                item: enCurso,
                offset: offset,
                enCurso: true,
                detalle:
                    'Termina en ${tiempoRestante(minutosHasta(enCurso.fin, _ahora).clamp(0, 100000))}',
                onVerAgenda: widget.onVerAgenda,
              ),
            if (enCurso != null && proxima != null && !widget.compacto)
              const SizedBox(height: AppSpacing.gap),
            if (proxima != null && (!widget.compacto || enCurso == null))
              _Bloque(
                item: proxima,
                offset: offset,
                enCurso: false,
                detalle: minutosHasta(proxima.inicio, _ahora) <= 0
                    ? 'Comienza ahora'
                    : 'Comienza en ${tiempoRestante(minutosHasta(proxima.inicio, _ahora))}',
                onVerAgenda: widget.onVerAgenda,
              ),
          ],
        );
      },
    );
  }
}

class _Bloque extends StatelessWidget {
  final AgendaItem item;
  final int offset;
  final bool enCurso;
  final String detalle;
  final VoidCallback? onVerAgenda;

  const _Bloque({
    required this.item,
    required this.offset,
    required this.enCurso,
    required this.detalle,
    this.onVerAgenda,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;
    // Se declara el significado y el tema resuelve el par (texto, fondo): pasar
    // un color suelto rompería el modo oscuro.
    final tono = SemanticTone.of(context, enCurso ? SemanticKind.danger : SemanticKind.brand);

    return AppCard(
      onTap: onVerAgenda,
      child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  enCurso ? Icons.radio_button_checked : Icons.schedule_outlined,
                  size: 16,
                  color: tono.fg,
                ),
                const SizedBox(width: 6),
                Text(
                  enCurso ? 'CLASE EN CURSO' : 'PRÓXIMA CLASE',
                  style: AppType.captionStrong.copyWith(
                    color: tono.fg,
                    letterSpacing: 0.8,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              item.titulo.isNotEmpty ? item.titulo : item.materia,
              style: AppType.h3,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 2),
            Text(
              '${horaCampus(item.inicio, offset)} - ${horaCampus(item.fin, offset)}',
              style: AppType.body,
            ),
            if (item.aula.isNotEmpty || item.grupo.isNotEmpty) ...[
              const SizedBox(height: 2),
              Text(
                [
                  if (item.aula.isNotEmpty) 'Aula ${item.aula}',
                  if (item.grupo.isNotEmpty) 'Grupo ${item.grupo}',
                  if (item.docente.isNotEmpty) item.docente,
                ].join(' · '),
                style: AppType.caption.copyWith(color: muted),
              ),
            ],
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: tono.bg,
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                detalle,
                style: AppType.captionStrong.copyWith(color: tono.fg),
              ),
            ),
        ],
      ),
    );
  }
}
