import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/data/models.dart';
import '../../core/data/providers.dart';
import '../../core/network/api_error.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/compact.dart';
import '../../core/widgets/debounced_search_field.dart';
import '../../core/widgets/period_selector.dart';
import '../../core/widgets/session_menu.dart';
import '../../core/widgets/ui_kit.dart';

/// Listado de materias — punto de entrada a los estudiantes.
///
/// La versión anterior tenía «Estudiantes» como una lista plana de todos los
/// alumnos del docente. Eso no coincide con cómo se trabaja: un docente piensa
/// «mis estudiantes de Cálculo I», no «todos mis estudiantes». Aquí la materia
/// es el contenedor y los estudiantes viven dentro de ella.
///
/// Las cifras —promedio, asistencia, cuántos en riesgo— las calcula el
/// backend. Esta pantalla las pinta; no las deriva de la lista.
class SubjectsPage extends ConsumerStatefulWidget {
  const SubjectsPage({super.key});

  @override
  ConsumerState<SubjectsPage> createState() => _SubjectsPageState();
}

class _SubjectsPageState extends ConsumerState<SubjectsPage> {
  final _busqueda = TextEditingController();

  /// Texto ya reposado. Sin el rebote, escribir nueve letras son nueve pasadas
  /// de filtrado sobre la lista completa, ocho de las cuales nadie ve.
  String _query = '';

  @override
  void dispose() {
    _busqueda.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final subjects = ref.watch(periodSubjectsProvider);
    final period = ref.watch(selectedPeriodProvider);

    return Scaffold(
      appBar: CompactHeader(
        titulo: 'Mis materias',
        contexto: period,
        acciones: const [PeriodSelector(), SessionMenuButton()],
      ),
      body: Column(
        children: [
          // El buscador va fijo bajo la cabecera: si se desplazara con la
          // lista, buscar obligaría a subir hasta arriba cada vez.
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.page,
              AppSpacing.gapSm,
              AppSpacing.page,
              AppSpacing.gapSm,
            ),
            child: DebouncedSearchField(
              controller: _busqueda,
              labelText: 'Buscar materia',
              onChanged: (valor) => setState(() => _query = valor),
            ),
          ),

          Expanded(
            child: RefreshIndicator(
              onRefresh: () async {
                ref.invalidate(subjectsProvider);
                await ref.read(subjectsProvider.future);
              },
              child: subjects.when(
                loading: () => const Padding(
                  padding: AppSpacing.listPadding,
                  child: SkeletonRows(filas: 7),
                ),
                error: (error, _) => ListView(
                  padding: AppSpacing.listPadding,
                  children: [
                    StateView.error(
                      ApiError.from(error).message,
                      action: FilledButton(
                        onPressed: () => ref.invalidate(subjectsProvider),
                        child: const Text('Reintentar'),
                      ),
                    ),
                  ],
                ),
                data: (items) {
                  final q = _query.trim().toLowerCase();
                  final visibles = q.isEmpty
                      ? items
                      : items
                          .where((m) =>
                              m.name.toLowerCase().contains(q) ||
                              m.code.toLowerCase().contains(q))
                          .toList();

                  if (visibles.isEmpty) {
                    return ListView(
                      padding: AppSpacing.listPadding,
                      children: [
                        CompactEmpty(
                          icono: Icons.menu_book_outlined,
                          mensaje: q.isEmpty
                              ? 'No tienes materias en el periodo $period. Cambia '
                                  'de periodo o pide que te asignen una.'
                              : 'Ninguna materia coincide con «$_query».',
                        ),
                      ],
                    );
                  }

                  // `ListView.builder`: solo se construye lo visible.
                  return ListView.separated(
                    padding: AppSpacing.listPadding,
                    itemCount: visibles.length,
                    separatorBuilder: (_, __) =>
                        const SizedBox(height: AppSpacing.gapSm),
                    itemBuilder: (_, indice) => _FilaMateria(subject: visibles[indice]),
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Fila compacta de materia.
///
/// Antes era una tarjeta de 108 dp con el icono en un cuadrado de 44, el
/// nombre en dos líneas y las cifras en una fila de chips debajo: en pantalla
/// cabían cuatro materias. Ahora el código, el grupo y el periodo van en la
/// misma línea de metadatos y las cifras a la derecha, en 56 dp.
class _FilaMateria extends ConsumerWidget {
  final Subject subject;
  const _FilaMateria({required this.subject});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final stats = ref.watch(subjectStatsProvider(subject.id));

    return stats.when(
      // Mientras llegan las cifras la fila ya es navegable: esperar a los
      // números para poder entrar a la materia sería esperar por nada.
      loading: () => AcademicRow(
        titulo: subject.name,
        metadatos: [subject.code, '${subject.credits} créditos', subject.period],
        onTap: () => context.go('/subjects/${subject.id}'),
      ),
      // Un fallo al contar no debe ocultar la materia.
      error: (_, __) => AcademicRow(
        titulo: subject.name,
        metadatos: [subject.code, 'sin cifras disponibles'],
        onTap: () => context.go('/subjects/${subject.id}'),
      ),
      data: (data) => AcademicRow(
        titulo: subject.name,
        metadatos: [
          subject.code,
          '${data.students} estudiantes',
          subject.period,
        ],
        // El promedio y el umbral vienen del backend; aquí solo se elige el
        // par de colores que representa el resultado.
        indicador: data.averageGrade > 0
            ? MetricChip(
                data.averageGrade.toStringAsFixed(2),
                etiqueta: 'Prom.',
                tono: data.averageGrade >= 3
                    ? SemanticKind.success
                    : SemanticKind.danger,
              )
            : null,
        estado: data.atRisk > 0 ? StatusPill.warning('${data.atRisk} riesgo') : null,
        acento: data.atRisk > 0 ? SemanticKind.warning : null,
        onTap: () => context.go('/subjects/${subject.id}'),
      ),
    );
  }
}
