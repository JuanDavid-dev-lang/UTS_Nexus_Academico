import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/data/models.dart';
import '../../core/auth/auth_controller.dart';
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

  Future<void> _crearMateria(BuildContext context, String period) async {
    final creada = await showCompactSheet<bool>(
      context: context,
      titulo: 'Nueva materia',
      subtitulo: 'Se crea en el periodo $period con su grupo',
      constructor: (_) => _FormularioMateria(period: period),
    );
    if (creada == true && mounted) {
      AppToast.success(this.context, 'Materia creada',
          'Con su grupo, lista para matricular estudiantes.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final subjects = ref.watch(periodSubjectsProvider);
    final period = ref.watch(selectedPeriodProvider);
    // El backend solo deja crear materias a ADMIN y PROFESSOR; ofrecer el
    // botón a otro rol sería regalar un 403.
    final rol = ref.watch(authControllerProvider).user?.role;
    final puedeCrear = rol == 'ADMIN' || rol == 'PROFESSOR';

    return Scaffold(
      appBar: CompactHeader(
        titulo: 'Mis materias',
        contexto: period,
        acciones: const [PeriodSelector(), SessionMenuButton()],
      ),
      floatingActionButton: puedeCrear
          ? FloatingActionButton(
              tooltip: 'Nueva materia',
              onPressed: () => _crearMateria(context, period),
              child: const Icon(Icons.add),
            )
          : null,
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
                              ? 'No tienes materias en el periodo $period. Crea '
                                  'una con el botón +, cambia de periodo o pide '
                                  'que te asignen una.'
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

/// Formulario de materia nueva, dentro de la hoja.
///
/// Crea la materia y, acto seguido, su primer grupo, llamado como el código
/// de la materia — que es como la UTS identifica los grupos: B191 no es «la
/// materia y su grupo A», es el grupo en sí. La matrícula cuelga del grupo, y
/// una materia sin ninguno es un callejón sin salida — no se puede matricular
/// a nadie ni importar una lista.
class _FormularioMateria extends ConsumerStatefulWidget {
  final String period;
  const _FormularioMateria({required this.period});

  @override
  ConsumerState<_FormularioMateria> createState() => _FormularioMateriaState();
}

class _FormularioMateriaState extends ConsumerState<_FormularioMateria> {
  final _nombre = TextEditingController();
  final _codigo = TextEditingController();
  final _creditos = TextEditingController(text: '0');
  bool _enviando = false;
  String? _error;

  @override
  void dispose() {
    _nombre.dispose();
    _codigo.dispose();
    _creditos.dispose();
    super.dispose();
  }

  Future<void> _guardar() async {
    final nombre = _nombre.text.trim();
    final codigo = _codigo.text.trim();
    final creditos = int.tryParse(_creditos.text.trim()) ?? 0;
    if (nombre.length < 3 || codigo.length < 2) {
      setState(() => _error =
          'El nombre necesita al menos 3 caracteres y el código 2.');
      return;
    }
    final professorId = ref.read(authControllerProvider).user?.id;
    if (professorId == null) return;

    setState(() {
      _enviando = true;
      _error = null;
    });

    final repo = ref.read(academicRepositoryProvider);
    final Subject materia;
    try {
      materia = await repo.createSubject(
        name: nombre,
        code: codigo,
        period: widget.period,
        professorId: professorId,
        credits: creditos.clamp(0, 20),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _enviando = false;
        _error = ApiError.from(e).message;
      });
      return;
    }

    // El grupo va aparte: si falla, la materia ya existe y reintentar aquí la
    // duplicaría. El grupo se puede crear después desde la importación de
    // listas del escritorio.
    try {
      await repo.createGroup(
        name: codigo,
        subjectId: materia.id,
        period: widget.period,
      );
    } catch (_) {}

    ref.invalidate(subjectsProvider);
    if (mounted) Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _nombre,
          textCapitalization: TextCapitalization.sentences,
          decoration: const InputDecoration(
            labelText: 'Nombre',
            hintText: 'Cálculo I',
          ),
        ),
        const SizedBox(height: AppSpacing.gap),
        Row(
          children: [
            Expanded(
              flex: 2,
              child: TextField(
                controller: _codigo,
                textCapitalization: TextCapitalization.characters,
                decoration: const InputDecoration(
                  labelText: 'Código',
                  hintText: 'CAL-101',
                ),
              ),
            ),
            const SizedBox(width: AppSpacing.gapSm),
            Expanded(
              child: TextField(
                controller: _creditos,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Créditos'),
              ),
            ),
          ],
        ),
        if (_error != null) ...[
          const SizedBox(height: AppSpacing.gapSm),
          Text(
            _error!,
            style: AppType.caption.copyWith(
              color: SemanticTone.of(context, SemanticKind.danger).fg,
            ),
          ),
        ],
        const SizedBox(height: AppSpacing.gap),
        FilledButton.icon(
          onPressed: _enviando ? null : _guardar,
          icon: _enviando
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.add),
          label: const Text('Crear materia'),
        ),
      ],
    );
  }
}
