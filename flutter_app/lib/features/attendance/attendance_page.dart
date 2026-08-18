import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/network/api_error.dart';
import '../../core/network/api_client.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/session_menu.dart';

/// Toma de asistencia de una clase.
///
/// Es la pantalla que más se usa con el teléfono en la mano y de pie, así que
/// tres decisiones de rendimiento mandan sobre el resto:
///
///  - **La lista es perezosa.** Antes era un `ListView(children: [...])`, que
///    construye todos sus hijos de golpe: con 40 estudiantes más el historial,
///    cada pulsación en el buscador y cada interruptor rehacían 52 tarjetas
///    para enseñar ocho. Ahora es un `CustomScrollView` con `SliverList` y solo
///    se construye lo que se ve.
///  - **Cada fila se marca sola.** El interruptor vive en la propia fila y no
///    llama a `setState` de la pantalla: marcar una falta repinta una tarjeta,
///    no el salón entero.
///  - **Las tres consultas van a la vez.** Estaban encadenadas —estudiantes,
///    luego materias, luego asistencia—, con la pantalla en blanco mientras
///    tanto. Sobre el wifi de un aula eso era la diferencia entre esperar una
///    vez y esperar tres.
class AttendancePage extends ConsumerStatefulWidget {
  const AttendancePage({super.key});

  @override
  ConsumerState<AttendancePage> createState() => _AttendancePageState();
}

class _AttendancePageState extends ConsumerState<AttendancePage> {
  final _studentSearch = TextEditingController();

  /// Texto de búsqueda ya reposado. Va aparte del controlador a propósito:
  /// escribir mueve el controlador en cada tecla, pero la lista solo se
  /// refiltra cuando el docente deja de escribir.
  String _query = '';
  Timer? _debounce;

  String _period = '2026-1';
  String? _subjectId;
  int _durationMinutes = 90;
  DateTime _date = DateTime.now();
  bool _loading = false;
  List<Map<String, dynamic>> _students = [];
  List<Map<String, dynamic>> _subjects = [];
  List<Map<String, dynamic>> _attendance = [];
  final Map<String, bool> _presentByStudent = {};
  final Map<String, Map<String, dynamic>> _studentById = {};

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
    _debounce?.cancel();
    _studentSearch.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);

    // Las tres a la vez: ninguna depende del resultado de otra salvo la de
    // asistencia, que solo necesita saber la materia — y eso se resuelve con
    // lo que ya hay en pantalla o con la primera del periodo.
    final resultados = await Future.wait([
      ApiClient.instance.get('/students'),
      ApiClient.instance.get('/subjects'),
    ]);

    final items = (resultados[0].data as Map)['items'] as List;
    final subjects = (resultados[1].data as Map)['items'] as List;
    final students = items.map((e) => Map<String, dynamic>.from(e as Map)).toList()
      ..sort((a, b) => (a['code'] ?? '').toString().compareTo((b['code'] ?? '').toString()));
    final allSubjects = subjects.map((e) => Map<String, dynamic>.from(e as Map)).toList();
    final filteredSubjects = allSubjects.where((s) => s['period']?.toString() == _period).toList();
    final subjectId = _subjectId ?? (filteredSubjects.isNotEmpty ? filteredSubjects.first['_id']?.toString() : null);

    final attendanceResp = await ApiClient.instance
        .get('/attendance?period=$_period${subjectId != null ? '&subjectId=$subjectId' : ''}');
    final attendanceItems = (attendanceResp.data as Map)['items'] as List;
    final attendance = attendanceItems.map((e) => Map<String, dynamic>.from(e as Map)).toList();

    _students = students;
    _subjects = filteredSubjects;
    _subjectId = subjectId;
    _attendance = attendance;
    _studentById.clear();
    for (final s in students) {
      _studentById[s['_id'].toString()] = s;
      _presentByStudent.putIfAbsent(s['_id'].toString(), () => true);
    }
    for (final row in attendance) {
      final id = row['studentId']?.toString();
      if (id != null) {
        _presentByStudent[id] = row['present'] != false;
      }
    }
    if (!mounted) return;
    setState(() {
      _loading = false;
      _generacion++;
    });
  }

  double get _attendancePercent {
    var total = 0;
    var present = 0;
    for (final row in _attendance) {
      final minutes = int.tryParse(row['durationMinutes']?.toString() ?? '90') ?? 90;
      total += minutes;
      if (row['present'] == true) present += minutes;
    }
    return total == 0 ? 0 : (present / total) * 100;
  }

  /// Estudiantes que casan con la búsqueda.
  List<Map<String, dynamic>> get _filtrados {
    final q = _query.trim().toLowerCase();
    if (q.isEmpty) return _students;
    return _students.where((s) {
      return (s['code'] ?? '').toString().toLowerCase().contains(q) ||
          (s['fullName'] ?? '').toString().toLowerCase().contains(q);
    }).toList();
  }

  /// Reposa la búsqueda: refiltrar en cada tecla es trabajo que se tira.
  void _buscar(String valor) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 250), () {
      if (mounted && valor != _query) setState(() => _query = valor);
    });
  }

  /// Guarda la lista completa en una sola petición.
  ///
  /// Antes era un POST por estudiante dentro de un bucle: con 40 en el salón,
  /// 40 viajes sobre el wifi de un aula. Y si se cortaba en el estudiante 23,
  /// media lista quedaba guardada sin que nadie lo dijera — ni el docente ni la
  /// propia app sabían dónde se había roto. Ahora entra la clase entera o no
  /// entra, y el error se ve.
  Future<void> _save() async {
    if (_subjectId == null || _students.isEmpty) return;
    setState(() => _loading = true);

    final isoDate =
        DateTime(_date.year, _date.month, _date.day).toIso8601String();

    try {
      await ApiClient.instance.post('/attendance/bulk', data: {
        'subjectId': _subjectId,
        'teacherId': ref.read(authControllerProvider).user?.id ?? '',
        'period': _period,
        'date': isoDate,
        'durationMinutes': _durationMinutes,
        'registros': [
          for (final student in _students)
            {
              'studentId': student['_id'].toString(),
              'present': _presentByStudent[student['_id'].toString()] ?? true,
              'notes': '',
            },
        ],
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _loading = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(ApiError.from(error).message)),
      );
      return;
    }

    await _load();
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Asistencia guardada — ${_students.length} estudiantes'),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final filtrados = _filtrados;
    final historial = _attendance.take(12).toList();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Asistencia'),
        actions: [
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
          DropdownButtonHideUnderline(
            child: DropdownButton<String>(
              value: _period,
              items: const [
                DropdownMenuItem(value: '2026-1', child: Text('2026-1')),
                DropdownMenuItem(value: '2026-2', child: Text('2026-2')),
              ],
              onChanged: (value) async {
                _period = value ?? '2026-1';
                _subjectId = null;
                await _load();
              },
            ),
          ),
          const SessionMenuButton(),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: CustomScrollView(
                slivers: [
                  SliverPadding(
                    padding: AppSpacing.pagePadding,
                    sliver: SliverToBoxAdapter(child: _cabecera()),
                  ),
                  // Perezosa: solo se construyen las filas visibles. Con la
                  // lista eager anterior, cada pulsación del buscador rehacía
                  // las cuarenta.
                  SliverPadding(
                    padding: const EdgeInsets.symmetric(horizontal: AppSpacing.page),
                    sliver: SliverList.builder(
                      itemCount: filtrados.length,
                      itemBuilder: (_, index) {
                        final student = filtrados[index];
                        final id = student['_id'].toString();
                        return _FilaAsistencia(
                          // La generación entra en la clave: al recargar, la
                          // fila se rehace con lo que llegó del servidor en vez
                          // de conservar lo que tuviera marcado.
                          key: ValueKey('$id-$_generacion'),
                          nombre: student['fullName']?.toString() ?? '',
                          detalle: '${student['code'] ?? ''} • ${student['program'] ?? ''}',
                          presente: _presentByStudent[id] ?? true,
                          // Sin `setState`: nada más en la pantalla depende de
                          // esto, así que marcar una falta repinta una tarjeta.
                          onCambio: (valor) => _presentByStudent[id] = valor,
                        );
                      },
                    ),
                  ),
                  SliverPadding(
                    padding: AppSpacing.pagePadding,
                    sliver: SliverToBoxAdapter(
                      child: Padding(
                        padding: const EdgeInsets.only(top: 16, bottom: 8),
                        child: Text('Historial reciente',
                            style: Theme.of(context).textTheme.titleLarge),
                      ),
                    ),
                  ),
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(
                        AppSpacing.page, 0, AppSpacing.page, AppSpacing.page),
                    sliver: SliverList.builder(
                      itemCount: historial.length,
                      itemBuilder: (_, index) => _FilaHistorial(
                        fila: historial[index],
                        estudiante: _studentById[historial[index]['studentId']?.toString()] ?? const {},
                      ),
                    ),
                  ),
                ],
              ),
            ),
    );
  }

  /// Filtros, contadores y acción de guardar.
  Widget _cabecera() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            Chip(label: Text('Clases: ${_attendance.length}')),
            Chip(label: Text('Asistencia: ${_attendancePercent.toStringAsFixed(1)}%')),
            Chip(label: Text('Duración: $_durationMinutes min')),
          ],
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: DropdownButtonFormField<String>(
                initialValue: _subjectId,
                isExpanded: true,
                items: _subjects
                    .map((s) => DropdownMenuItem(
                          value: s['_id'].toString(),
                          child: Text('${s['code'] ?? ''} - ${s['name'] ?? ''}',
                              overflow: TextOverflow.ellipsis),
                        ))
                    .toList(),
                onChanged: (value) async {
                  _subjectId = value;
                  await _load();
                },
                decoration: const InputDecoration(labelText: 'Materia'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: DropdownButtonFormField<int>(
                initialValue: _durationMinutes,
                items: const [
                  DropdownMenuItem(value: 90, child: Text('90 min')),
                  DropdownMenuItem(value: 180, child: Text('180 min')),
                ],
                onChanged: (value) => setState(() => _durationMinutes = value ?? 90),
                decoration: const InputDecoration(labelText: 'Duración'),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _studentSearch,
          onChanged: _buscar,
          decoration: const InputDecoration(
            labelText: 'Buscar estudiante',
            prefixIcon: Icon(Icons.search),
            isDense: true,
          ),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: ListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Fecha'),
                subtitle: Text(_date.toIso8601String().split('T').first),
                trailing: const Icon(Icons.date_range_outlined),
                onTap: () async {
                  final picked = await showDatePicker(
                    context: context,
                    firstDate: DateTime(2020),
                    lastDate: DateTime(2035),
                    initialDate: _date,
                  );
                  if (picked != null) setState(() => _date = picked);
                },
              ),
            ),
            FilledButton(onPressed: _save, child: const Text('Guardar asistencia')),
          ],
        ),
        const SizedBox(height: 12),
      ],
    );
  }
}

/// Una fila de la toma de asistencia.
///
/// Tiene estado propio para que marcar una falta no obligue a reconstruir la
/// pantalla. El padre solo se entera del valor nuevo por `onCambio`, y como no
/// hay nada más en pantalla que dependa de ello, no necesita repintarse.
class _FilaAsistencia extends StatefulWidget {
  final String nombre;
  final String detalle;
  final bool presente;
  final ValueChanged<bool> onCambio;

  const _FilaAsistencia({
    super.key,
    required this.nombre,
    required this.detalle,
    required this.presente,
    required this.onCambio,
  });

  @override
  State<_FilaAsistencia> createState() => _FilaAsistenciaState();
}

class _FilaAsistenciaState extends State<_FilaAsistencia> {
  late bool _presente = widget.presente;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: SwitchListTile(
        title: Text(widget.nombre),
        subtitle: Text(widget.detalle),
        value: _presente,
        onChanged: (valor) {
          setState(() => _presente = valor);
          widget.onCambio(valor);
        },
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
    final tono = SemanticTone.of(
      context,
      presente ? SemanticKind.success : SemanticKind.danger,
    );
    return Card(
      child: ListTile(
        leading: Icon(
          presente ? Icons.check_circle_outline : Icons.cancel_outlined,
          color: tono.fg,
        ),
        title: Text(estudiante['fullName']?.toString() ?? 'Estudiante'),
        subtitle: Text(
          '${fila['date']?.toString().split('T').first ?? ''} • '
          '${fila['durationMinutes'] ?? 90} min',
        ),
        trailing: Text(presente ? 'Presente' : 'Falta'),
      ),
    );
  }
}
