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
import 'roster_import_sheet.dart';

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
  @override
  Widget build(BuildContext context) {
    final students = ref.watch(filteredAndSearchedStudentsProvider);
    final allStudents =
        ref.watch(filteredStudentsProvider).valueOrNull ?? const <Student>[];
    final subjects =
        ref.watch(subjectsProvider).valueOrNull ?? const <Subject>[];
    final subjectFilter = ref.watch(studentSubjectFilterProvider);
    final searchQuery = ref.watch(studentSearchQueryProvider);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;

    return Scaffold(
      appBar: CompactHeader(
        titulo: 'Directorio',
        contexto: allStudents.isEmpty ? null : '${allStudents.length}',
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
            onPressed: () {
              ref.invalidate(filteredStudentsProvider);
              ref.invalidate(filteredAndSearchedStudentsProvider);
            },
            child: const Text('Reintentar'),
          ),
        ),
        data: (items) {
          return Column(
            children: [
              /*
               * Buscador, filtro y recuento en un solo bloque separado de la
               * lista por su borde inferior.
               *
               * Eran tres `Padding` encadenados sobre el mismo fondo que las
               * filas: nada decía que los tres van juntos ni que lo que hacen
               * es acotar la lista de abajo, y el recuento —que es la respuesta
               * a «¿esto es todo o está filtrado?»— parecía la primera línea
               * del listado.
               */
              Container(
                decoration: BoxDecoration(
                  color: context.palette.bg,
                  border: Border(
                    bottom: BorderSide(color: context.palette.border),
                  ),
                ),
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.page,
                  AppSpacing.gapSm,
                  AppSpacing.page,
                  AppSpacing.gapSm,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    DebouncedSearchField(
                      hintText: 'Buscar por nombre, cédula o programa…',
                      onChanged: (value) =>
                          ref.read(studentSearchQueryProvider.notifier).state =
                              value,
                    ),
                    if (subjects.isNotEmpty) ...[
                      const SizedBox(height: AppSpacing.gapSm),
                      DropdownButtonFormField<String?>(
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
                              child: Text(
                                subject.name,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ),
                        ],
                        onChanged: (value) =>
                            ref
                                    .read(studentSubjectFilterProvider.notifier)
                                    .state =
                                value,
                      ),
                    ],
                    const SizedBox(height: AppSpacing.gapSm),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        '${items.length} de ${allStudents.length} estudiantes',
                        style: AppType.caption.copyWith(color: muted),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.gapSm),
              Expanded(
                child: items.isEmpty
                    ? StateView.empty(
                        searchQuery.trim().isEmpty
                            ? 'Todavía no hay estudiantes registrados.'
                            : 'Sin coincidencias para "$searchQuery".',
                      )
                    : ListView.separated(
                        padding: AppSpacing.listPadding,
                        itemCount: items.length,
                        separatorBuilder: (_, __) =>
                            const SizedBox(height: AppSpacing.gapSm),
                        itemBuilder: (_, index) =>
                            _StudentTile(student: items[index]),
                      ),
              ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _openImportSheet() async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => RosterImportSheet(
        importRows: _import,
        onImported: (count) {
          AppToast.success(context, '$count estudiantes importados');
          ref.invalidate(studentsProvider);
        },
      ),
    );
  }

  /// Envía la propuesta revisada. Los errores conservan la hoja abierta.
  Future<int> _import(List<Map<String, dynamic>> rows) async {
    if (rows.isEmpty) return 0;
    return ref.read(academicRepositoryProvider).importStudents(rows);
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
        student.email.isEmpty ? 'Sin correo registrado' : student.email,
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
