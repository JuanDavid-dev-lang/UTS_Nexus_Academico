import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/data/providers.dart';
import '../../core/network/api_error.dart';
import './data/feedback_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/session_menu.dart';
import '../../core/widgets/ui_kit.dart';

/// Buzón de sugerencias y reportes de error de la plataforma.
///
/// Desde el teléfono se envía y se sigue el estado de lo propio; la revisión
/// completa es tarea del escritorio de la administración.
class FeedbackPage extends ConsumerStatefulWidget {
  const FeedbackPage({super.key});

  @override
  ConsumerState<FeedbackPage> createState() => _FeedbackPageState();
}

class _FeedbackPageState extends ConsumerState<FeedbackPage> {
  final _controller = TextEditingController();
  String _tipo = 'SUGERENCIA';
  bool _enviando = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;
    final enviados = ref.watch(feedbackProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Sugerencias'),
        actions: const [SessionMenuButton()],
      ),
      body: ListView(
        padding: AppSpacing.pagePadding,
        children: [
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Enviar al buzón',
                    style: AppType.bodyStrong
                        .copyWith(fontWeight: FontWeight.w700)),
                const SizedBox(height: 4),
                Text(
                  'Llega a la administración con tu nombre — así se te puede '
                  'responder.',
                  style: AppType.caption.copyWith(color: muted),
                ),
                const SizedBox(height: 14),
                DropdownButtonFormField<String>(
                  initialValue: _tipo,
                  decoration: const InputDecoration(
                    labelText: 'Tipo',
                    isDense: true,
                  ),
                  items: const [
                    DropdownMenuItem(
                        value: 'SUGERENCIA', child: Text('Sugerencia')),
                    DropdownMenuItem(
                        value: 'ERROR', child: Text('Reporte de error')),
                  ],
                  onChanged: (value) =>
                      setState(() => _tipo = value ?? 'SUGERENCIA'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _controller,
                  maxLines: 4,
                  maxLength: 2000,
                  decoration: InputDecoration(
                    labelText: 'Mensaje',
                    hintText: _tipo == 'ERROR'
                        ? 'Qué pantalla, qué hiciste y qué pasó en su lugar.'
                        : 'Qué te facilitaría el trabajo.',
                  ),
                ),
                const SizedBox(height: 6),
                // El botón escucha al controlador en vez de obligar a la
                // página a reconstruirse en cada tecla. Antes, escribir la
                // sugerencia rehacía también la lista de lo ya enviado que
                // hay debajo, carácter a carácter, para decidir si un botón
                // estaba habilitado.
                ValueListenableBuilder<TextEditingValue>(
                  valueListenable: _controller,
                  builder: (_, valor, __) => SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: valor.text.trim().length >= 10 && !_enviando
                          ? _enviar
                          : null,
                      icon: _enviando
                          ? const SizedBox(
                              height: 15,
                              width: 15,
                              child: CircularProgressIndicator(strokeWidth: 2))
                          : const Icon(Icons.send_outlined, size: 18),
                      label: const Text('Enviar'),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          Text('Lo que has enviado',
              style:
                  AppType.bodyStrong.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 10),
          enviados.when(
            loading: () => const SkeletonBox(height: 90, radius: 12),
            error: (error, _) => AppCard(
              child: Text(
                error is ApiError
                    ? error.message
                    : 'No se pudo cargar tu historial.',
                style: AppType.caption.copyWith(color: muted),
              ),
            ),
            data: (items) => items.isEmpty
                ? AppCard(
                    child: Text(
                      'Lo que envíes quedará aquí con su estado de revisión.',
                      style: AppType.caption.copyWith(color: muted),
                    ),
                  )
                : Column(
                    children: [
                      for (final item in items) ...[
                        _FeedbackCard(item: item),
                        const SizedBox(height: 10),
                      ],
                    ],
                  ),
          ),
        ],
      ),
    );
  }

  Future<void> _enviar() async {
    setState(() => _enviando = true);
    try {
      await ref
          .read(feedbackServiceProvider)
          .enviar(tipo: _tipo, mensaje: _controller.text.trim());
      if (!mounted) return;
      _controller.clear();
      ref.invalidate(feedbackProvider);
      AppToast.success(
          context, 'Enviado', 'Gracias: la administración lo revisará.');
    } on ApiError catch (error) {
      if (!mounted) return;
      AppToast.error(context, 'No se pudo enviar', error.message);
    } catch (error) {
      if (!mounted) return;
      AppToast.error(context, 'No se pudo enviar', '$error');
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }
}

class _FeedbackCard extends StatelessWidget {
  final FeedbackApp item;

  const _FeedbackCard({required this.item});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;

    // El estado siempre lleva su palabra: el color solo la acompaña.
    final (kind, texto) = switch (item.estado) {
      'RESUELTO' => (SemanticKind.success, 'Resuelto'),
      'EN_REVISION' => (SemanticKind.warning, 'En revisión'),
      'DESCARTADO' => (SemanticKind.info, 'Descartado'),
      _ => (SemanticKind.info, 'Nuevo'),
    };

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                item.tipo == 'ERROR'
                    ? Icons.bug_report_outlined
                    : Icons.lightbulb_outline,
                size: 16,
                color: muted,
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  item.tipo == 'ERROR' ? 'Reporte de error' : 'Sugerencia',
                  style: AppType.bodyStrong
                      .copyWith(fontWeight: FontWeight.w700),
                ),
              ),
              StatusPill(texto, kind: kind),
            ],
          ),
          const SizedBox(height: 8),
          Text(item.mensaje, style: AppType.body),
          if (item.creadoEn != null) ...[
            const SizedBox(height: 6),
            Text(
              '${item.creadoEn!.day}/${item.creadoEn!.month}/${item.creadoEn!.year}',
              style: AppType.caption.copyWith(color: muted),
            ),
          ],
        ],
      ),
    );
  }
}
