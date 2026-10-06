import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../sync/outbox_entry.dart';
import '../sync/outbox_service.dart';
import '../theme/app_theme.dart';
import './compact.dart';
import './ui_kit.dart';

/// Lista de lo que espera salir del teléfono, con su estado y, para lo que el
/// servidor rechazó, el motivo y qué hacer: reintentar o descartar.
///
/// Se abre desde el indicador de conexión de la barra superior
/// (`IndicadorConexion`).
Future<void> mostrarBandejaDeSalida(BuildContext context) {
  return showCompactSheet<void>(
    context: context,
    titulo: 'Cambios sin enviar',
    subtitulo: 'Guardados en este teléfono',
    constructor: (_) => const _ContenidoBandeja(),
  );
}

class _ContenidoBandeja extends ConsumerWidget {
  const _ContenidoBandeja();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final datos =
        ref.watch(outboxProvider).valueOrNull ??
        OutboxService.instance.snapshot;
    final muted = context.palette.muted;

    if (datos.vacia) {
      return const CompactEmpty(
        icono: Icons.cloud_done_outlined,
        mensaje: 'No queda nada por enviar.',
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          datos.sesionPausada
              ? 'La sesión no se pudo confirmar. Se reanuda al volver a iniciar sesión.'
              : 'Se envían solos, en orden, cuando hay conexión con el servidor.',
          style: AppType.caption.copyWith(color: muted),
        ),
        if (datos.fallidas > 0) ...[
          const SizedBox(height: AppSpacing.gapSm),
          Align(
            alignment: Alignment.centerLeft,
            child: OutlinedButton.icon(
              onPressed: OutboxService.instance.reintentarTodo,
              icon: const Icon(Icons.refresh, size: 18),
              label: const Text('Reintentar todo'),
            ),
          ),
        ],
        const SizedBox(height: AppSpacing.gap),
        for (final entrada in datos.entradas) ...[
          _FilaPendiente(entrada: entrada),
          const SizedBox(height: AppSpacing.gapSm),
        ],
      ],
    );
  }
}

class _FilaPendiente extends StatelessWidget {
  final OutboxEntry entrada;
  const _FilaPendiente({required this.entrada});

  Future<void> _descartar(BuildContext context) async {
    final confirmado = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('¿Descartar este cambio?'),
        content: Text(
          '«${entrada.resumen}» no se enviará al servidor y no se puede '
          'recuperar.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: dialogContext.palette.danger.fg,
            ),
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Descartar'),
          ),
        ],
      ),
    );
    if (confirmado == true) {
      await OutboxService.instance.descartar(entrada.id);
    }
  }

  @override
  Widget build(BuildContext context) {
    final muted = context.palette.muted;
    final fallida = entrada.estado == OutboxEstado.fallida;
    final tono = SemanticTone.of(
      context,
      fallida ? SemanticKind.danger : SemanticKind.warning,
    );
    final etiqueta = switch (entrada.estado) {
      OutboxEstado.pendiente => 'Pendiente',
      OutboxEstado.enviando => 'Enviando',
      OutboxEstado.fallida => 'No se envió',
    };
    final motivo = entrada.ultimoError?.mensaje ?? '';

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  entrada.resumen,
                  style: AppType.bodyStrong,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: AppSpacing.gapSm),
              StatusPill(
                etiqueta,
                kind: fallida ? SemanticKind.danger : SemanticKind.warning,
              ),
            ],
          ),
          if (entrada.detalle.isNotEmpty)
            Text(
              entrada.detalle,
              style: AppType.caption.copyWith(color: muted),
            ),
          if (motivo.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                fallida ? motivo : 'Último intento: $motivo',
                style: AppType.caption.copyWith(
                  color: fallida ? tono.fg : muted,
                ),
              ),
            ),
          // `Wrap` y no `Row`: con el texto grande del sistema los dos botones
          // no caben en una línea de 360 dp.
          Align(
            alignment: Alignment.centerRight,
            child: Wrap(
              alignment: WrapAlignment.end,
              children: [
                TextButton(
                  onPressed: entrada.estado == OutboxEstado.enviando
                      ? null
                      : () => _descartar(context),
                  child: const Text('Descartar'),
                ),
                if (fallida)
                  TextButton(
                    onPressed: () =>
                        OutboxService.instance.reintentar(entrada.id),
                    child: const Text('Reintentar'),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
