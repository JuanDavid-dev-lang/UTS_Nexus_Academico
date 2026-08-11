import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/campus_time.dart';
import '../../../core/data/providers.dart';
import '../../../core/network/api_error.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/ui_kit.dart';

const _tipos = <String, String>{
  'EXAM': 'Parcial',
  'EVALUATION': 'Evaluación',
  'DELIVERY': 'Entrega',
  'ACTIVITY': 'Actividad',
  'MEETING': 'Reunión',
  'TUTORING': 'Tutoría',
  'ACADEMIC': 'Evento académico',
  'REMINDER': 'Recordatorio',
};

const _antelaciones = <int, String>{
  5: '5 min',
  10: '10 min',
  15: '15 min',
  30: '30 min',
  60: '1 hora',
  1440: '1 día',
};

/// Alta de un evento desde el teléfono.
///
/// Cierra el bucle en el sentido Android → servidor → PC: lo que el docente
/// anota en el pasillo aparece en el calendario del escritorio sin que nadie
/// recargue nada, porque la escritura emite `sync:update`.
///
/// Solo eventos. Una clase se edita en el horario, porque una clase es una
/// franja que se repite cada semana; cambiarla «solo hoy» daría la ilusión de
/// una excepción que el modelo no guarda.
class EventSheet extends ConsumerStatefulWidget {
  /// Día preseleccionado, en hora del campus.
  final DateTime diaSugerido;
  final int offsetCampusMinutos;

  const EventSheet({
    super.key,
    required this.diaSugerido,
    required this.offsetCampusMinutos,
  });

  @override
  ConsumerState<EventSheet> createState() => _EventSheetState();
}

class _EventSheetState extends ConsumerState<EventSheet> {
  final _titulo = TextEditingController();
  final _lugar = TextEditingController();
  final _descripcion = TextEditingController();

  String _tipo = 'EXAM';
  String _prioridad = 'MEDIUM';
  String? _materiaId;
  late DateTime _fecha;
  TimeOfDay _hora = const TimeOfDay(hour: 8, minute: 0);
  Set<int> _recordatorios = {60};
  bool _guardando = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final p = partesCampus(widget.diaSugerido, widget.offsetCampusMinutos);
    _fecha = DateTime.utc(p.anio, p.mes, p.dia);
  }

  @override
  void dispose() {
    _titulo.dispose();
    _lugar.dispose();
    _descripcion.dispose();
    super.dispose();
  }

  /// Fecha y hora escritas → instante absoluto, interpretando la hora como del
  /// campus. Con `DateTime.now()` local, un teléfono en otra zona guardaría el
  /// parcial a una hora distinta de la que se tecleó.
  DateTime _instante() {
    return DateTime.utc(_fecha.year, _fecha.month, _fecha.day, _hora.hour, _hora.minute)
        .subtract(Duration(minutes: widget.offsetCampusMinutos));
  }

  Future<void> _guardar() async {
    if (_titulo.text.trim().isEmpty) {
      setState(() => _error = 'Escribe un título.');
      return;
    }

    setState(() {
      _guardando = true;
      _error = null;
    });

    try {
      await ref.read(agendaRepositoryProvider).crearEvento({
        'title': _titulo.text.trim(),
        'description': _descripcion.text.trim(),
        'type': _tipo,
        'startAt': _instante().toIso8601String(),
        if (_materiaId != null) 'subjectId': _materiaId,
        'location': _lugar.text.trim(),
        'priority': _prioridad,
        'reminderMinutes': _recordatorios.toList(),
      });

      ref.invalidate(agendaResumenProvider);
      ref.invalidate(agendaSemanaProvider);
      ref.invalidate(agendaProximaProvider);

      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _guardando = false;
        // Sin conexión no se finge que quedó guardado: un parcial que no llegó
        // al servidor no existe, y descubrirlo el día del parcial es caro.
        _error = ApiError.from(error).message;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;
    final materias = ref.watch(periodSubjectsProvider).valueOrNull ?? const [];

    return Padding(
      // Deja sitio al teclado: sin esto, el campo enfocado queda debajo.
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SafeArea(
        child: SingleChildScrollView(
          padding: AppSpacing.pagePadding,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('Nuevo evento', style: AppType.h3),
              const SizedBox(height: 4),
              Text(
                'Parciales, entregas, tutorías y recordatorios. Las clases se gestionan en el horario.',
                style: AppType.caption.copyWith(color: muted),
              ),
              const SizedBox(height: AppSpacing.gap),

              TextField(
                controller: _titulo,
                autofocus: true,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  labelText: 'Título',
                  hintText: 'Primer parcial de Cálculo I',
                ),
              ),
              const SizedBox(height: 12),

              DropdownButtonFormField<String>(
                value: _tipo,
                decoration: const InputDecoration(labelText: 'Tipo'),
                items: [
                  for (final entrada in _tipos.entries)
                    DropdownMenuItem(value: entrada.key, child: Text(entrada.value)),
                ],
                onChanged: (valor) => setState(() => _tipo = valor ?? 'EXAM'),
              ),
              const SizedBox(height: 12),

              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () async {
                        final elegida = await showDatePicker(
                          context: context,
                          initialDate: _fecha,
                          firstDate: DateTime.utc(_fecha.year - 1),
                          lastDate: DateTime.utc(_fecha.year + 2),
                        );
                        if (elegida != null) {
                          setState(() => _fecha =
                              DateTime.utc(elegida.year, elegida.month, elegida.day));
                        }
                      },
                      icon: const Icon(Icons.event_outlined),
                      label: Text(
                        '${_fecha.day}/${_fecha.month}/${_fecha.year}',
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () async {
                        final elegida =
                            await showTimePicker(context: context, initialTime: _hora);
                        if (elegida != null) setState(() => _hora = elegida);
                      },
                      icon: const Icon(Icons.schedule_outlined),
                      label: Text(
                        '${_hora.hour.toString().padLeft(2, '0')}:'
                        '${_hora.minute.toString().padLeft(2, '0')}',
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text('Hora del campus', style: AppType.caption.copyWith(color: muted)),
              const SizedBox(height: 12),

              DropdownButtonFormField<String?>(
                value: _materiaId,
                decoration: const InputDecoration(labelText: 'Materia (opcional)'),
                items: [
                  const DropdownMenuItem<String?>(value: null, child: Text('Sin materia')),
                  for (final materia in materias)
                    DropdownMenuItem<String?>(value: materia.id, child: Text(materia.name)),
                ],
                onChanged: (valor) => setState(() => _materiaId = valor),
              ),
              const SizedBox(height: 12),

              TextField(
                controller: _lugar,
                decoration: const InputDecoration(labelText: 'Lugar', hintText: 'Aula 304'),
              ),
              const SizedBox(height: 12),

              TextField(
                controller: _descripcion,
                maxLines: 2,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(labelText: 'Descripción (opcional)'),
              ),
              const SizedBox(height: 12),

              DropdownButtonFormField<String>(
                value: _prioridad,
                decoration: const InputDecoration(labelText: 'Prioridad'),
                items: const [
                  DropdownMenuItem(value: 'LOW', child: Text('Baja')),
                  DropdownMenuItem(value: 'MEDIUM', child: Text('Media')),
                  DropdownMenuItem(value: 'HIGH', child: Text('Alta')),
                  DropdownMenuItem(value: 'URGENT', child: Text('Urgente')),
                ],
                onChanged: (valor) => setState(() => _prioridad = valor ?? 'MEDIUM'),
              ),
              const SizedBox(height: AppSpacing.gap),

              Text(
                'RECORDATORIOS',
                style: AppType.captionStrong.copyWith(color: muted, letterSpacing: 0.8),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final entrada in _antelaciones.entries)
                    FilterChip(
                      label: Text(entrada.value),
                      selected: _recordatorios.contains(entrada.key),
                      onSelected: (activo) => setState(() {
                        _recordatorios = {..._recordatorios};
                        if (activo) {
                          _recordatorios.add(entrada.key);
                        } else {
                          _recordatorios.remove(entrada.key);
                        }
                      }),
                    ),
                ],
              ),

              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(
                  _error!,
                  style: AppType.caption.copyWith(
                    color: SemanticTone.of(context, SemanticKind.danger).fg,
                  ),
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
                          : const Text('Crear'),
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

/// Abre la hoja y avisa del resultado. Devuelve `true` si se creó algo.
Future<bool> mostrarHojaDeEvento(
  BuildContext context, {
  required DateTime diaSugerido,
  required int offsetCampusMinutos,
}) async {
  final creado = await showModalBottomSheet<bool>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.92),
    builder: (_) => EventSheet(
      diaSugerido: diaSugerido,
      offsetCampusMinutos: offsetCampusMinutos,
    ),
  );
  return creado == true;
}

