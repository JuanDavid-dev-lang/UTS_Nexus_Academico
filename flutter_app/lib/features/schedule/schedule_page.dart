import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/data/providers.dart';
import '../../core/network/api_error.dart';
import '../../core/services/api_client.dart';
import '../../core/services/schedule_repository.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/period_selector.dart';
import '../../core/widgets/session_menu.dart';
import '../../core/widgets/ui_kit.dart';

final scheduleProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  return ScheduleRepository().list();
});

const _dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

/// Horario semanal del docente.
///
/// Es la fuente de las clases de la agenda: lo que se cambia aquí se aplica a
/// todas las semanas y viaja por `sync:update` al escritorio, que repinta su
/// calendario y reprograma los recordatorios sin que nadie recargue nada.
class SchedulePage extends ConsumerStatefulWidget {
  const SchedulePage({super.key});

  @override
  ConsumerState<SchedulePage> createState() => _SchedulePageState();
}

class _SchedulePageState extends ConsumerState<SchedulePage> {
  List<Map<String, dynamic>> _items = [];
  bool _ordenSucio = false;

  /// Periodo con el que se construyó `_items`.
  ///
  /// La lista se guarda en el estado para poder arrastrarla, así que hay que
  /// saber cuándo lo que hay dentro dejó de corresponder a lo que se pide. Sin
  /// esto, cambiar de semestre no cambiaba nada en pantalla.
  String? _periodoCargado;

  String _dayName(int day) {
    if (day < 1 || day > 7) return 'Día';
    return _dias[day - 1];
  }

  Future<void> _saveOrder() async {
    final payload = {
      'items': [
        for (var i = 0; i < _items.length; i++) {'id': _items[i]['_id'], 'order': i},
      ],
    };
    try {
      await ApiClient.instance.post('/schedules/reorder', data: payload);
      if (!mounted) return;
      setState(() => _ordenSucio = false);
      AppToast.success(context, 'Horario ordenado');
      ref.invalidate(scheduleProvider);
    } catch (error) {
      if (!mounted) return;
      AppToast.error(context, ApiError.from(error).message);
    }
  }

  /// Edita una franja desde el teléfono.
  ///
  /// Cambia la clase de TODAS las semanas, no solo la de hoy: el modelo guarda
  /// franjas semanales y una excepción por fecha no existe. Se dice en la hoja
  /// para que nadie descubra el alcance después de guardar.
  Future<void> _editar(Map<String, dynamic> item) async {
    final guardado = await showModalBottomSheet<bool>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (_) => _EditarFranjaSheet(item: item),
    );

    if (guardado != true || !mounted) return;

    setState(() => _items = []);
    ref.invalidate(scheduleProvider);
    // La agenda depende del horario: sin esto, la pantalla de agenda de este
    // mismo teléfono seguiría mostrando la hora vieja hasta recargarla a mano.
    ref.invalidate(agendaResumenProvider);
    ref.invalidate(agendaSemanaProvider);
    ref.invalidate(agendaProximaProvider);
    AppToast.success(context, 'Clase actualizada');
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(scheduleProvider);
    final periodo = ref.watch(selectedPeriodProvider);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Horario'),
        actions: [
          // El selector de periodo ahora filtra de verdad: el backend manda el
          // periodo de la materia con cada franja. Antes leía un campo que la
          // respuesta no traía, así que nunca descartaba nada.
          const PeriodSelector(),
          if (_ordenSucio)
            TextButton(onPressed: _saveOrder, child: const Text('Guardar orden')),
          const SessionMenuButton(),
        ],
      ),
      body: async.when(
        data: (items) {
          if (_items.isEmpty || _periodoCargado != periodo) {
            _periodoCargado = periodo;
            _ordenSucio = false;
            _items = items
                .where((item) {
                  final suyo = (item['period'] ?? '').toString();
                  // Una franja sin periodo resuelto no se esconde: es un dato
                  // incompleto, no un dato de otro semestre.
                  return suyo.isEmpty || suyo == periodo;
                })
                .toList();
            _items.sort((a, b) {
              final ao = (a['order'] ?? 0) as int;
              final bo = (b['order'] ?? 0) as int;
              if (ao != bo) return ao.compareTo(bo);
              final ad = (a['dayOfWeek'] ?? 1) as int;
              final bd = (b['dayOfWeek'] ?? 1) as int;
              if (ad != bd) return ad.compareTo(bd);
              return (a['startTime'] ?? '').toString().compareTo((b['startTime'] ?? '').toString());
            });
          }

          if (_items.isEmpty) {
            return StateView.empty(
              'No tienes clases en tu horario. Se crean desde el escritorio o desde la administración.',
            );
          }

          return ReorderableListView.builder(
            padding: AppSpacing.pagePadding,
            itemCount: _items.length,
            // onReorderItem ya entrega el índice corregido tras retirar el
            // elemento, así que el ajuste manual de newIndex sobra.
            onReorderItem: (oldIndex, newIndex) {
              setState(() {
                final item = _items.removeAt(oldIndex);
                _items.insert(newIndex, item);
                _ordenSucio = true;
              });
            },
            itemBuilder: (_, i) {
              final item = _items[i];
              final materia = (item['subjectName'] ?? '').toString();
              final aula = (item['classroom'] ?? '').toString();

              return Padding(
                key: ValueKey(item['_id'] ?? i),
                padding: const EdgeInsets.only(bottom: 10),
                child: AppCard(
                  onTap: () => _editar(item),
                  child: Row(
                    children: [
                      const Icon(Icons.drag_handle_outlined),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              materia.isNotEmpty ? materia : 'Clase',
                              style: AppType.bodyStrong,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            const SizedBox(height: 2),
                            Text(
                              '${_dayName((item['dayOfWeek'] ?? 1) as int)} · '
                              '${item['startTime'] ?? ''} - ${item['endTime'] ?? ''}',
                              style: AppType.body,
                            ),
                            const SizedBox(height: 2),
                            Text(
                              [
                                if (aula.isNotEmpty) 'Aula $aula',
                                '${item['durationMinutes'] ?? 90} min',
                                (item['modality'] ?? '').toString(),
                              ].where((t) => t.isNotEmpty).join(' · '),
                              style: AppType.caption.copyWith(color: muted),
                            ),
                          ],
                        ),
                      ),
                      Icon(Icons.edit_outlined, size: 18, color: muted),
                    ],
                  ),
                ),
              );
            },
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        // Nunca se vuelca la excepción cruda: se traduce a una causa accionable
        // y se ofrece reintentar.
        error: (error, _) => StateView.error(
          ApiError.from(error).message,
          action: FilledButton(
            onPressed: () => ref.invalidate(scheduleProvider),
            child: const Text('Reintentar'),
          ),
        ),
      ),
    );
  }
}

/// Edición de una franja: día, horas, aula y modalidad.
class _EditarFranjaSheet extends ConsumerStatefulWidget {
  final Map<String, dynamic> item;
  const _EditarFranjaSheet({required this.item});

  @override
  ConsumerState<_EditarFranjaSheet> createState() => _EditarFranjaSheetState();
}

class _EditarFranjaSheetState extends ConsumerState<_EditarFranjaSheet> {
  late int _dia;
  late TimeOfDay _inicio;
  late TimeOfDay _fin;
  late String _modalidad;
  late final TextEditingController _aula;
  bool _guardando = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _dia = (widget.item['dayOfWeek'] ?? 1) as int;
    _inicio = _leerHora(widget.item['startTime'], const TimeOfDay(hour: 7, minute: 0));
    _fin = _leerHora(widget.item['endTime'], const TimeOfDay(hour: 9, minute: 0));
    _modalidad = (widget.item['modality'] ?? 'PRESENTIAL').toString();
    _aula = TextEditingController(text: (widget.item['classroom'] ?? '').toString());
  }

  @override
  void dispose() {
    _aula.dispose();
    super.dispose();
  }

  static TimeOfDay _leerHora(Object? valor, TimeOfDay porDefecto) {
    final partes = valor?.toString().split(':');
    if (partes == null || partes.length != 2) return porDefecto;
    final h = int.tryParse(partes[0]);
    final m = int.tryParse(partes[1]);
    if (h == null || m == null || h > 23 || m > 59) return porDefecto;
    return TimeOfDay(hour: h, minute: m);
  }

  static String _texto(TimeOfDay hora) =>
      '${hora.hour.toString().padLeft(2, '0')}:${hora.minute.toString().padLeft(2, '0')}';

  int get _duracion => (_fin.hour * 60 + _fin.minute) - (_inicio.hour * 60 + _inicio.minute);

  Future<void> _guardar() async {
    if (_duracion < 30) {
      setState(() => _error = 'La clase debe durar al menos 30 minutos.');
      return;
    }

    setState(() {
      _guardando = true;
      _error = null;
    });

    try {
      await ApiClient.instance.patch('/schedules/${widget.item['_id']}', data: {
        'dayOfWeek': _dia,
        'startTime': _texto(_inicio),
        'endTime': _texto(_fin),
        'durationMinutes': _duracion,
        'classroom': _aula.text.trim(),
        'modality': _modalidad,
      });
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _guardando = false;
        _error = ApiError.from(error).message;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;
    final materia = (widget.item['subjectName'] ?? '').toString();

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SafeArea(
        child: SingleChildScrollView(
          padding: AppSpacing.pagePadding,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(materia.isNotEmpty ? materia : 'Editar clase', style: AppType.h3),
              const SizedBox(height: 4),
              Text(
                'El cambio se aplica a todas las semanas: el horario guarda franjas '
                'semanales, no clases sueltas.',
                style: AppType.caption.copyWith(color: muted),
              ),
              const SizedBox(height: AppSpacing.gap),

              DropdownButtonFormField<int>(
                value: _dia,
                decoration: const InputDecoration(labelText: 'Día'),
                items: [
                  for (var i = 1; i <= 7; i++)
                    DropdownMenuItem(value: i, child: Text(_dias[i - 1])),
                ],
                onChanged: (valor) => setState(() => _dia = valor ?? _dia),
              ),
              const SizedBox(height: 12),

              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () async {
                        final elegida =
                            await showTimePicker(context: context, initialTime: _inicio);
                        if (elegida != null) setState(() => _inicio = elegida);
                      },
                      icon: const Icon(Icons.play_arrow_outlined),
                      label: Text(_texto(_inicio)),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () async {
                        final elegida =
                            await showTimePicker(context: context, initialTime: _fin);
                        if (elegida != null) setState(() => _fin = elegida);
                      },
                      icon: const Icon(Icons.stop_outlined),
                      label: Text(_texto(_fin)),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                _duracion >= 30
                    ? 'Duración: $_duracion minutos · hora del campus'
                    : 'La hora de fin debe ser posterior a la de inicio.',
                style: AppType.caption.copyWith(
                  color: _duracion >= 30
                      ? muted
                      : SemanticTone.of(context, SemanticKind.danger).fg,
                ),
              ),
              const SizedBox(height: 12),

              TextField(
                controller: _aula,
                decoration: const InputDecoration(labelText: 'Aula', hintText: '304'),
              ),
              const SizedBox(height: 12),

              DropdownButtonFormField<String>(
                value: _modalidad,
                decoration: const InputDecoration(labelText: 'Modalidad'),
                items: const [
                  DropdownMenuItem(value: 'PRESENTIAL', child: Text('Presencial')),
                  DropdownMenuItem(value: 'VIRTUAL', child: Text('Virtual')),
                  DropdownMenuItem(value: 'HYBRID', child: Text('Híbrida')),
                ],
                onChanged: (valor) => setState(() => _modalidad = valor ?? _modalidad),
              ),

              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(
                  _error!,
                  style: AppType.caption
                      .copyWith(color: SemanticTone.of(context, SemanticKind.danger).fg),
                ),
              ],

              const SizedBox(height: AppSpacing.gap),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _guardando ? null : () => Navigator.of(context).pop(),
                      child: const Text('Cancelar'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: FilledButton(
                      onPressed: _guardando ? null : _guardar,
                      child: _guardando
                          ? const SizedBox(
                              height: 18,
                              width: 18,
                              child: CircularProgressIndicator(strokeWidth: 2.2),
                            )
                          : const Text('Guardar'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
            ],
          ),
        ),
      ),
    );
  }
}
