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
import '../../core/widgets/lista_progresiva.dart';
import 'students_paginados_provider.dart';
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
  /// Texto ya reposado por [DebouncedSearchField].
  ///
  /// Vive en el estado de la pantalla y no en un provider a propósito. Con un
  /// `FutureProvider` que observase el término, cada búsqueda devolvía la
  /// pantalla a `AsyncLoading` y `when` pintaba el esqueleto encima de todo el
  /// `Column` —incluido el propio buscador—, que al desmontarse se llevaba su
  /// `TextEditingController` y con él el texto escrito y el foco.
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final students = ref.watch(directorioEstudiantesProvider);
    final subjects = ref.watch(subjectsProvider).valueOrNull ?? const <Subject>[];
    final subjectFilter = ref.watch(studentSubjectFilterProvider);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;

    return Scaffold(
      appBar: CompactHeader(
        titulo: 'Directorio',
        // El total del servidor, no el de lo descargado: con paginación,
        // contar lo cargado diría «30» sobre ochocientos.
        contexto: students.valueOrNull == null
            ? null
            : '${students.valueOrNull!.total}',
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
            onPressed: () => ref.invalidate(directorioEstudiantesProvider),
            child: const Text('Reintentar'),
          ),
        ),
        data: (estado) {
          // Sin filtro en memoria: lo hace el backend sobre la colección
          // entera. Filtrar aquí solo alcanzaría a las páginas ya descargadas,
          // así que el estudiante de la quinta dejaría de existir al buscar.
          final filtered = estado.items;
          final term = _query.trim();

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
                      onChanged: (value) {
                        setState(() => _query = value);
                        // El término ya viene reposado por el propio campo, así
                        // que escribir nueve letras es una consulta y no nueve.
                        ref
                            .read(directorioEstudiantesProvider.notifier)
                            .buscar(value);
                      },
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
                        onChanged: (value) {
                          ref.read(studentSubjectFilterProvider.notifier).state =
                              value;
                          ref
                              .read(directorioEstudiantesProvider.notifier)
                              .filtrarPorMateria(value);
                        },
                      ),
                    ],
                    const SizedBox(height: AppSpacing.gapSm),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        // «30 de 840» y no solo «30»: es lo que evita la duda
                        // de si la lista terminó o se quedó a medias.
                        estado.hayMas
                            ? '${filtered.length} de ${estado.total} estudiantes'
                            : '${filtered.length} estudiantes',
                        style: AppType.caption.copyWith(color: muted),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.gapSm),
              Expanded(
                child: filtered.isEmpty
                    ? (estado.cargandoMas
                        // Buscar no manda la pantalla a `AsyncLoading` —eso se
                        // llevaría el buscador y con él el foco y el texto—,
                        // así que el esqueleto de la búsqueda se pinta aquí.
                        ? const Padding(
                            padding: AppSpacing.listPadding,
                            child: SkeletonRows(filas: 6),
                          )
                        : StateView.empty(
                            term.isEmpty
                                ? 'Todavía no hay estudiantes registrados.'
                                : 'Sin coincidencias para "$_query".',
                          ))
                    : ListaProgresiva<Student>(
                        items: filtered,
                        padding: AppSpacing.listPadding,
                        hayMas: estado.hayMas,
                        cargandoMas: estado.cargandoMas,
                        errorAlCargarMas: estado.errorAlCargarMas,
                        onCargarMas: () => ref
                            .read(directorioEstudiantesProvider.notifier)
                            .cargarMas(),
                        separador: (_, __) =>
                            const SizedBox(height: AppSpacing.gapSm),
                        constructor: (_, student, __) =>
                            _StudentTile(student: student),
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
          ref.invalidate(directorioEstudiantesProvider);
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
