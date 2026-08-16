import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/data/providers.dart';
import '../../core/network/api_error.dart';
import '../../core/services/thesis_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/session_menu.dart';
import '../../core/widgets/ui_kit.dart';

/// Formatos oficiales de trabajo de grado, organizados por etapa.
///
/// Solo la ven los docentes directores (el servidor lo exige igualmente). El
/// archivo se descarga autenticado y se pasa a la hoja de compartir, como los
/// reportes: en Android así se mueve un documento.
class ThesisFormatsPage extends ConsumerStatefulWidget {
  const ThesisFormatsPage({super.key});

  @override
  ConsumerState<ThesisFormatsPage> createState() => _ThesisFormatsPageState();
}

class _ThesisFormatsPageState extends ConsumerState<ThesisFormatsPage> {
  String? _etapa;
  String? _descargando;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;
    final formatos = ref.watch(thesisFormatsProvider(_etapa));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Trabajos de grado'),
        actions: const [SessionMenuButton()],
      ),
      body: ListView(
        padding: AppSpacing.pagePadding,
        children: [
          DropdownButtonFormField<String?>(
            initialValue: _etapa,
            decoration: const InputDecoration(labelText: 'Etapa', isDense: true),
            items: [
              const DropdownMenuItem(value: null, child: Text('Todas las etapas')),
              for (final entrada in etapasTrabajoGrado.entries)
                DropdownMenuItem(value: entrada.key, child: Text(entrada.value)),
            ],
            onChanged: (value) => setState(() => _etapa = value),
          ),
          const SizedBox(height: 14),
          formatos.when(
            loading: () => const SkeletonBox(height: 120, radius: 12),
            error: (error, _) => AppCard(
              child: Text(
                error is ApiError
                    ? error.message
                    : 'No se pudieron cargar los formatos.',
                style: AppType.caption.copyWith(color: muted),
              ),
            ),
            data: (items) {
              if (items.isEmpty) {
                return AppCard(
                  child: Text(
                    'La administración aún no ha cargado formatos para este filtro.',
                    style: AppType.caption.copyWith(color: muted),
                  ),
                );
              }

              // Agrupado por etapa: se recorre como se recorre el trabajo.
              final porEtapa = <String, List<FormatoTrabajoGrado>>{};
              for (final formato in items) {
                porEtapa.putIfAbsent(formato.etapa, () => []).add(formato);
              }

              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (final etapa in etapasTrabajoGrado.keys)
                    if (porEtapa.containsKey(etapa)) ...[
                      Text(etapasTrabajoGrado[etapa] ?? etapa,
                          style: AppType.bodyStrong
                              .copyWith(fontWeight: FontWeight.w700)),
                      const SizedBox(height: 8),
                      for (final formato in porEtapa[etapa]!) ...[
                        _FormatoCard(
                          formato: formato,
                          descargando: _descargando == formato.id,
                          onDescargar: () => _descargar(formato),
                        ),
                        const SizedBox(height: 10),
                      ],
                      const SizedBox(height: 8),
                    ],
                ],
              );
            },
          ),
        ],
      ),
    );
  }

  Future<void> _descargar(FormatoTrabajoGrado formato) async {
    setState(() => _descargando = formato.id);
    try {
      final bytes = await ref.read(thesisServiceProvider).descargar(formato.id);
      if (bytes.isEmpty) {
        if (!mounted) return;
        AppToast.error(context, 'El archivo llegó vacío',
            'El servidor no devolvió contenido.');
        return;
      }

      final directory = await getApplicationDocumentsDirectory();
      final file = File('${directory.path}/${formato.nombreArchivo}');
      await file.writeAsBytes(bytes);

      if (!mounted) return;
      await SharePlus.instance.share(
        ShareParams(files: [XFile(file.path)], subject: formato.nombre),
      );
    } on ApiError catch (error) {
      if (!mounted) return;
      AppToast.error(context, 'No se pudo descargar', error.message);
    } catch (error) {
      if (!mounted) return;
      AppToast.error(context, 'No se pudo guardar el archivo', '$error');
    } finally {
      if (mounted) setState(() => _descargando = null);
    }
  }
}

class _FormatoCard extends StatelessWidget {
  final FormatoTrabajoGrado formato;
  final bool descargando;
  final VoidCallback onDescargar;

  const _FormatoCard({
    required this.formato,
    required this.descargando,
    required this.onDescargar,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.description_outlined, size: 16, color: muted),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  formato.nombre,
                  style: AppType.bodyStrong
                      .copyWith(fontWeight: FontWeight.w700),
                ),
              ),
              StatusPill('v${formato.version}'),
            ],
          ),
          if (formato.descripcion.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(formato.descripcion,
                style: AppType.caption.copyWith(color: muted)),
          ],
          if (formato.camposALlenar.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text('QUÉ SE DILIGENCIA',
                style: AppType.caption.copyWith(
                    color: muted, fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            for (final campo in formato.camposALlenar)
              Padding(
                padding: const EdgeInsets.only(bottom: 2),
                child: Text('• $campo', style: AppType.caption),
              ),
          ],
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: descargando ? null : onDescargar,
              icon: descargando
                  ? const SizedBox(
                      height: 15,
                      width: 15,
                      child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.download_outlined, size: 18),
              label: const Text('Descargar'),
            ),
          ),
        ],
      ),
    );
  }
}
