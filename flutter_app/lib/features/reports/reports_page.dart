import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/data/models.dart';
import '../../core/data/providers.dart';
import '../../core/network/api_error.dart';
import '../../core/storage/offline_status.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/offline_banner.dart';
import '../../core/widgets/period_selector.dart';
import '../../core/widgets/session_menu.dart';
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
        actions: const [PeriodSelector(), SessionMenuButton()],
      ),
      // El PDF y el Excel los genera el servidor: no hay nada guardado que
      // exportar. Decirlo antes evita que el docente prepare un reporte y
      // descubra el fallo al pulsar «descargar».
      body: !(ref.watch(offlineStatusProvider).valueOrNull?.esFresco ?? true)
          ? const RequiereConexion(
              que: 'Los reportes',
              detalle:
                  'El PDF y el Excel se arman en el servidor con los datos del '
                  'periodo, así que necesitan red para generarse.',
            )
          : ListView(
              padding: AppSpacing.pagePadding,
              children: [
                AppCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Alcance',
                          style: AppType.bodyStrong
                              .copyWith(fontWeight: FontWeight.w700)),
                      const SizedBox(height: 4),
                      Text(
                        'Los documentos se generan solo con los datos que tienes '
                        'autorizados a ver.',
                        style: AppType.caption.copyWith(color: muted),
                      ),
                      const SizedBox(height: 14),
                      subjects.when(
                        loading: () =>
                            const SkeletonBox(height: 48, radius: 12),
                        error: (_, __) => Text(
                            'No se pudieron cargar las materias',
                            style: AppType.caption.copyWith(color: muted)),
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
                          onChanged: (value) =>
                              setState(() => _subjectId = value),
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
                    // Solo asistencia tiene vista previa: es el reporte que se
                    // revisa antes de entregar (quién faltó y cuántos minutos).
                    onPreview:
                        report.kind == 'attendance' ? _openPreview : null,
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
                        style: AppType.caption.copyWith(color: muted),
                      ),
                    ),
                  ],
                ),
              ],
            ),
    );
  }

  /// Vista previa de asistencia: las mismas filas que saldrán en el archivo.
  Future<void> _openPreview() async {
    final period = ref.read(selectedPeriodProvider);
    final future = ref
        .read(academicRepositoryProvider)
        .previewAttendanceReport(period: period, subjectId: _subjectId);

    if (!mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (sheetContext) => SizedBox(
        // `sizeOf` y no `of`: leer solo el alto no debe suscribir al
        // `MediaQueryData` entero, que el teclado anima fotograma a fotograma.
        height: MediaQuery.sizeOf(sheetContext).height * 0.85,
        child: _AttendancePreviewSheet(
          future: future,
          onDownload: (format) {
            Navigator.of(sheetContext).pop();
            _download('attendance', format, 'Asistencia');
          },
        ),
      ),
    );
  }

  Future<void> _download(String kind, String format, String title) async {
    setState(() => _busy = '$kind-$format');

    final period = ref.read(selectedPeriodProvider);
    final subjects =
        ref.read(periodSubjectsProvider).valueOrNull ?? <Subject>[];
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
  final VoidCallback? onPreview;

  const _ReportCard({
    required this.title,
    required this.description,
    required this.kind,
    required this.busyKey,
    required this.onDownload,
    this.onPreview,
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
              style: AppType.bodyStrong.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          Text(description, style: AppType.caption.copyWith(color: muted)),
          const SizedBox(height: 14),
          Row(
            children: [
              button('pdf', Icons.picture_as_pdf_outlined, 'PDF'),
              const SizedBox(width: 10),
              button('excel', Icons.table_chart_outlined, 'Excel'),
            ],
          ),
          if (onPreview != null) ...[
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: TextButton.icon(
                onPressed: anyBusy ? null : onPreview,
                icon: const Icon(Icons.visibility_outlined, size: 18),
                label: const Text('Vista previa'),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Hoja con la vista previa del reporte de asistencia.
///
/// Pinta las filas tal cual llegan del servidor: aquí no se calcula ni se
/// reordena nada — es la misma tabla que va a salir en el PDF/Excel.
class _AttendancePreviewSheet extends StatelessWidget {
  final Future<ReportPreview> future;
  final void Function(String format) onDownload;

  const _AttendancePreviewSheet({
    required this.future,
    required this.onDownload,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Vista previa de asistencia',
              style: AppType.bodyStrong.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          Text(
            'Lo que ves aquí es exactamente lo que saldrá en el archivo.',
            style: AppType.caption.copyWith(color: muted),
          ),
          const SizedBox(height: 12),
          Expanded(
            child: FutureBuilder<ReportPreview>(
              future: future,
              builder: (context, snapshot) {
                if (snapshot.connectionState != ConnectionState.done) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (snapshot.hasError) {
                  final error = snapshot.error;
                  return Center(
                    child: Text(
                      error is ApiError
                          ? error.message
                          : 'No se pudo cargar la vista previa.',
                      style: AppType.caption.copyWith(color: muted),
                    ),
                  );
                }

                final preview = snapshot.data!;
                if (preview.rows.isEmpty) {
                  return Center(
                    child: Text(
                      'No hay marcas de asistencia con los filtros elegidos.',
                      style: AppType.caption.copyWith(color: muted),
                    ),
                  );
                }

                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      // Doble desplazamiento: la tabla es más ancha y más alta
                      // que un teléfono; sin el horizontal, las columnas del
                      // final serían inalcanzables.
                      child: SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: SingleChildScrollView(
                          child: DataTable(
                            headingTextStyle: AppType.caption
                                .copyWith(fontWeight: FontWeight.w700),
                            dataTextStyle: AppType.caption,
                            columns: [
                              for (final header in preview.headers)
                                DataColumn(label: Text(header)),
                            ],
                            rows: [
                              for (final row in preview.rows)
                                DataRow(cells: [
                                  for (final cell in row)
                                    DataCell(Text(cell)),
                                ]),
                            ],
                          ),
                        ),
                      ),
                    ),
                    if (preview.truncado) ...[
                      const SizedBox(height: 6),
                      Text(
                        'Mostrando las primeras ${preview.rows.length} filas de '
                        '${preview.total}. El archivo descargado incluye todas.',
                        style: AppType.caption.copyWith(color: muted),
                      ),
                    ],
                  ],
                );
              },
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => onDownload('pdf'),
                  icon: const Icon(Icons.picture_as_pdf_outlined, size: 18),
                  label: const Text('PDF'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => onDownload('excel'),
                  icon: const Icon(Icons.table_chart_outlined, size: 18),
                  label: const Text('Excel'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
