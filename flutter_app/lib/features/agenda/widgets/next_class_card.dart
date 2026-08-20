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

/// La clase en curso o la siguiente, sobre la superficie de marca.
///
/// Es la única tarjeta de la aplicación que va en degradado institucional, y
/// eso es deliberado: DESIGN.md reserva la superficie de marca para lo que
/// representa a la aplicación, y en un panel docente eso es exactamente esto —
/// la respuesta a «¿qué tengo ahora?», que es la razón por la que alguien saca
/// el teléfono entre dos clases. Como tarjeta blanca igual que las otras seis
/// de la pantalla, había que buscarla; en degradado es lo primero que se ve y
/// no hace falta leer nada para encontrarla.
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
    // Sobre el degradado no valen los tonos del tema: el texto es blanco (u
    // oliva claro en oscuro) y los secundarios son ese mismo color rebajado,
    // que es lo único que conserva el contraste sobre un fondo que cambia de
    // luminosidad a lo largo de la tarjeta.
    final frente = isDark ? AppColors.textDark : Colors.white;
    final tenue = frente.withValues(alpha: 0.72);

    return BrandSurface(
      onTap: onVerAgenda,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              // La lima marca «esto está pasando ahora». Es el uso puntual que
              // DESIGN.md §4 permite: un indicador, no un fondo.
              if (enCurso)
                Container(
                  width: 8,
                  height: 8,
                  decoration: const BoxDecoration(
                    color: AppColors.lime,
                    shape: BoxShape.circle,
                  ),
                )
              else
                Icon(Icons.schedule_outlined, size: 15, color: tenue),
              const SizedBox(width: AppSpacing.gapSm),
              Text(
                enCurso ? 'CLASE EN CURSO' : 'PRÓXIMA CLASE',
                style: AppType.captionStrong.copyWith(
                  color: enCurso ? AppColors.lime : tenue,
                  letterSpacing: 1,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const Spacer(),
              if (onVerAgenda != null)
                Icon(Icons.arrow_forward, size: 16, color: tenue),
            ],
          ),
          const SizedBox(height: AppSpacing.gap),
          Text(
            item.titulo.isNotEmpty ? item.titulo : item.materia,
            style: AppType.h3.copyWith(color: frente),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: AppSpacing.gapSm),
          Row(
            children: [
              Icon(Icons.access_time_rounded, size: 15, color: tenue),
              const SizedBox(width: AppSpacing.gapXs + 2),
              Text(
                '${horaCampus(item.inicio, offset)} – ${horaCampus(item.fin, offset)}',
                style: AppType.bodyStrong.copyWith(
                  color: frente,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ],
          ),
          if (item.aula.isNotEmpty || item.grupo.isNotEmpty || item.docente.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.gapXs),
            Row(
              children: [
                Icon(Icons.place_outlined, size: 15, color: tenue),
                const SizedBox(width: AppSpacing.gapXs + 2),
                Expanded(
                  child: Text(
                    [
                      if (item.aula.isNotEmpty) 'Aula ${item.aula}',
                      if (item.grupo.isNotEmpty) 'Grupo ${item.grupo}',
                      if (item.docente.isNotEmpty) item.docente,
                    ].join(' · '),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppType.caption.copyWith(color: tenue),
                  ),
                ),
              ],
            ),
          ],
          const SizedBox(height: AppSpacing.gap),
          // El contador va en una píldora translúcida y no en un color
          // semántico: sobre el degradado, un fondo verde o rojo del tema se
          // convierte en una mancha de color sobre otra mancha de color.
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: frente.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(AppSpacing.radiusPill),
              border: Border.all(color: frente.withValues(alpha: 0.22)),
            ),
            child: Text(
              detalle,
              style: AppType.captionStrong.copyWith(color: frente),
            ),
          ),
        ],
      ),
    );
  }
}
