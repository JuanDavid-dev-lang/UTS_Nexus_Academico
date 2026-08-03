import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_error.dart';
import '../../core/services/avisos_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/ui_kit.dart';

final avisosProvider = FutureProvider<ListadoAvisos>((ref) {
  return AvisosService().listar();
});

/// Avisos de la institución.
///
/// El docente solo lee. Abrir uno lo marca como leído, pero no lo oculta: un
/// cambio de fechas de entrega hay que poder consultarlo dos semanas después.
class AnnouncementsPage extends ConsumerWidget {
  const AnnouncementsPage({super.key});

  static SemanticKind _kind(String tipo) => switch (tipo) {
        'URGENTE' => SemanticKind.danger,
        'IMPORTANTE' => SemanticKind.warning,
        _ => SemanticKind.info,
      };

  static String _etiqueta(String tipo) => switch (tipo) {
        'URGENTE' => 'Urgente',
        'IMPORTANTE' => 'Importante',
        _ => 'Informativo',
      };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final avisos = ref.watch(avisosProvider);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;

    return Scaffold(
      appBar: AppBar(title: const Text('Avisos')),
      body: avisos.when(
        loading: () => ListView(
          padding: AppSpacing.pagePadding,
          children: List.generate(
            5,
            (_) => const Padding(
              padding: EdgeInsets.only(bottom: 10),
              child: SkeletonBox(height: 88, radius: 18),
            ),
          ),
        ),
        error: (error, _) => StateView.error(
          ApiError.from(error).message,
          action: FilledButton(
            onPressed: () => ref.invalidate(avisosProvider),
            child: const Text('Reintentar'),
          ),
        ),
        data: (listado) {
          if (listado.items.isEmpty) {
            return StateView.empty(
              'Cuando la administración publique un aviso, aparecerá aquí.',
            );
          }

          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(avisosProvider),
            child: ListView(
              padding: AppSpacing.pagePadding,
              children: [
                if (listado.sinLeer > 0) ...[
                  StatusPill('${listado.sinLeer} sin leer', kind: SemanticKind.info),
                  const SizedBox(height: 12),
                ],
                for (final aviso in listado.items)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: _Tarjeta(aviso: aviso, muted: muted, ref: ref),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _Tarjeta extends StatefulWidget {
  final Aviso aviso;
  final Color muted;
  final WidgetRef ref;

  const _Tarjeta({required this.aviso, required this.muted, required this.ref});

  @override
  State<_Tarjeta> createState() => _TarjetaState();
}

class _TarjetaState extends State<_Tarjeta> {
  bool _abierto = false;

  Future<void> _alternar() async {
    setState(() => _abierto = !_abierto);
    if (_abierto && !widget.aviso.leido) {
      // Optimista: la marca se aplica en pantalla sin esperar al servidor. Si
      // la petición falla, el aviso sigue ahí y se volverá a marcar al abrirlo.
      setState(() => widget.aviso.leido = true);
      try {
        await AvisosService().marcarLeido(widget.aviso.id);
        widget.ref.invalidate(avisosProvider);
      } catch (_) {
        /* Marcar como leído no es crítico: no vale interrumpir por ello. */
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final a = widget.aviso;
    final fecha = a.publicadoEn;

    return AppCard(
      child: InkWell(
        onTap: _alternar,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                if (a.fijado) ...[
                  Icon(Icons.push_pin_outlined, size: 16, color: widget.muted),
                  const SizedBox(width: 6),
                ],
                Expanded(
                  child: Text(a.titulo,
                      style: AppType.body.copyWith(fontWeight: FontWeight.w700)),
                ),
                if (!a.leido)
                  Container(
                    width: 9,
                    height: 9,
                    decoration: BoxDecoration(
                      color: SemanticTone.of(context, SemanticKind.info).fg,
                      shape: BoxShape.circle,
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 6),
            Row(
              children: [
                StatusPill(AnnouncementsPage._etiqueta(a.tipo),
                    kind: AnnouncementsPage._kind(a.tipo)),
                const SizedBox(width: 8),
                if (fecha != null)
                  Text('${fecha.day}/${fecha.month}/${fecha.year}',
                      style: AppType.caption.copyWith(color: widget.muted)),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              a.cuerpo,
              style: AppType.caption.copyWith(color: widget.muted),
              maxLines: _abierto ? null : 2,
              overflow: _abierto ? null : TextOverflow.ellipsis,
            ),
            if (_abierto && a.autor.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text('Publicado por ${a.autor}',
                  style: AppType.caption.copyWith(color: widget.muted)),
            ],
          ],
        ),
      ),
    );
  }
}
