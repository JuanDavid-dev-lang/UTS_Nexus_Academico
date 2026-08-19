import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/data/models.dart';
import '../../core/data/providers.dart';
import '../../core/network/api_error.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/compact.dart';
import '../../core/widgets/session_menu.dart';
import '../../core/widgets/ui_kit.dart';
import '../../core/widgets/debounced_search_field.dart';
import './widgets/student_timeline_sheet.dart';

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
    final students = ref.watch(filteredStudentsProvider);
    final subjects = ref.watch(subjectsProvider).valueOrNull ?? const <Subject>[];
    final subjectFilter = ref.watch(studentSubjectFilterProvider);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;

    return Scaffold(
      appBar: CompactHeader(
        titulo: 'Directorio',
        contexto: students.valueOrNull == null
            ? null
            : '${students.valueOrNull!.length}',
        acciones: [
          IconButton(
            icon: const Icon(Icons.upload_file_outlined),
            tooltip: 'Importar lista',
            onPressed: _openImportSheet,
          ),
          const SessionMenuButton(),
        ],
      ),
      body: students.when(
        loading: () => const Padding(
          padding: AppSpacing.listPadding,
          child: SkeletonRows(filas: 9),
        ),
        error: (error, _) => StateView.error(
          ApiError.from(error).message,
          action: FilledButton(
            onPressed: () => ref.invalidate(filteredStudentsProvider),
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
                // Cabecera fija sobre la lista: mismo horizontal que
                // AppSpacing.pagePadding para que el buscador no baile.
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.page,
                  AppSpacing.gapSm,
                  AppSpacing.page,
                  AppSpacing.gapSm,
                ),
                child: DebouncedSearchField(
                  hintText: 'Buscar por nombre, cédula o programa…',
                  onChanged: (value) => setState(() => _query = value),
                ),
              ),
              if (subjects.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.fromLTRB(
                    AppSpacing.page,
                    0,
                    AppSpacing.page,
                    AppSpacing.gapSm,
                  ),
                  child: DropdownButtonFormField<String?>(
                    initialValue: subjectFilter,
                    isExpanded: true,
                    decoration: const InputDecoration(
                      labelText: 'Materia',
                      isDense: true,
                    ),
                    items: [
                      const DropdownMenuItem<String?>(
                        value: null,
                        child: Text('Todas mis materias'),
                      ),
                      ...subjects.map(
                        (subject) => DropdownMenuItem<String?>(
                          value: subject.id,
                          child: Text(subject.name,
                              overflow: TextOverflow.ellipsis),
                        ),
                      ),
                    ],
                    onChanged: (value) => ref
                        .read(studentSubjectFilterProvider.notifier)
                        .state = value,
                  ),
                ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.page),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    '${filtered.length} de ${items.length} estudiantes',
                    style: AppType.caption.copyWith(color: muted),
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.gapSm),
              Expanded(
                child: filtered.isEmpty
                    ? StateView.empty(
                        term.isEmpty
                            ? 'Todavía no hay estudiantes registrados.'
                            : 'Sin coincidencias para "$_query".',
                      )
                    : ListView.separated(
                        padding: AppSpacing.listPadding,
                        itemCount: filtered.length,
                        separatorBuilder: (_, __) =>
                            const SizedBox(height: AppSpacing.gapSm),
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
              Text('Importar estudiantes',
                  style: AppType.h3.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 6),
              const Text(
                'Pega una fila por estudiante, separando los campos con comas. '
                'La primera línea es la cabecera y se ignora.',
                style: AppType.caption,
              ),
              const SizedBox(height: 14),
              TextField(
                controller: controller,
                minLines: 6,
                maxLines: 10,
                style: AppType.caption.copyWith(fontFamily: 'monospace'),
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

/// Fila del directorio.
///
/// Antes era una tarjeta de 64 dp con un avatar de 40 y dos líneas sueltas;
/// ahora reutiliza [AcademicRow], que es la misma forma que usan la asistencia
/// y las notas. La diferencia importa: tres listas con tres alturas y tres
/// criterios distintos sobre qué es un metadato obligaban a releer cada
/// pantalla desde cero.
///
/// Tocarla abre el historial. Es el gesto que faltaba: el directorio servía
/// para encontrar a alguien y ahí se acababa, sin forma de ver qué le había
/// pasado durante el semestre.
class _StudentTile extends StatelessWidget {
  final Student student;
  const _StudentTile({required this.student});

  @override
  Widget build(BuildContext context) {
    return AcademicRow(
      titulo: student.fullName,
      metadatos: [
        student.code,
        if (student.program.isNotEmpty) student.program,
      ],
      avatar: InitialsAvatar(student.fullName, size: 32),
      onTap: () => showStudentTimelineSheet(
        context,
        studentId: student.id,
        nombre: student.fullName,
      ),
    );
  }
}
