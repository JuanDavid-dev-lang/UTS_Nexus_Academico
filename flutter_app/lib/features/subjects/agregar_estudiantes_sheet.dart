import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/data/models.dart';
import '../../core/data/providers.dart';
import '../../core/network/api_error.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/compact.dart';
import '../../core/widgets/debounced_search_field.dart';
import '../../core/widgets/ui_kit.dart';
import '../students/roster_parser.dart';
import '../students/students_paginados_provider.dart';

/// Filas por lista: el mismo `TOPE_LOTE` del servidor. Por encima, el servidor
/// rechazaría el lote entero con un 400.
const _topeLista = 500;

/// Abre la hoja sobre la pantalla de la materia.
Future<void> mostrarAgregarEstudiantes(
  BuildContext context, {
  required String subjectId,
  required String period,
  String codigoMateria = '',
  String nombreMateria = 'Materia',
}) {
  return showCompactSheet<void>(
    context: context,
    titulo: 'Agregar estudiantes',
    subtitulo: '$nombreMateria · $period',
    constructor: (_) => AgregarEstudiantesSheet(
      subjectId: subjectId,
      period: period,
      codigoMateria: codigoMateria,
    ),
  );
}

enum _Modo { buscar, lista }

/// Meter estudiantes en un grupo de una materia.
///
/// El móvil creaba la materia y su grupo, pero no tenía forma de matricular a
/// nadie: la importación del directorio da de alta estudiantes **sin grupo**, y
/// una materia sin matriculados no tiene lista, ni notas, ni asistencia. Es lo
/// mismo que ofrece el escritorio en su diálogo de listado, en dos modos:
///
/// - **Buscar**: alguien que ya existe en el directorio de la institución
///   (`GET /students/search`) y se matricula con `POST /enrollments`.
/// - **Pegar lista**: documento y nombre por línea, con `POST /enrollments/bulk`,
///   que crea a quien no existe y matricula a todos. A quien ya existía no le
///   cambia el nombre: el servidor solo escribe la identidad al crear.
///
/// El grupo se elige siempre: una materia de la UTS tiene varios (A194, A193) y
/// la matrícula cuelga del grupo, no de la materia.
class AgregarEstudiantesSheet extends ConsumerStatefulWidget {
  final String subjectId;
  final String period;

  /// Para no aceptar un grupo con el nombre del código de la materia.
  final String codigoMateria;

  const AgregarEstudiantesSheet({
    super.key,
    required this.subjectId,
    required this.period,
    this.codigoMateria = '',
  });

  @override
  ConsumerState<AgregarEstudiantesSheet> createState() =>
      _AgregarEstudiantesSheetState();
}

class _AgregarEstudiantesSheetState
    extends ConsumerState<AgregarEstudiantesSheet> {
  String? _grupoId;
  _Modo _modo = _Modo.buscar;
  bool _creandoGrupo = false;

  ({String subjectId, String period}) get _clave =>
      (subjectId: widget.subjectId, period: widget.period);

  @override
  Widget build(BuildContext context) {
    return ref
        .watch(groupsProvider)
        .when(
          loading: () => const SkeletonRows(filas: 3),
          error: (error, _) => CompactEmpty(
            icono: Icons.error_outline,
            mensaje: ApiError.from(error).message,
            accion: TextButton(
              onPressed: () => ref.invalidate(groupsProvider),
              child: const Text('Reintentar'),
            ),
          ),
          data: (todos) => _contenido(_gruposDeLaMateria(todos)),
        );
  }

  List<Group> _gruposDeLaMateria(List<Group> todos) {
    final propios = todos
        .where(
          (g) => g.subjectId == widget.subjectId && g.period == widget.period,
        )
        .toList();
    propios.sort((a, b) => a.name.compareTo(b.name));
    return propios;
  }

  Widget _contenido(List<Group> grupos) {
    if (grupos.isEmpty) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Esta materia no tiene grupos en ${widget.period}. La matrícula '
            'cuelga del grupo: créalo para poder agregar estudiantes.',
            style: AppType.caption.copyWith(color: context.palette.muted),
          ),
          const SizedBox(height: AppSpacing.gap),
          _NuevoGrupo(
            subjectId: widget.subjectId,
            period: widget.period,
            codigoMateria: widget.codigoMateria,
            onCreado: (id) => setState(() => _grupoId = id),
          ),
        ],
      );
    }

    final grupo = grupos.firstWhere(
      (g) => g.id == _grupoId,
      orElse: () => grupos.first,
    );
    final matriculas =
        ref.watch(matriculasDeMateriaProvider(_clave)).valueOrNull ??
        const <Enrollment>[];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _selectorDeGrupo(grupos, grupo),
        if (_creandoGrupo) ...[
          const SizedBox(height: AppSpacing.gapSm),
          _NuevoGrupo(
            subjectId: widget.subjectId,
            period: widget.period,
            codigoMateria: widget.codigoMateria,
            onCreado: (id) => setState(() {
              _grupoId = id;
              _creandoGrupo = false;
            }),
          ),
        ],
        const SizedBox(height: AppSpacing.gap),
        SegmentedButton<_Modo>(
          segments: const [
            ButtonSegment(
              value: _Modo.buscar,
              icon: Icon(Icons.search),
              label: Text('Buscar'),
            ),
            ButtonSegment(
              value: _Modo.lista,
              icon: Icon(Icons.playlist_add),
              label: Text('Pegar lista'),
            ),
          ],
          selected: {_modo},
          onSelectionChanged: (seleccion) =>
              setState(() => _modo = seleccion.first),
        ),
        const SizedBox(height: AppSpacing.gap),
        if (_modo == _Modo.buscar)
          _BuscarEstudiante(
            grupo: grupo,
            nombresDeGrupo: {for (final g in grupos) g.id: g.name},
            gruposDeEstudiante: _gruposPorEstudiante(matriculas),
            onMatriculado: _refrescar,
          )
        else
          _PegarLista(grupo: grupo, onMatriculados: _refrescar),
      ],
    );
  }

  Widget _selectorDeGrupo(List<Group> grupos, Group grupo) {
    return Row(
      children: [
        Expanded(
          child: DropdownButtonFormField<String>(
            // La clave cambia con el grupo: `initialValue` solo se lee al
            // montar, y un grupo recién creado tiene que quedar elegido.
            key: ValueKey('grupo-${grupo.id}'),
            initialValue: grupo.id,
            isExpanded: true,
            decoration: const InputDecoration(
              labelText: 'Grupo',
              isDense: true,
            ),
            items: [
              for (final g in grupos)
                DropdownMenuItem(value: g.id, child: Text(g.name)),
            ],
            onChanged: (id) => setState(() => _grupoId = id),
          ),
        ),
        const SizedBox(width: AppSpacing.gapSm),
        IconButton(
          tooltip: _creandoGrupo ? 'Cancelar grupo nuevo' : 'Crear grupo',
          icon: Icon(_creandoGrupo ? Icons.close : Icons.add),
          onPressed: () => setState(() => _creandoGrupo = !_creandoGrupo),
        ),
      ],
    );
  }

  /// En qué grupos de esta materia está ya cada estudiante.
  Map<String, Set<String>> _gruposPorEstudiante(List<Enrollment> matriculas) {
    final mapa = <String, Set<String>>{};
    for (final matricula in matriculas) {
      final grupoId = matricula.groupId;
      if (grupoId == null || matricula.studentId.isEmpty) continue;
      mapa.putIfAbsent(matricula.studentId, () => <String>{}).add(grupoId);
    }
    return mapa;
  }

  /// Todo lo que se calcula sobre la matrícula. El servidor también avisa por
  /// `sync:update`, pero con el socket caído la lista de la materia se quedaría
  /// sin el estudiante recién agregado.
  void _refrescar() {
    ref.invalidate(matriculasDeMateriaProvider(_clave));
    ref.invalidate(subjectRosterProvider(widget.subjectId));
    ref.invalidate(subjectStatsProvider(widget.subjectId));
    ref.invalidate(studentsProvider);
    ref.invalidate(filteredStudentsProvider);
    ref.invalidate(directorioEstudiantesProvider);
  }
}

// ── Grupo nuevo ─────────────────────────────────────────────────────────────

class _NuevoGrupo extends ConsumerStatefulWidget {
  final String subjectId;
  final String period;
  final String codigoMateria;
  final ValueChanged<String> onCreado;

  const _NuevoGrupo({
    required this.subjectId,
    required this.period,
    required this.codigoMateria,
    required this.onCreado,
  });

  @override
  ConsumerState<_NuevoGrupo> createState() => _NuevoGrupoState();
}

class _NuevoGrupoState extends ConsumerState<_NuevoGrupo> {
  final _nombre = TextEditingController();
  bool _enviando = false;
  String? _error;

  @override
  void dispose() {
    _nombre.dispose();
    super.dispose();
  }

  /// Mismas reglas que al crear la materia y que `POST /groups`: en mayúsculas
  /// y nunca el código de la materia (PIS701 es la materia; A194, el grupo).
  String? _validar(String nombre) {
    if (nombre.isEmpty) return 'Escribe el grupo (por ejemplo A194).';
    final codigo = widget.codigoMateria.toUpperCase().replaceAll(' ', '');
    if (codigo.isNotEmpty && nombre.replaceAll(' ', '') == codigo) {
      return 'El grupo no es el código de la materia: usa la etiqueta del '
          'grupo (por ejemplo A194).';
    }
    return null;
  }

  Future<void> _crear() async {
    final nombre = _nombre.text.trim().toUpperCase();
    final invalido = _validar(nombre);
    if (invalido != null) {
      setState(() => _error = invalido);
      return;
    }
    setState(() {
      _enviando = true;
      _error = null;
    });
    try {
      await ref
          .read(academicRepositoryProvider)
          .createGroup(
            name: nombre,
            subjectId: widget.subjectId,
            period: widget.period,
          );
      ref.invalidate(groupsProvider);
      final grupos = await ref.read(groupsProvider.future);
      final creado = grupos.where(
        (g) =>
            g.subjectId == widget.subjectId &&
            g.period == widget.period &&
            g.name == nombre,
      );
      if (!mounted) return;
      if (creado.isNotEmpty) widget.onCreado(creado.first.id);
    } on Exception catch (error) {
      if (!mounted) return;
      setState(() => _error = ApiError.from(error).message);
    } finally {
      // Pase lo que pase, el botón vuelve: un spinner que no termina se lee
      // como una aplicación colgada.
      if (mounted) setState(() => _enviando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: TextField(
                key: const Key('grupo-nuevo'),
                controller: _nombre,
                enabled: !_enviando,
                textCapitalization: TextCapitalization.characters,
                maxLength: 20,
                decoration: const InputDecoration(
                  labelText: 'Grupo nuevo',
                  hintText: 'A194',
                  counterText: '',
                  isDense: true,
                ),
                onSubmitted: (_) => _crear(),
              ),
            ),
            const SizedBox(width: AppSpacing.gapSm),
            FilledButton.tonal(
              onPressed: _enviando ? null : _crear,
              child: _enviando
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Crear'),
            ),
          ],
        ),
        if (_error != null) _TextoDeError(_error!),
      ],
    );
  }
}

// ── Buscar en el directorio ─────────────────────────────────────────────────

class _BuscarEstudiante extends ConsumerStatefulWidget {
  final Group grupo;
  final Map<String, String> nombresDeGrupo;
  final Map<String, Set<String>> gruposDeEstudiante;
  final VoidCallback onMatriculado;

  const _BuscarEstudiante({
    required this.grupo,
    required this.nombresDeGrupo,
    required this.gruposDeEstudiante,
    required this.onMatriculado,
  });

  @override
  ConsumerState<_BuscarEstudiante> createState() => _BuscarEstudianteState();
}

class _BuscarEstudianteState extends ConsumerState<_BuscarEstudiante> {
  String _termino = '';
  List<Student> _resultados = const [];
  bool _buscando = false;
  String? _error;

  /// Descarta respuestas viejas: si se escribe «ana» y luego «ana ma», la
  /// respuesta de «ana» puede llegar la última y pisaría la buena.
  int _consulta = 0;

  final Set<String> _agregando = {};

  /// Matriculados en esta hoja (estudiante → grupo), antes de que vuelva la
  /// lista del servidor: la fila cambia a «En el grupo» al instante.
  final Map<String, String> _agregadosAhora = {};

  Future<void> _buscar(String texto) async {
    final termino = texto.trim();
    final consulta = ++_consulta;
    setState(() {
      _termino = termino;
      _error = null;
      _buscando = termino.length >= 3;
      if (termino.length < 3) _resultados = const [];
    });
    if (termino.length < 3) return;
    try {
      final resultados = await ref
          .read(academicRepositoryProvider)
          .searchStudents(termino);
      if (!mounted || consulta != _consulta) return;
      setState(() {
        _resultados = resultados;
        _buscando = false;
      });
    } on Exception catch (error) {
      if (!mounted || consulta != _consulta) return;
      setState(() {
        _buscando = false;
        _error = ApiError.from(error).message;
      });
    }
  }

  Future<void> _agregar(Student estudiante) async {
    final grupoId = widget.grupo.id;
    setState(() {
      _agregando.add(estudiante.id);
      _error = null;
    });
    try {
      await ref
          .read(academicRepositoryProvider)
          .enrollStudent(studentId: estudiante.id, groupId: grupoId);
      if (!mounted) return;
      setState(() => _agregadosAhora[estudiante.id] = grupoId);
      widget.onMatriculado();
    } on Exception catch (error) {
      if (!mounted) return;
      setState(
        () => _error =
            'No se pudo agregar a ${estudiante.fullName}: '
            '${ApiError.from(error).message}',
      );
    } finally {
      if (mounted) setState(() => _agregando.remove(estudiante.id));
    }
  }

  Set<String> _gruposDe(String studentId) => {
    ...?widget.gruposDeEstudiante[studentId],
    if (_agregadosAhora[studentId] != null) _agregadosAhora[studentId]!,
  };

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        DebouncedSearchField(
          hintText: 'Nombre o documento…',
          onChanged: _buscar,
        ),
        const SizedBox(height: AppSpacing.gapSm),
        if (_error != null) _TextoDeError(_error!),
        ..._cuerpo(context),
      ],
    );
  }

  List<Widget> _cuerpo(BuildContext context) {
    if (_termino.length < 3) {
      return [
        Text(
          'Busca en el directorio de la institución por nombre o documento '
          '(al menos 3 letras o números). Si el estudiante aún no existe, '
          'agrégalo con «Pegar lista».',
          style: AppType.caption.copyWith(color: context.palette.muted),
        ),
      ];
    }
    if (_buscando) return const [SkeletonRows(filas: 3)];
    if (_resultados.isEmpty) {
      return [
        CompactEmpty(
          icono: Icons.person_search_outlined,
          mensaje:
              'Nadie coincide con «$_termino». Si es nuevo, '
              'agrégalo con «Pegar lista».',
        ),
      ];
    }
    return [
      for (final estudiante in _resultados) ...[
        _filaDeResultado(estudiante),
        const SizedBox(height: AppSpacing.gapSm),
      ],
    ];
  }

  Widget _filaDeResultado(Student estudiante) {
    final grupos = _gruposDe(estudiante.id);
    final enEste = grupos.contains(widget.grupo.id);
    final otros = grupos
        .where((id) => id != widget.grupo.id)
        .map((id) => widget.nombresDeGrupo[id] ?? '')
        .where((nombre) => nombre.isNotEmpty)
        .toList();

    return AcademicRow(
      titulo: estudiante.fullName,
      metadatos: [
        estudiante.code,
        if (estudiante.program.isNotEmpty) estudiante.program,
        if (otros.isNotEmpty) 'En ${otros.join(', ')}',
      ],
      avatar: InitialsAvatar(estudiante.fullName, size: 32),
      estado: _accion(estudiante, enEste),
    );
  }

  Widget _accion(Student estudiante, bool enEste) {
    if (enEste) return StatusPill.success('En el grupo', icon: Icons.check);
    if (_agregando.contains(estudiante.id)) {
      return const SizedBox(
        width: 20,
        height: 20,
        child: CircularProgressIndicator(strokeWidth: 2),
      );
    }
    return TextButton.icon(
      key: Key('agregar-${estudiante.id}'),
      onPressed: () => _agregar(estudiante),
      icon: const Icon(Icons.person_add_alt_1_outlined, size: 18),
      label: const Text('Agregar'),
    );
  }
}

// ── Pegar una lista ─────────────────────────────────────────────────────────

class _PegarLista extends ConsumerStatefulWidget {
  final Group grupo;
  final VoidCallback onMatriculados;

  const _PegarLista({required this.grupo, required this.onMatriculados});

  @override
  ConsumerState<_PegarLista> createState() => _PegarListaState();
}

class _PegarListaState extends ConsumerState<_PegarLista> {
  final _texto = TextEditingController();
  RosterParseResult? _propuesta;
  bool _enviando = false;
  String? _error;
  String? _exito;

  /// Errores de línea que se enseñan: el resto se cuenta, no se lista. La hoja
  /// ya se desplaza, y cien líneas de error esconderían el botón.
  static const _erroresVisibles = 8;

  @override
  void dispose() {
    _texto.dispose();
    super.dispose();
  }

  void _textoCambiado(String _) {
    if (_propuesta == null && _error == null && _exito == null) return;
    setState(() {
      _propuesta = null;
      _error = null;
      _exito = null;
    });
  }

  Future<void> _enviar() async {
    final propuesta = _propuesta;
    if (propuesta == null) {
      setState(() {
        _propuesta = parseRoster(_texto.text, exigirPrograma: false);
        _error = null;
        _exito = null;
      });
      return;
    }
    if (propuesta.rows.isEmpty) return;
    if (propuesta.rows.length > _topeLista) {
      setState(
        () => _error = 'Máximo $_topeLista estudiantes por lista: divídela.',
      );
      return;
    }

    setState(() {
      _enviando = true;
      _error = null;
    });
    try {
      final resultado = await ref
          .read(academicRepositoryProvider)
          .enrollRoster(groupId: widget.grupo.id, students: propuesta.rows);
      if (!mounted) return;
      _texto.clear();
      setState(() {
        _propuesta = null;
        _exito = _resumen(resultado);
      });
      widget.onMatriculados();
    } on Exception catch (error) {
      if (!mounted) return;
      final apiError = ApiError.from(error);
      setState(() {
        // Sin respuesta no se sabe si el servidor alcanzó a matricular:
        // reintentar es seguro (la matrícula no se duplica), pero conviene
        // decirlo en vez de dar la lista por no enviada.
        _error = apiError.isRetryable
            ? '${apiError.message} Puede que parte de la lista ya esté '
                  'matriculada; reintentar no la duplica.'
            : apiError.message;
      });
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  String _resumen(ResultadoMatricula r) {
    final base =
        '${r.matriculados} ${r.matriculados == 1 ? 'matriculado' : 'matriculados'} '
        'en ${widget.grupo.name}';
    if (r.reutilizados == 0) return '$base.';
    return '$base: ${r.creados} nuevos y ${r.reutilizados} que ya existían '
        '(conservan el nombre que tenían).';
  }

  @override
  Widget build(BuildContext context) {
    final propuesta = _propuesta;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Una línea por estudiante: documento y nombre completo. Sirven coma, '
          'punto y coma o tabulación; correo y programa son opcionales. '
          'Primero revisas la propuesta; nada se guarda sin confirmar.',
          style: AppType.caption.copyWith(color: context.palette.muted),
        ),
        const SizedBox(height: AppSpacing.gapSm),
        TextField(
          key: const Key('matricula-lista'),
          controller: _texto,
          enabled: !_enviando,
          onChanged: _textoCambiado,
          minLines: 5,
          maxLines: 10,
          style: AppType.caption.copyWith(fontFamily: 'monospace'),
          decoration: const InputDecoration(
            hintText:
                '1098765432;ANA MARÍA RODRÍGUEZ\n'
                '1098765433;JUAN CARLOS PÉREZ',
          ),
        ),
        if (propuesta != null) ..._revision(propuesta),
        if (_error != null) _TextoDeError(_error!),
        if (_exito != null) ...[
          const SizedBox(height: AppSpacing.gapSm),
          Row(
            key: const Key('matricula-exito'),
            children: [
              StatusPill.success('Listo', icon: Icons.check),
              const SizedBox(width: AppSpacing.gapSm),
              Expanded(child: Text(_exito!, style: AppType.caption)),
            ],
          ),
        ],
        const SizedBox(height: AppSpacing.gap),
        FilledButton(
          key: const Key('matricula-enviar'),
          onPressed: _enviando || (propuesta != null && propuesta.rows.isEmpty)
              ? null
              : _enviar,
          child: _enviando
              ? const SizedBox(
                  height: 20,
                  width: 20,
                  child: CircularProgressIndicator(strokeWidth: 2.4),
                )
              : Text(
                  propuesta == null
                      ? 'Revisar lista'
                      : 'Matricular ${propuesta.rows.length} en ${widget.grupo.name}',
                ),
        ),
      ],
    );
  }

  List<Widget> _revision(RosterParseResult propuesta) {
    final ocultos = propuesta.errors.length - _erroresVisibles;
    return [
      const SizedBox(height: AppSpacing.gapSm),
      Text(
        '${propuesta.rows.length} listos · ${propuesta.errors.length} con '
        'errores · ${propuesta.duplicates} repetidos',
        key: const Key('matricula-resumen'),
        style: AppType.captionStrong,
      ),
      for (final error in propuesta.errors.take(_erroresVisibles))
        Text('Línea ${error.line}: ${error.reason}', style: AppType.caption),
      if (ocultos > 0)
        Text('y $ocultos líneas más con errores.', style: AppType.caption),
    ];
  }
}

class _TextoDeError extends StatelessWidget {
  final String mensaje;
  const _TextoDeError(this.mensaje);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.gapSm),
      child: Text(
        mensaje,
        style: AppType.caption.copyWith(
          color: SemanticTone.of(context, SemanticKind.danger).fg,
        ),
      ),
    );
  }
}
