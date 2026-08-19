import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/data/campus_time.dart';
import '../../core/data/providers.dart';
import './data/agenda_models.dart';
import '../../core/network/api_error.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/session_menu.dart';
import '../../core/widgets/ui_kit.dart';
import './widgets/event_sheet.dart';
import './widgets/next_class_card.dart';

/// Agenda académica en el teléfono.
///
/// No es la pantalla de escritorio encogida: aquí no hay rejilla semanal de
/// siete columnas —en 360dp cada columna tendría 45px y no cabría el nombre de
/// una materia—. Lo que manda es la clase actual, la siguiente y la agenda del
/// día; la semana se recorre como una lista agrupada por día.
class AgendaPage extends ConsumerStatefulWidget {
  /// Elemento a destacar al abrir, por ejemplo desde una notificación.
  final String? itemDestacado;

  const AgendaPage({super.key, this.itemDestacado});

  @override
  ConsumerState<AgendaPage> createState() => _AgendaPageState();
}

class _AgendaPageState extends ConsumerState<AgendaPage> {
  int _pestana = 0;
  Timer? _reloj;
  DateTime _ahora = DateTime.now().toUtc();

  @override
  void initState() {
    super.initState();
    _reloj = Timer.periodic(const Duration(seconds: 60), (_) {
      if (mounted) setState(() => _ahora = DateTime.now().toUtc());
    });

    if (widget.itemDestacado != null) {
      // Tras el primer fotograma: el diálogo necesita un Navigator montado.
      WidgetsBinding.instance.addPostFrameCallback((_) => _abrirDestacado());
    }
  }

  @override
  void dispose() {
    _reloj?.cancel();
    super.dispose();
  }

  Future<void> _abrirDestacado() async {
    final destacado = widget.itemDestacado;
    if (destacado == null) return;
    final rango = await ref.read(agendaProximaProvider.future);
    if (!mounted) return;
    for (final item in rango.items) {
      if (item.id != destacado) continue;
      _mostrarDetalle(item, rango.offsetCampusMinutos);
      return;
    }
  }

  void _mostrarDetalle(AgendaItem item, int offset) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (_) => _DetalleAgenda(item: item, offset: offset),
    );
  }

  Future<void> _nuevoEvento() async {
    // El día que se está mirando, no siempre hoy: si el docente está en la
    // semana que viene, el evento nuevo empieza ahí.
    final ancla = ref.read(agendaAnclaProvider);
    final offset = ref.read(agendaProximaProvider).valueOrNull?.offsetCampusMinutos ??
        offsetCampusPorDefecto;

    final creado = await mostrarHojaDeEvento(
      context,
      diaSugerido: _pestana == 1 ? ancla : _ahora,
      offsetCampusMinutos: offset,
    );

    if (!creado || !mounted) return;
    AppToast.success(context, 'Evento creado');
  }

  void _moverSemana(int pasos) {
    final actual = ref.read(agendaAnclaProvider);
    ref.read(agendaAnclaProvider.notifier).state =
        actual.add(Duration(days: 7 * pasos));
  }

  @override
  Widget build(BuildContext context) {
    final ancla = ref.watch(agendaAnclaProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Agenda'),
        actions: [
          IconButton(
            tooltip: 'Hoy',
            icon: const Icon(Icons.today_outlined),
            onPressed: () =>
                ref.read(agendaAnclaProvider.notifier).state = DateTime.now().toUtc(),
          ),
          const SessionMenuButton(),
        ],
      ),
      // Crear desde el teléfono cierra el bucle Android → servidor → PC: lo que
      // el docente anota en el pasillo aparece en el calendario del escritorio
      // sin que nadie recargue nada.
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _nuevoEvento,
        icon: const Icon(Icons.add),
        label: const Text('Evento'),
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(agendaResumenProvider);
          ref.invalidate(agendaSemanaProvider);
          ref.invalidate(agendaProximaProvider);
          await ref.read(agendaResumenProvider.future);
        },
        child: ListView(
          padding: AppSpacing.pagePadding,
          children: [
            NextClassCard(onVerAgenda: () => setState(() => _pestana = 0)),
            const SizedBox(height: AppSpacing.gap),
            SegmentedButton<int>(
              segments: const [
                ButtonSegment(value: 0, label: Text('Hoy'), icon: Icon(Icons.today_outlined)),
                ButtonSegment(value: 1, label: Text('Semana'), icon: Icon(Icons.view_week_outlined)),
                ButtonSegment(value: 2, label: Text('Próximas'), icon: Icon(Icons.upcoming_outlined)),
              ],
              selected: {_pestana},
              onSelectionChanged: (valores) => setState(() => _pestana = valores.first),
            ),
            const SizedBox(height: AppSpacing.gap),
            if (_pestana == 1) _cabeceraSemana(ancla),
            _contenido(),
          ],
        ),
      ),
    );
  }

  Widget _cabeceraSemana(DateTime ancla) {
    final lunes = inicioSemanaCampus(ancla, offsetCampusPorDefecto);
    final domingo = lunes.add(const Duration(days: 6));
    final p1 = partesCampus(lunes, offsetCampusPorDefecto);
    final p2 = partesCampus(domingo, offsetCampusPorDefecto);

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.gap),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.chevron_left),
            tooltip: 'Semana anterior',
            onPressed: () => _moverSemana(-1),
          ),
          Expanded(
            child: Text(
              p1.mes == p2.mes
                  ? '${p1.dia} – ${p2.dia} de ${nombreMesCampus(lunes, offsetCampusPorDefecto)}'
                  : '${p1.dia} ${nombreMesCampus(lunes, offsetCampusPorDefecto)} – '
                      '${p2.dia} ${nombreMesCampus(domingo, offsetCampusPorDefecto)}',
              textAlign: TextAlign.center,
              style: AppType.bodyStrong,
            ),
          ),
          IconButton(
            icon: const Icon(Icons.chevron_right),
            tooltip: 'Semana siguiente',
            onPressed: () => _moverSemana(1),
          ),
        ],
      ),
    );
  }

  Widget _contenido() {
    // "Hoy" y "Próximas" salen del mismo rango: una sola petición para las dos
    // pestañas en vez de una por pestaña.
    final origen = _pestana == 1 ? agendaSemanaProvider : agendaProximaProvider;
    final async = ref.watch(origen);

    return async.when(
      loading: () => const Column(
        children: [
          SkeletonBox(height: 72),
          SizedBox(height: 8),
          SkeletonBox(height: 72),
          SizedBox(height: 8),
          SkeletonBox(height: 72),
        ],
      ),
      error: (error, _) => StateView.error(
        ApiError.from(error).message,
        action: FilledButton(
          onPressed: () => ref.invalidate(origen),
          child: const Text('Reintentar'),
        ),
      ),
      data: (rango) {
        final offset = rango.offsetCampusMinutos;
        var items = rango.items;

        if (_pestana == 0) {
          final hoy = fechaCampus(_ahora, offset);
          items = items.where((item) => item.fecha == hoy).toList();
        } else if (_pestana == 2) {
          items = items.where((item) => item.fin.isAfter(_ahora)).toList();
        }

        if (items.isEmpty) {
          return StateView.empty(
            _pestana == 0
                ? 'No tienes clases ni eventos hoy.'
                : _pestana == 1
                    ? 'No hay nada programado esta semana.'
                    : 'No queda nada pendiente en los próximos días.',
          );
        }

        // Agrupado por día: en un teléfono, una lista corrida de cuarenta
        // clases sin separadores es imposible de ubicar.
        final porFecha = <String, List<AgendaItem>>{};
        for (final item in items) {
          porFecha.putIfAbsent(item.fecha, () => []).add(item);
        }

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (final entrada in porFecha.entries) ...[
              if (_pestana != 0) _separadorDia(entrada.key, offset),
              for (final item in entrada.value) ...[
                _FilaAgenda(
                  item: item,
                  offset: offset,
                  onTap: () => _mostrarDetalle(item, offset),
                ),
                const SizedBox(height: 8),
              ],
            ],
          ],
        );
      },
    );
  }

  Widget _separadorDia(String fecha, int offset) {
    // Mediodía UTC para que el nombre del día no baile con el desfase.
    final referencia = DateTime.tryParse('${fecha}T12:00:00Z')?.toUtc();
    final texto = referencia == null ? fecha : fechaLargaCampus(referencia, 0);
    final esHoy = referencia != null && fecha == fechaCampus(_ahora, offset);
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Padding(
      padding: const EdgeInsets.only(top: 8, bottom: 8),
      child: Text(
        esHoy ? 'HOY · ${texto.toUpperCase()}' : texto.toUpperCase(),
        style: AppType.captionStrong.copyWith(
          letterSpacing: 0.8,
          color: esHoy
              ? Theme.of(context).colorScheme.primary
              : (isDark ? AppColors.textMutedDark : AppColors.textMuted),
        ),
      ),
    );
  }
}

/// Icono y tono semántico de cada tipo. Se declara el significado, no el color.
({IconData icono, SemanticKind tono}) _aspecto(AgendaTipo tipo) {
  switch (tipo) {
    case AgendaTipo.clase:
      return (icono: Icons.menu_book_outlined, tono: SemanticKind.brand);
    case AgendaTipo.parcial:
    case AgendaTipo.evaluacion:
      return (icono: Icons.school_outlined, tono: SemanticKind.danger);
    case AgendaTipo.entrega:
      return (icono: Icons.upload_file_outlined, tono: SemanticKind.warning);
    case AgendaTipo.tutoria:
    case AgendaTipo.academico:
      return (icono: Icons.handshake_outlined, tono: SemanticKind.success);
    case AgendaTipo.reunion:
    case AgendaTipo.actividad:
      return (icono: Icons.groups_outlined, tono: SemanticKind.info);
    case AgendaTipo.recordatorio:
      return (icono: Icons.alarm_outlined, tono: SemanticKind.info);
  }
}

class _FilaAgenda extends StatelessWidget {
  final AgendaItem item;
  final int offset;
  final VoidCallback onTap;

  const _FilaAgenda({required this.item, required this.offset, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;
    final aspecto = _aspecto(item.tipo);
    final tono = SemanticTone.of(context, aspecto.tono);
    final terminada = item.estado == EstadoAgenda.terminada;

    return Opacity(
      opacity: terminada ? 0.65 : 1,
      child: AppCard(
        onTap: onTap,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: tono.bg,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(aspecto.icono, size: 20, color: tono.fg),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          item.titulo.isNotEmpty ? item.titulo : item.materia,
                          style: AppType.bodyStrong,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (item.estado == EstadoAgenda.enCurso)
                        StatusPill.danger('En curso'),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    item.todoElDia
                        ? 'Todo el día'
                        : item.duracionMinutos > 0
                            ? '${horaCampus(item.inicio, offset)} - ${horaCampus(item.fin, offset)}'
                            : horaCampus(item.inicio, offset),
                    style: AppType.body,
                  ),
                  if (item.aula.isNotEmpty || item.grupo.isNotEmpty || item.materia.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(
                        [
                          if (item.materia.isNotEmpty && item.materia != item.titulo) item.materia,
                          if (item.grupo.isNotEmpty) 'Grupo ${item.grupo}',
                          if (item.aula.isNotEmpty) 'Aula ${item.aula}',
                        ].join(' · '),
                        style: AppType.caption.copyWith(color: muted),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DetalleAgenda extends StatelessWidget {
  final AgendaItem item;
  final int offset;

  const _DetalleAgenda({required this.item, required this.offset});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;

    Widget dato(String etiqueta, String valor) => Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                width: 96,
                child: Text(etiqueta, style: AppType.caption.copyWith(color: muted)),
              ),
              Expanded(child: Text(valor, style: AppType.body)),
            ],
          ),
        );

    return SafeArea(
      child: SingleChildScrollView(
        padding: AppSpacing.pagePadding,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(item.titulo.isNotEmpty ? item.titulo : item.materia, style: AppType.h3),
            const SizedBox(height: 4),
            StatusPill(item.tipo.etiqueta, kind: _aspecto(item.tipo).tono),
            const SizedBox(height: AppSpacing.gap),
            dato('Cuándo',
                '${item.fecha} · ${item.todoElDia ? 'todo el día' : '${horaCampus(item.inicio, offset)} - ${horaCampus(item.fin, offset)}'}'),
            if (item.duracionMinutos > 0) dato('Duración', '${item.duracionMinutos} minutos'),
            if (item.materia.isNotEmpty) dato('Materia', item.materia),
            if (item.grupo.isNotEmpty) dato('Grupo', item.grupo),
            if (item.aula.isNotEmpty) dato('Aula', item.aula),
            if (item.docente.isNotEmpty) dato('Docente', item.docente),
            if (item.periodo.isNotEmpty) dato('Periodo', item.periodo),
            if (item.descripcion.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(item.descripcion, style: AppType.body),
            ],
            if (item.origen == 'schedule') ...[
              const SizedBox(height: AppSpacing.gap),
              Text(
                'Esta clase viene de tu horario semanal. Para cambiar la hora o el aula, '
                'edítala en el horario: el cambio se aplica a todas las semanas.',
                style: AppType.caption.copyWith(color: muted),
              ),
            ],
            const SizedBox(height: AppSpacing.gap),
          ],
        ),
      ),
    );
  }
}
