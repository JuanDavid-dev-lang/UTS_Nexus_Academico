import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/data/models.dart';
import '../../core/data/providers.dart';
import '../../core/network/api_error.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/period_selector.dart';
import '../../core/widgets/ui_kit.dart';

/// Exportación de reportes.
///
/// En un teléfono no existe "la carpeta de descargas" como en un PC: el archivo
/// se guarda en el almacenamiento de la app y se abre la hoja de compartir, que
/// es como se mueve un documento en Android — a Drive, WhatsApp o correo.
class ReportsPage extends ConsumerStatefulWidget {
  const ReportsPage({super.key});

  @override
  ConsumerState<ReportsPage> createState() => _ReportsPageState();
}

class _ReportsPageState extends ConsumerState<ReportsPage> {
  String? _subjectId;

  /// Clave del reporte en curso, para deshabilitar solo ese botón.
  String? _busy;

  static const _reports = <({String kind, String title, String description})>[
    (
      kind: 'consolidado',
      title: 'Consolidado académico',
      description:
          'Nota final por estudiante con el desglose de los tres cortes.',
    ),
    (
      kind: 'grades',
      title: 'Detalle de notas',
      description: 'Todas las notas capturadas por componente y corte.',
    ),
    (
      kind: 'attendance',
      title: 'Asistencia',
      description: 'Registro con porcentajes ponderados por minutos de clase.',
    ),
    (
      kind: 'combined',
      title: 'Informe combinado',
      description: 'Notas, asistencia y nivel de riesgo en un solo documento.',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final subjects = ref.watch(periodSubjectsProvider);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Reportes'),
        actions: const [PeriodSelector()],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
        children: [
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Alcance',
                    style:
                        TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                const SizedBox(height: 4),
                Text(
                  'Los documentos se generan solo con los datos que tienes '
                  'autorizados a ver.',
                  style: TextStyle(fontSize: 12.5, color: muted),
                ),
                const SizedBox(height: 14),
                subjects.when(
                  loading: () => const SkeletonBox(height: 48, radius: 12),
                  error: (_, __) => Text('No se pudieron cargar las materias',
                      style: TextStyle(fontSize: 12, color: muted)),
                  data: (items) => DropdownButtonFormField<String?>(
                    initialValue: _subjectId,
                    isExpanded: true,
                    decoration: const InputDecoration(
                      labelText: 'Materia',
                      isDense: true,
                    ),
                    items: [
                      const DropdownMenuItem(
                        value: null,
                        child: Text('Todas las materias'),
                      ),
                      for (final subject in items)
                        DropdownMenuItem(
                          value: subject.id,
                          child: Text(
                            '${subject.name} (${subject.code})',
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                    ],
                    onChanged: (value) => setState(() => _subjectId = value),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          for (final report in _reports) ...[
            _ReportCard(
              title: report.title,
              description: report.description,
              busyKey: _busy,
              kind: report.kind,
              onDownload: (format) =>
                  _download(report.kind, format, report.title),
            ),
            const SizedBox(height: 12),
          ],
          const SizedBox(height: 4),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.info_outline, size: 15, color: muted),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  'Al terminar se abre la hoja de compartir para que guardes el '
                  'archivo donde prefieras.',
                  style: TextStyle(fontSize: 11.5, color: muted),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _download(String kind, String format, String title) async {
    setState(() => _busy = '$kind-$format');

    final period = ref.read(selectedPeriodProvider);
    final subjects = ref.read(periodSubjectsProvider).valueOrNull ?? <Subject>[];
    final subjectCode = _subjectId == null
        ? null
        : subjects.where((s) => s.id == _subjectId).firstOrNull?.code;

    try {
      final bytes = await ref.read(academicRepositoryProvider).downloadReport(
            format: format,
            kind: kind,
            period: period,
            subjectId: _subjectId,
          );

      if (bytes.isEmpty) {
        if (!mounted) return;
        AppToast.error(context, 'El reporte llegó vacío',
            'El servidor no devolvió contenido para este alcance.');
        return;
      }

      final extension = format == 'pdf' ? 'pdf' : 'xlsx';
      final suffix = subjectCode == null ? '' : '-$subjectCode';
      final fileName = 'UTS-$kind-$period$suffix.$extension';

      final directory = await getApplicationDocumentsDirectory();
      final file = File('${directory.path}/$fileName');
      await file.writeAsBytes(bytes);

      if (!mounted) return;
      await SharePlus.instance.share(
        ShareParams(
          files: [XFile(file.path)],
          subject: title,
          text: '$title · periodo $period',
        ),
      );
    } on ApiError catch (error) {
      if (!mounted) return;
      AppToast.error(context, 'No se pudo generar el reporte', error.message);
    } catch (error) {
      if (!mounted) return;
      AppToast.error(context, 'No se pudo guardar el archivo', '$error');
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }
}

class _ReportCard extends StatelessWidget {
  final String title;
  final String description;
  final String kind;
  final String? busyKey;
  final void Function(String format) onDownload;

  const _ReportCard({
    required this.title,
    required this.description,
    required this.kind,
    required this.busyKey,
    required this.onDownload,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;
    final anyBusy = busyKey != null;

    Widget button(String format, IconData icon, String label) {
      final busy = busyKey == '$kind-$format';
      return Expanded(
        child: OutlinedButton.icon(
          onPressed: anyBusy ? null : () => onDownload(format),
          icon: busy
              ? const SizedBox(
                  height: 15,
                  width: 15,
                  child: CircularProgressIndicator(strokeWidth: 2))
              : Icon(icon, size: 18),
          label: Text(label),
        ),
      );
    }

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title,
              style:
                  const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
          const SizedBox(height: 4),
          Text(description, style: TextStyle(fontSize: 12.5, color: muted)),
          const SizedBox(height: 14),
          Row(
            children: [
              button('pdf', Icons.picture_as_pdf_outlined, 'PDF'),
              const SizedBox(width: 10),
              button('excel', Icons.table_chart_outlined, 'Excel'),
            ],
          ),
        ],
      ),
    );
  }
}
