import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/data/providers.dart';
import '../../core/network/api_error.dart';
import '../../core/network/api_client.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/compact.dart';
import '../../core/widgets/debounced_search_field.dart';
import '../../core/widgets/session_menu.dart';
import '../../core/widgets/ui_kit.dart';

/// Toma de asistencia de una clase.
///
/// Es la pantalla que más se usa con el teléfono en la mano y de pie, así que
/// manda la velocidad de pasar lista:
///
///  - **La lista es perezosa.** `SliverList.builder`: solo se construye lo que
///    se ve. Con la lista eager anterior, cada pulsación del buscador rehacía
///    las cuarenta filas para enseñar ocho.
///  - **Cada fila se marca sola.** El control vive en la propia fila y no llama
///    a `setState` de la pantalla; lo único que sube es el recuento, y eso lo
///    escucha un `ValueListenableBuilder` en la barra inferior.
///  - **El resumen está fijo abajo.** Sin él, el docente termina de pasar lista
///    de treinta y no sabe si marcó a los treinta o a veintiocho hasta que
///    guarda. Ahí abajo el recuento está a la vista todo el rato y el botón
///    dice cuántos va a guardar.
///  - **Tres estados y no dos.** Presente, tarde y ausente. Con un interruptor
///    de dos posiciones no había forma de registrar un retraso, y sin retraso
///    el patrón de tardanzas repetidas es indetectable.
class AttendancePage extends ConsumerStatefulWidget {
  const AttendancePage({super.key});

  @override
  ConsumerState<AttendancePage> createState() => _AttendancePageState();
}

/// Cómo llegó un estudiante a una clase.
enum Marca { presente, tarde, ausente }

/// Minutos que se asumen al marcar «tarde» sin precisar cuántos.
///
/// Es un valor por defecto de captura, no una regla: el umbral que decide si
/// una llegada cuenta como tardanza vive en `domains/attendance/patterns.ts`.
/// Diez es lo que un docente reconoce como «llegó tarde» sin tener que mirar
/// el reloj; se puede ajustar manteniendo pulsado el botón.
const int _minutosTardeDefecto = 10;

class _AttendancePageState extends ConsumerState<AttendancePage> {
  final _studentSearch = TextEditingController();

  /// Texto de búsqueda ya reposado. `DebouncedSearchField` avisa solo cuando el
  /// docente deja de escribir, así que la lista no se refiltra en cada tecla.
  String _query = '';

  String? _subjectId;
  int _durationMinutes = 90;
  DateTime _date = DateTime.now();
  bool _loading = false;
  bool _guardando = false;
  List<Map<String, dynamic>> _students = [];
  List<Map<String, dynamic>> _subjects = [];
  List<Map<String, dynamic>> _attendance = [];
  final Map<String, Marca> _marcas = {};
  final Map<String, int> _minutosTarde = {};
  final Map<String, Map<String, dynamic>> _studentById = {};

  /// Recuento en vivo para la barra inferior.
  ///
  /// Un `ValueNotifier` y no `setState`: marcar a un estudiante tiene que
  /// repintar su fila y el resumen, no la pantalla entera con su lista de
  /// cuarenta.
  final ValueNotifier<({int presentes, int tarde, int ausentes})> _recuento =
      ValueNotifier((presentes: 0, tarde: 0, ausentes: 0));

  /// Cambia con cada recarga. Forma parte de la clave de cada fila, así que al
  /// recargar las filas se rehacen con el valor que acaba de llegar del
  /// servidor en vez de conservar el que tenían marcado.
  int _generacion = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _studentSearch.dispose();
    _recuento.dispose();
    super.dispose();
  }

  String get _period => ref.read(selectedPeriodProvider);

  Future<void> _load() async {
    setState(() => _loading = true);

    // Las dos a la vez: ninguna depende del resultado de la otra. Encadenadas
    // —estudiantes, luego materias— la pantalla se quedaba en blanco el doble
    // de tiempo sobre el wifi de un aula.
    final resultados = await Future.wait([
      ApiClient.instance.get('/students'),
      ApiClient.instance.get('/subjects'),
    ]);

    final items = (resultados[0].data as Map)['items'] as List;
    final subjects = (resultados[1].data as Map)['items'] as List;
    final students = items.map((e) => Map<String, dynamic>.from(e as Map)).toList()
      ..sort((a, b) =>
          (a['code'] ?? '').toString().compareTo((b['code'] ?? '').toString()));
    final allSubjects =
        subjects.map((e) => Map<String, dynamic>.from(e as Map)).toList();
    final filteredSubjects =
        allSubjects.where((s) => s['period']?.toString() == _period).toList();
    final subjectId = _subjectId ??
        (filteredSubjects.isNotEmpty ? filteredSubjects.first['_id']?.toString() : null);

    final attendanceResp = await ApiClient.instance.get(
      '/attendance?period=$_period${subjectId != null ? '&subjectId=$subjectId' : ''}',
    );
    final attendanceItems = (attendanceResp.data as Map)['items'] as List;
    final attendance =
        attendanceItems.map((e) => Map<String, dynamic>.from(e as Map)).toList();

    _students = students;
    _subjects = filteredSubjects;
    _subjectId = subjectId;
    _attendance = attendance;
    _studentById.clear();
    for (final estudiante in students) {
      final id = estudiante['_id'].toString();
      _studentById[id] = estudiante;
      _marcas.putIfAbsent(id, () => Marca.presente);
    }
    // Lo ya registrado manda sobre el valor por defecto: reabrir una clase que
    // ya se pasó tiene que mostrar lo que se guardó, no todo presente.
    for (final fila in attendance) {
      final id = fila['studentId']?.toString();
      if (id == null) continue;
      final tarde = int.tryParse(fila['lateMinutes']?.toString() ?? '0') ?? 0;
      _marcas[id] = fila['present'] == false
          ? Marca.ausente
          : (tarde > 0 ? Marca.tarde : Marca.presente);
      if (tarde > 0) _minutosTarde[id] = tarde;
    }

    if (!mounted) return;
    setState(() {
      _loading = false;
      _generacion++;
    });
    _recalcularResumen();
  }

  void _recalcularResumen() {
    var presentes = 0;
    var tarde = 0;
    var ausentes = 0;
    for (final estudiante in _students) {
      switch (_marcas[estudiante['_id'].toString()] ?? Marca.presente) {
        case Marca.presente:
          presentes += 1;
        case Marca.tarde:
          tarde += 1;
        case Marca.ausente:
          ausentes += 1;
      }
    }
    _recuento.value = (presentes: presentes, tarde: tarde, ausentes: ausentes);
  }

  /// Porcentaje de la clase ya registrada. Lo calcula el backend para el
  /// consolidado; esta cifra es solo el historial visible en pantalla.
  double get _porcentajeHistorico {
    var total = 0;
    var presente = 0;
    for (final fila in _attendance) {
      final minutos = int.tryParse(fila['durationMinutes']?.toString() ?? '90') ?? 90;
      total += minutos;
      if (fila['present'] == true) presente += minutos;
    }
    return total == 0 ? 0 : (presente / total) * 100;
  }

  List<Map<String, dynamic>> get _filtrados {
    final q = _query.trim().toLowerCase();
    if (q.isEmpty) return _students;
    return _students.where((s) {
      return (s['code'] ?? '').toString().toLowerCase().contains(q) ||
          (s['fullName'] ?? '').toString().toLowerCase().contains(q);
    }).toList();
  }

  /// Marca a todos como presentes.
  ///
  /// Es el gesto real de un salón: casi todos vinieron, y lo que el docente
  /// hace es señalar las excepciones. Sin este botón hay que confirmar treinta
  /// veces lo que ya era el valor por defecto.
  void _marcarTodosPresentes() {
    for (final estudiante in _students) {
      _marcas[estudiante['_id'].toString()] = Marca.presente;
    }
    setState(() => _generacion++);
    _recalcularResumen();
  }

  /// Guarda la lista completa en una sola petición.
  ///
  /// Antes era un POST por estudiante dentro de un bucle: con 40 en el salón,
  /// 40 viajes sobre el wifi de un aula. Y si se cortaba en el 23, media lista
  /// quedaba guardada sin que nadie lo dijera. Ahora entra la clase entera o no
  /// entra, y el error se ve.
  Future<void> _guardar() async {
    if (_subjectId == null || _students.isEmpty) return;

    final resumen = _recuento.value;

    // Confirmación antes de escribir: la asistencia entra en el consolidado y
    // en el riesgo, y una fecha equivocada se descubre semanas después.
    final confirmado = await showDialog<bool>(
      context: context,
      builder: (contextoDialogo) => AlertDialog(
        title: const Text('¿Guardar la asistencia?'),
        content: Text(
          'Clase del ${_date.toIso8601String().split('T').first}, '
          '$_durationMinutes minutos.\n\n'
          '${resumen.presentes} presentes · ${resumen.tarde} con retraso · '
          '${resumen.ausentes} ausentes.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(contextoDialogo).pop(false),
            child: const Text('Revisar'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(contextoDialogo).pop(true),
            child: const Text('Guardar'),
          ),
        ],
      ),
    );
    if (confirmado != true) return;

    setState(() => _guardando = true);

    final isoDate = DateTime(_date.year, _date.month, _date.day).toIso8601String();

    try {
      await ApiClient.instance.post('/attendance/bulk', data: {
        'subjectId': _subjectId,
        'teacherId': ref.read(authControllerProvider).user?.id ?? '',
        'period': _period,
        'date': isoDate,
        'durationMinutes': _durationMinutes,
        'registros': [
          for (final estudiante in _students)
            () {
              final id = estudiante['_id'].toString();
              final marca = _marcas[id] ?? Marca.presente;
              return {
                'studentId': id,
                'present': marca != Marca.ausente,
                // El retraso solo viaja cuando se marcó tarde: mandarlo en 0
                // para todos es correcto, pero deja el campo lleno de ceros que
                // no significan nada.
                'lateMinutes': marca == Marca.tarde
                    ? (_minutosTarde[id] ?? _minutosTardeDefecto)
                    : 0,
                'notes': '',
              };
            }(),
        ],
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _guardando = false);
      // El 409 de periodo cerrado llega aquí con su mensaje ya explicado por
      // el backend; no hay que traducirlo.
      AppToast.error(context, 'No se guardó', ApiError.from(error).message);
      return;
    }

    await _load();
    if (mounted) {
      setState(() => _guardando = false);
      AppToast.success(
        context,
        'Asistencia guardada',
        '${_students.length} estudiantes registrados.',
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final filtrados = _filtrados;
    final periodoAbierto = ref.watch(periodoActivoAbiertoProvider);
    final periodo = ref.watch(selectedPeriodProvider);

    return Scaffold(
      appBar: CompactHeader(
        titulo: 'Asistencia',
        contexto: periodo,
        acciones: [
          IconButton(
            icon: const Icon(Icons.document_scanner_outlined),
            tooltip: 'Importar desde una foto',
            onPressed: () async {
              final importado = await context.push<bool>('/attendance/scan');
              // Solo se recarga si de verdad se guardó algo: volver sin
              // importar no debería costar una consulta.
              if (importado == true && mounted) await _load();
            },
          ),
          const SessionMenuButton(),
        ],
      ),
      body: _loading
          ? const Padding(
              padding: AppSpacing.listPadding,
              child: SkeletonRows(filas: 8),
            )
          : RefreshIndicator(
              onRefresh: _load,
              child: CustomScrollView(
                slivers: [
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(
                      AppSpacing.page,
                      AppSpacing.gapSm,
                      AppSpacing.page,
                      AppSpacing.gapSm,
                    ),
                    sliver: SliverToBoxAdapter(
                      child: _cabecera(periodoAbierto: periodoAbierto),
                    ),
                  ),

                  SliverPadding(
                    padding:
                        const EdgeInsets.symmetric(horizontal: AppSpacing.page),
                    sliver: SliverList.separated(
                      itemCount: filtrados.length,
                      separatorBuilder: (_, __) =>
                          const SizedBox(height: AppSpacing.gapSm),
                      itemBuilder: (_, indice) {
                        final estudiante = filtrados[indice];
                        final id = estudiante['_id'].toString();
                        return _FilaAsistencia(
                          // La generación entra en la clave: al recargar, la
                          // fila se rehace con lo que llegó del servidor en
                          // vez de conservar lo que tuviera marcado.
                          key: ValueKey('$id-$_generacion'),
                          nombre: estudiante['fullName']?.toString() ?? '',
                          codigo: estudiante['code']?.toString() ?? '',
                          programa: estudiante['program']?.toString() ?? '',
                          marca: _marcas[id] ?? Marca.presente,
                          minutosTarde: _minutosTarde[id] ?? _minutosTardeDefecto,
                          habilitada: periodoAbierto,
                          onCambio: (marca, minutos) {
                            _marcas[id] = marca;
                            if (minutos != null) _minutosTarde[id] = minutos;
                            // Solo el resumen: la lista no se reconstruye.
                            _recalcularResumen();
                          },
                        );
                      },
                    ),
                  ),

                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(
                      AppSpacing.page,
                      AppSpacing.gap,
                      AppSpacing.page,
                      AppSpacing.gapSm,
                    ),
                    sliver: SliverToBoxAdapter(
                      child: CompactSectionHeader(
                        'Historial reciente · ${_porcentajeHistorico.toStringAsFixed(1)}%',
                      ),
                    ),
                  ),
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(
                      AppSpacing.page,
                      0,
                      AppSpacing.page,
                      AppSpacing.tapTarget,
                    ),
                    sliver: SliverList.separated(
                      itemCount: _attendance.length > 12 ? 12 : _attendance.length,
                      separatorBuilder: (_, __) =>
                          const SizedBox(height: AppSpacing.gapSm),
                      itemBuilder: (_, indice) => _FilaHistorial(
                        fila: _attendance[indice],
                        estudiante: _studentById[
                                _attendance[indice]['studentId']?.toString()] ??
                            const {},
                      ),
                    ),
                  ),
                ],
              ),
            ),

      // El resumen fijo: siempre a la vista mientras se pasa lista.
      bottomNavigationBar: _loading
          ? null
          : ValueListenableBuilder<({int presentes, int tarde, int ausentes})>(
              valueListenable: _recuento,
              builder: (_, resumen, __) => StickySummaryBar(
                metricas: [
                  (
                    etiqueta: 'Presentes',
                    valor: '${resumen.presentes}',
                    tono: SemanticKind.success
                  ),
                  (
                    etiqueta: 'Tarde',
                    valor: '${resumen.tarde}',
                    tono: SemanticKind.warning
                  ),
                  (
                    etiqueta: 'Ausentes',
                    valor: '${resumen.ausentes}',
                    tono: SemanticKind.danger
                  ),
                ],
                etiquetaAccion: 'Guardar ${_students.length}',
                cargando: _guardando,
                onAccion: periodoAbierto && _subjectId != null ? _guardar : null,
              ),
            ),
    );
  }

  /// Filtros y acciones de la clase.
  Widget _cabecera({required bool periodoAbierto}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!periodoAbierto)
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.gapSm),
            child: CompactEmpty(
              icono: Icons.lock_outline,
              mensaje:
                  'El periodo $_period no admite cambios de asistencia. Para '
                  'modificarlo hay que reabrirlo desde la administración.',
            ),
          ),

        Row(
          children: [
            Expanded(
              child: DropdownButtonFormField<String>(
                initialValue: _subjectId,
                isExpanded: true,
                items: _subjects
                    .map((s) => DropdownMenuItem(
                          value: s['_id'].toString(),
                          child: Text(
                            '${s['code'] ?? ''} · ${s['name'] ?? ''}',
                            overflow: TextOverflow.ellipsis,
                          ),
                        ))
                    .toList(),
                onChanged: (value) async {
                  _subjectId = value;
                  await _load();
                },
                decoration: const InputDecoration(
                  labelText: 'Materia',
                  isDense: true,
                ),
              ),
            ),
            const SizedBox(width: AppSpacing.gapSm),
            SizedBox(
              width: 110,
              child: DropdownButtonFormField<int>(
                initialValue: _durationMinutes,
                items: const [
                  DropdownMenuItem(value: 90, child: Text('90 min')),
                  DropdownMenuItem(value: 180, child: Text('180 min')),
                ],
                onChanged: (value) =>
                    setState(() => _durationMinutes = value ?? 90),
                decoration: const InputDecoration(
                  labelText: 'Duración',
                  isDense: true,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.gapSm),

        DebouncedSearchField(
          controller: _studentSearch,
          labelText: 'Buscar estudiante',
          onChanged: (valor) => setState(() => _query = valor),
        ),
        const SizedBox(height: AppSpacing.gapSm),

        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: () async {
                  final elegida = await showDatePicker(
                    context: context,
                    firstDate: DateTime(2020),
                    lastDate: DateTime(2035),
                    initialDate: _date,
                  );
                  if (elegida != null) setState(() => _date = elegida);
                },
                icon: const Icon(Icons.date_range_outlined, size: 18),
                label: Text(_date.toIso8601String().split('T').first),
              ),
            ),
            const SizedBox(width: AppSpacing.gapSm),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: periodoAbierto ? _marcarTodosPresentes : null,
                icon: const Icon(Icons.done_all_outlined, size: 18),
                label: const Text('Todos presentes'),
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.gapSm),
      ],
    );
  }
}

/// Una fila de la toma de asistencia.
///
/// Tiene estado propio para que marcar una falta no obligue a reconstruir la
/// pantalla. El padre solo se entera del valor nuevo por `onCambio`, que
/// actualiza el recuento de la barra inferior a través de un `ValueNotifier`.
class _FilaAsistencia extends StatefulWidget {
  final String nombre;
  final String codigo;
  final String programa;
  final Marca marca;
  final int minutosTarde;
  final bool habilitada;
  final void Function(Marca marca, int? minutos) onCambio;

  const _FilaAsistencia({
    super.key,
    required this.nombre,
    required this.codigo,
    required this.programa,
    required this.marca,
    required this.minutosTarde,
    required this.habilitada,
    required this.onCambio,
  });

  @override
  State<_FilaAsistencia> createState() => _FilaAsistenciaState();
}

class _FilaAsistenciaState extends State<_FilaAsistencia> {
  late Marca _marca = widget.marca;
  late int _minutos = widget.minutosTarde;

  void _elegir(Marca marca) {
    setState(() => _marca = marca);
    widget.onCambio(marca, marca == Marca.tarde ? _minutos : null);
  }

  /// Ajuste fino del retraso, manteniendo pulsado «Tarde».
  ///
  /// No es un campo en la fila: en un salón de treinta, treinta campos de
  /// texto son treinta oportunidades de abrir el teclado sin querer. El valor
  /// por defecto cubre el caso normal y esto el excepcional.
  Future<void> _ajustarMinutos() async {
    final elegido = await showCompactSheet<int>(
      context: context,
      titulo: 'Minutos de retraso',
      subtitulo: widget.nombre,
      constructor: (contextoHoja) => Wrap(
        spacing: AppSpacing.gapSm,
        runSpacing: AppSpacing.gapSm,
        children: [
          for (final minutos in const [5, 10, 15, 20, 30, 45, 60])
            FilterChipCompact(
              etiqueta: '$minutos min',
              activo: _minutos == minutos,
              onTap: () => Navigator.of(contextoHoja).pop(minutos),
            ),
        ],
      ),
    );
    if (elegido == null) return;
    setState(() {
      _minutos = elegido;
      _marca = Marca.tarde;
    });
    widget.onCambio(Marca.tarde, elegido);
  }

  @override
  Widget build(BuildContext context) {
    return AcademicRow(
      titulo: widget.nombre,
      metadatos: [
        widget.codigo,
        if (_marca == Marca.tarde) '$_minutos min tarde' else widget.programa,
      ],
      avatar: InitialsAvatar(widget.nombre, size: 30),
      acento: switch (_marca) {
        Marca.presente => null,
        Marca.tarde => SemanticKind.warning,
        Marca.ausente => SemanticKind.danger,
      },
      estado: _SelectorDeMarca(
        marca: _marca,
        habilitado: widget.habilitada,
        onElegir: _elegir,
        onAjustarTarde: _ajustarMinutos,
      ),
    );
  }
}

/// Tres botones: presente, tarde, ausente.
///
/// En vez del interruptor anterior, que solo tenía dos posiciones y por tanto
/// no podía registrar un retraso. Cada botón mide 36×36 dentro de un área
/// pulsable de 44, que es el mínimo accesible.
class _SelectorDeMarca extends StatelessWidget {
  final Marca marca;
  final bool habilitado;
  final ValueChanged<Marca> onElegir;
  final VoidCallback onAjustarTarde;

  const _SelectorDeMarca({
    required this.marca,
    required this.habilitado,
    required this.onElegir,
    required this.onAjustarTarde,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        _Boton(
          icono: Icons.check,
          etiqueta: 'Presente',
          activo: marca == Marca.presente,
          tono: SemanticKind.success,
          habilitado: habilitado,
          onTap: () => onElegir(Marca.presente),
        ),
        const SizedBox(width: AppSpacing.gapXs),
        _Boton(
          icono: Icons.schedule,
          etiqueta: 'Tarde',
          activo: marca == Marca.tarde,
          tono: SemanticKind.warning,
          habilitado: habilitado,
          onTap: () => onElegir(Marca.tarde),
          onLongPress: onAjustarTarde,
        ),
        const SizedBox(width: AppSpacing.gapXs),
        _Boton(
          icono: Icons.close,
          etiqueta: 'Ausente',
          activo: marca == Marca.ausente,
          tono: SemanticKind.danger,
          habilitado: habilitado,
          onTap: () => onElegir(Marca.ausente),
        ),
      ],
    );
  }
}

class _Boton extends StatelessWidget {
  final IconData icono;
  final String etiqueta;
  final bool activo;
  final SemanticKind tono;
  final bool habilitado;
  final VoidCallback onTap;
  final VoidCallback? onLongPress;

  const _Boton({
    required this.icono,
    required this.etiqueta,
    required this.activo,
    required this.tono,
    required this.habilitado,
    required this.onTap,
    this.onLongPress,
  });

  @override
  Widget build(BuildContext context) {
    final resuelto = SemanticTone.of(context, tono);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;

    return Semantics(
      button: true,
      selected: activo,
      label: etiqueta,
      child: InkWell(
        borderRadius: BorderRadius.circular(AppSpacing.radiusInput),
        onTap: habilitado ? onTap : null,
        onLongPress: habilitado ? onLongPress : null,
        child: Container(
          // 40 visibles dentro del área de 44 que garantiza el `InkWell` con
          // el `visualDensity` del tema: la densidad no se gana encogiendo lo
          // que hay que tocar.
          width: 40,
          height: 40,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: activo ? resuelto.bg : Colors.transparent,
            borderRadius: BorderRadius.circular(AppSpacing.radiusInput),
          ),
          child: Icon(
            icono,
            size: 18,
            color: activo ? resuelto.fg : muted.withValues(alpha: habilitado ? 1 : 0.4),
          ),
        ),
      ),
    );
  }
}

/// Una clase ya registrada, en el historial.
class _FilaHistorial extends StatelessWidget {
  final Map<String, dynamic> fila;
  final Map<String, dynamic> estudiante;

  const _FilaHistorial({required this.fila, required this.estudiante});

  @override
  Widget build(BuildContext context) {
    final presente = fila['present'] == true;
    final tarde = int.tryParse(fila['lateMinutes']?.toString() ?? '0') ?? 0;

    return AcademicRow(
      titulo: estudiante['fullName']?.toString() ?? 'Estudiante',
      metadatos: [
        fila['date']?.toString().split('T').first ?? '',
        '${fila['durationMinutes'] ?? 90} min',
        if (tarde > 0) '$tarde min tarde',
      ],
      acento: presente
          ? (tarde > 0 ? SemanticKind.warning : null)
          : SemanticKind.danger,
      estado: presente
          ? (tarde > 0
              ? StatusPill.warning('Tarde')
              : StatusPill.success('Presente'))
          : StatusPill.danger('Falta'),
    );
  }
}
