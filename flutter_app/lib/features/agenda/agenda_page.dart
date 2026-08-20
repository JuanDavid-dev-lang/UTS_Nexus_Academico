import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/data/campus_time.dart';
import '../../core/data/providers.dart';
import './data/agenda_models.dart';
import '../../core/network/api_error.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/compact.dart';
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
      appBar: CompactHeader(
        titulo: 'Agenda',
        acciones: [
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
          padding: AppSpacing.listPadding,
          children: [
            NextClassCard(onVerAgenda: () => setState(() => _pestana = 0)),
            const SizedBox(height: AppSpacing.gap),
            // `SegmentedTabs` del sistema y no el `SegmentedButton` de
            // Material. El de Material reserva sitio para la marca de
            // verificación de la opción elegida además del icono y la etiqueta:
            // en 360 dp, «Próximas» se quedaba en «Próxim…» y las tres
            // opciones medían distinto según cuál estuviera activa, así que la
            // barra se movía sola al cambiar de pestaña.
            SegmentedTabs(
              opciones: const ['Hoy', 'Semana', 'Próximas'],
              indice: _pestana,
              onCambio: (valor) => setState(() => _pestana = valor),
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
    final palette = context.palette;

    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.gap, bottom: AppSpacing.gapSm),
      child: Row(
        children: [
          if (esHoy) ...[
            // El día de hoy lleva un punto además del color. Solo con el color,
            // en la lista de la semana había que comparar dos títulos para
            // saber cuál era el de hoy, que es justo el que se busca al abrir.
            Container(
              width: 6,
              height: 6,
              decoration: BoxDecoration(
                color: palette.primary,
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: AppSpacing.gapSm - 2),
          ],
          Text(
            esHoy ? 'HOY · ${texto.toUpperCase()}' : texto.toUpperCase(),
            style: AppType.captionStrong.copyWith(
              letterSpacing: 0.8,
              fontWeight: FontWeight.w700,
              color: esHoy ? palette.primary : palette.muted,
            ),
          ),
          const SizedBox(width: AppSpacing.gapSm),
          Expanded(child: Divider(height: 1, color: palette.border)),
        ],
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
    final palette = context.palette;
    final aspecto = _aspecto(item.tipo);
    final tono = SemanticTone.of(context, aspecto.tono);
    final terminada = item.estado == EstadoAgenda.terminada;
    final enCurso = item.estado == EstadoAgenda.enCurso;

    return Opacity(
      opacity: terminada ? 0.6 : 1,
      child: AppCard(
        onTap: onTap,
        elevated: enCurso,
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              /*
               * La hora, a la izquierda y en columna propia.
               *
               * Antes ocupaba ese sitio un cuadro de 40 dp con el icono del
               * tipo, y la hora iba dentro del cuerpo como una línea más de
               * texto. Una agenda se recorre buscando huecos —«¿qué tengo a las
               * once?»—, y con las horas metidas en el párrafo había que leer
               * cada tarjeta entera para encontrarlas. Alineadas en una columna
               * de ancho fijo se leen de un barrido vertical, que es como se
               * mira un horario.
               */
              SizedBox(
                width: 46,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.todoElDia ? 'Todo' : horaCampus(item.inicio, offset),
                      style: AppType.bodyStrong.copyWith(
                        fontWeight: FontWeight.w700,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                    Text(
                      item.todoElDia
                          ? 'el día'
                          : item.duracionMinutos > 0
                              ? horaCampus(item.fin, offset)
                              : '',
                      style: AppType.caption.copyWith(
                        color: palette.muted,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.gapSm + 2),
              // La franja sustituye al cuadro del icono como portadora del
              // tipo: ocupa 3 dp en vez de 40 y comunica lo mismo de un
              // vistazo, porque el color ya era lo único que se leía del cuadro
              // a la velocidad a la que se recorre una lista.
              Container(
                width: 3,
                decoration: BoxDecoration(
                  color: tono.fg,
                  borderRadius: BorderRadius.circular(AppSpacing.radiusPill),
                ),
              ),
              const SizedBox(width: AppSpacing.gap),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Row(
                      children: [
                        Icon(aspecto.icono, size: 14, color: tono.fg),
                        const SizedBox(width: AppSpacing.gapXs + 2),
                        Expanded(
                          child: Text(
                            item.titulo.isNotEmpty ? item.titulo : item.materia,
                            style: AppType.bodyStrong,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (enCurso) StatusPill.danger('En curso'),
                      ],
                    ),
                    if (item.aula.isNotEmpty ||
                        item.grupo.isNotEmpty ||
                        item.materia.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(
                          [
                            if (item.materia.isNotEmpty && item.materia != item.titulo)
                              item.materia,
                            if (item.grupo.isNotEmpty) 'Grupo ${item.grupo}',
                            if (item.aula.isNotEmpty) 'Aula ${item.aula}',
                          ].join(' · '),
                          style: AppType.caption.copyWith(color: palette.muted),
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
        padding: AppSpacing.listPadding,
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
