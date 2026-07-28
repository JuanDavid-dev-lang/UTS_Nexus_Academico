import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/data/models.dart';
import '../../core/data/providers.dart';
import '../../core/network/api_error.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/ui_kit.dart';

/// Directorio global de estudiantes.
///
/// Ya no es la vía principal para llegar a un estudiante —para eso está la
/// materia—, sino una herramienta de consulta: buscar a alguien por cédula
/// cuando no recuerdas en qué materia está, e importar listas.
class StudentsPage extends ConsumerStatefulWidget {
  const StudentsPage({super.key});

  @override
  ConsumerState<StudentsPage> createState() => _StudentsPageState();
}

class _StudentsPageState extends ConsumerState<StudentsPage> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final students = ref.watch(studentsProvider);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Directorio'),
        actions: [
          IconButton(
            icon: const Icon(Icons.upload_file),
            tooltip: 'Importar lista',
            onPressed: _openImportSheet,
          ),
        ],
      ),
      body: students.when(
        loading: () => ListView(
          padding: const EdgeInsets.all(16),
          children: List.generate(
            8,
            (_) => const Padding(
              padding: EdgeInsets.only(bottom: 10),
              child: SkeletonBox(height: 64, radius: 18),
            ),
          ),
        ),
        error: (error, _) => StateView.error(
          ApiError.from(error).message,
          action: FilledButton(
            onPressed: () => ref.invalidate(studentsProvider),
            child: const Text('Reintentar'),
          ),
        ),
        data: (items) {
          final term = _query.trim().toLowerCase();
          final filtered = term.isEmpty
              ? items
              : items
                  .where((s) =>
                      s.fullName.toLowerCase().contains(term) ||
                      s.code.toLowerCase().contains(term) ||
                      s.program.toLowerCase().contains(term))
                  .toList();

          return Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                child: TextField(
                  onChanged: (value) => setState(() => _query = value),
                  decoration: const InputDecoration(
                    hintText: 'Buscar por nombre, cédula o programa…',
                    prefixIcon: Icon(Icons.search),
                    isDense: true,
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 18),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    '${filtered.length} de ${items.length} estudiantes',
                    style: TextStyle(fontSize: 12, color: muted),
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Expanded(
                child: filtered.isEmpty
                    ? StateView.empty(
                        term.isEmpty
                            ? 'Todavía no hay estudiantes registrados.'
                            : 'Sin coincidencias para "$_query".',
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                        itemCount: filtered.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 10),
                        itemBuilder: (_, index) =>
                            _StudentTile(student: filtered[index]),
                      ),
              ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _openImportSheet() async {
    final controller = TextEditingController();
    var importing = false;

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (sheetContext) => StatefulBuilder(
        builder: (innerContext, setSheetState) => Padding(
          padding: EdgeInsets.only(
            left: 20,
            right: 20,
            bottom: MediaQuery.of(innerContext).viewInsets.bottom + 20,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text('Importar estudiantes',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
              const SizedBox(height: 6),
              const Text(
                'Pega una fila por estudiante, separando los campos con comas. '
                'La primera línea es la cabecera y se ignora.',
                style: TextStyle(fontSize: 13),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: controller,
                minLines: 6,
                maxLines: 10,
                style: const TextStyle(fontFamily: 'monospace', fontSize: 12.5),
                decoration: const InputDecoration(
                  hintText: 'cedula,nombres,correo,programa\n'
                      '1098765432,Ana Rodríguez,ana@uts.edu.co,Sistemas',
                ),
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: importing
                    ? null
                    : () async {
                        setSheetState(() => importing = true);
                        final count = await _import(controller.text);
                        if (innerContext.mounted) {
                          Navigator.of(innerContext).pop();
                        }
                        if (!mounted) return;
                        if (count > 0) {
                          AppToast.success(
                              context, '$count estudiantes importados');
                          ref.invalidate(studentsProvider);
                        } else {
                          AppToast.error(context, 'No se importó nada',
                              'Revisa el formato: se esperan 4 columnas por fila.');
                        }
                      },
                child: importing
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(strokeWidth: 2.4))
                    : const Text('Importar'),
              ),
            ],
          ),
        ),
      ),
    );
    controller.dispose();
  }

  /// Convierte el texto pegado en filas. Devuelve cuántas se importaron.
  Future<int> _import(String raw) async {
    final lines = raw
        .split('\n')
        .map((line) => line.trim())
        .where((line) => line.isNotEmpty)
        .toList();
    if (lines.length <= 1) return 0;

    final rows = <Map<String, dynamic>>[];
    for (final line in lines.skip(1)) {
      final columns = line.split(',').map((c) => c.trim()).toList();
      // Una fila mal formada se salta; el recuento final dice cuántas entraron.
      if (columns.length < 4) continue;
      rows.add({
        'code': columns[0],
        'fullName': columns[1],
        'email': columns[2],
        'program': columns[3],
      });
    }
    if (rows.isEmpty) return 0;

    try {
      return await ref.read(academicRepositoryProvider).importStudents(rows);
    } on ApiError {
      return 0;
    }
  }
}

class _StudentTile extends StatelessWidget {
  final Student student;
  const _StudentTile({required this.student});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;
    final primary = Theme.of(context).colorScheme.primary;

    return AppCard(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        children: [
          CircleAvatar(
            radius: 20,
            backgroundColor: primary.withValues(alpha: 0.12),
            child: Text(
              _initials(student.fullName),
              style: TextStyle(
                  fontSize: 13, fontWeight: FontWeight.w700, color: primary),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(student.fullName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontWeight: FontWeight.w600, fontSize: 14.5)),
                const SizedBox(height: 2),
                Text(
                  [
                    student.code,
                    if (student.program.isNotEmpty) student.program,
                  ].join(' · '),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 12, color: muted),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  static String _initials(String name) {
    final parts =
        name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
}
