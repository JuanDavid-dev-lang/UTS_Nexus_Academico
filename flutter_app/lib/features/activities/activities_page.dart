import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/data/models.dart';
import '../../core/data/providers.dart';
import '../../core/network/api_error.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/compact.dart';
import '../../core/widgets/period_selector.dart';
import '../../core/widgets/session_menu.dart';
import '../../core/widgets/ui_kit.dart';
import './data/activity_models.dart';

/// Actividades académicas.
///
/// El estado que se pinta lo decide el servidor: `LATE` no está guardado, se
/// deriva del reloj del backend. Aquí no se compara ninguna fecha con la del
/// teléfono, porque un aparato con la hora mal puesta mostraría vencida una
/// entrega que no lo está y no habría forma de saber cuál de los dos miente.
class ActivitiesPage extends ConsumerWidget {
  /// Actividad que la notificación de vencimiento quiere abrir.
  final String? itemDestacado;

  const ActivitiesPage({super.key, this.itemDestacado});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final actividades = ref.watch(actividadesProvider);
    final materias = ref.watch(subjectsProvider).valueOrNull ?? const <Subject>[];
    final filtro = ref.watch(filtroActividadesProvider);

    final nombreDeMateria = {for (final m in materias) m.id: m.name};

    return Scaffold(
      appBar: CompactHeader(
        titulo: 'Actividades',
        contexto: actividades.valueOrNull == null
            ? null
            : '${actividades.valueOrNull!.length}',
        acciones: const [PeriodSelector(), SessionMenuButton()],
      ),
      body: Column(
        children: [
          // La barra de filtros va fija bajo la cabecera: si se desplazara con
          // la lista, cambiar de filtro obligaría a subir hasta arriba.
          FilterBar(
            hijos: [
              FilterChipCompact(
                etiqueta: 'Todas',
                activo: filtro.estado == null,
                onTap: () => ref.read(filtroActividadesProvider.notifier).state =
                    filtro.copyWith(estado: null),
              ),
              FilterChipCompact(
                etiqueta: 'Abiertas',
                icono: Icons.schedule_outlined,
                activo: filtro.estado == 'OPEN',
                onTap: () => ref.read(filtroActividadesProvider.notifier).state =
                    filtro.copyWith(estado: 'OPEN'),
              ),
              FilterChipCompact(
                etiqueta: 'Vencidas',
                icono: Icons.warning_amber_outlined,
                activo: filtro.estado == 'LATE',
                onTap: () => ref.read(filtroActividadesProvider.notifier).state =
                    filtro.copyWith(estado: 'LATE'),
              ),
              FilterChipCompact(
                etiqueta: 'Cerradas',
                icono: Icons.check_circle_outline,
                activo: filtro.estado == 'CLOSED',
                onTap: () => ref.read(filtroActividadesProvider.notifier).state =
                    filtro.copyWith(estado: 'CLOSED'),
              ),
              for (final materia in materias)
                FilterChipCompact(
                  etiqueta: materia.name,
                  activo: filtro.subjectId == materia.id,
                  onTap: () => ref.read(filtroActividadesProvider.notifier).state =
                      filtro.copyWith(
                    subjectId: filtro.subjectId == materia.id ? null : materia.id,
                  ),
                ),
            ],
          ),

          Expanded(
            child: RefreshIndicator(
              onRefresh: () async {
                ref.invalidate(actividadesProvider);
                await ref.read(actividadesProvider.future);
              },
              child: actividades.when(
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
                        onPressed: () => ref.invalidate(actividadesProvider),
                        child: const Text('Reintentar'),
                      ),
                    ),
                  ],
                ),
                data: (items) {
                  if (items.isEmpty) {
                    return ListView(
                      padding: AppSpacing.listPadding,
                      children: const [
                        CompactEmpty(
                          icono: Icons.assignment_outlined,
                          mensaje:
                              'Sin actividades con estos filtros. Crea una para que el '
                              'servidor avise de su vencimiento.',
                        ),
                      ],
                    );
                  }

                  // `ListView.builder` y no `ListView(children: [...])`: el
                  // segundo construye todas las filas aunque se vean ocho.
                  return ListView.separated(
                    padding: AppSpacing.listPadding,
                    itemCount: items.length,
                    separatorBuilder: (_, __) =>
                        const SizedBox(height: AppSpacing.gapSm),
                    itemBuilder: (_, indice) {
                      final actividad = items[indice];
                      return _FilaActividad(
                        actividad: actividad,
                        materia: nombreDeMateria[actividad.subjectId] ?? 'Materia',
                        destacada: actividad.id == itemDestacado,
                        onTap: () => _abrirDetalle(context, ref, actividad,
                            nombreDeMateria[actividad.subjectId] ?? 'Materia'),
                      );
                    },
                  );
                },
              ),
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _abrirFormulario(context, ref, materias),
        icon: const Icon(Icons.add),
        label: const Text('Nueva'),
      ),
    );
  }

  /// Panel inferior con el detalle y las acciones.
  ///
  /// En un teléfono el menú contextual de tres puntos esconde las acciones tras
  /// dos toques; el panel las pone todas a la vista con su texto, que es lo que
  /// permite cerrar una entrega sin leer un icono a medias.
  void _abrirDetalle(
    BuildContext context,
    WidgetRef ref,
    Activity actividad,
    String materia,
  ) {
    showCompactSheet<void>(
      context: context,
      titulo: actividad.title,
      subtitulo: '$materia · ${_textoVencimiento(actividad)}',
      constructor: (contextoHoja) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            if (actividad.description.isNotEmpty) ...[
              Text(actividad.description, style: AppType.caption),
              const SizedBox(height: AppSpacing.gap),
            ],
            Wrap(
              spacing: AppSpacing.gapSm,
              runSpacing: AppSpacing.gapSm,
              children: [
                _chipEstado(actividad),
                if (actividad.weight > 0)
                  StatusPill(
                    '${(actividad.weight * 100).round()}% del corte',
                    kind: SemanticKind.brand,
                  ),
                if (actividad.period.isNotEmpty)
                  StatusPill(actividad.period, kind: SemanticKind.info),
              ],
            ),
            const SizedBox(height: AppSpacing.gap),
            FilledButton.icon(
              onPressed: () async {
                Navigator.of(contextoHoja).pop();
                await _cambiarEstado(context, ref, actividad);
              },
              icon: Icon(
                actividad.cerrada ? Icons.lock_open_outlined : Icons.check_circle_outline,
              ),
              label: Text(actividad.cerrada ? 'Reabrir' : 'Cerrar actividad'),
            ),
            const SizedBox(height: AppSpacing.gapSm),
            OutlinedButton.icon(
              onPressed: () async {
                Navigator.of(contextoHoja).pop();
                await _eliminar(context, ref, actividad);
              },
              icon: const Icon(Icons.delete_outline),
              label: const Text('Eliminar'),
            ),
          ],
        );
      },
    );
  }

  Future<void> _cambiarEstado(
    BuildContext context,
    WidgetRef ref,
    Activity actividad,
  ) async {
    final mensajero = ScaffoldMessenger.maybeOf(context);
    try {
      await ref
          .read(activityRepositoryProvider)
          .cambiarEstado(actividad.id, abrir: actividad.cerrada);
      ref.invalidate(actividadesProvider);
      if (context.mounted) {
        AppToast.success(
          context,
          actividad.cerrada ? 'Actividad reabierta' : 'Actividad cerrada',
        );
      }
    } catch (error) {
      // El 403 de reapertura es esperable: el backend solo se lo permite a
      // coordinación. Se muestra su mensaje, que ya lo explica.
      if (context.mounted) {
        AppToast.error(context, 'No se pudo cambiar', ApiError.from(error).message);
      } else {
        mensajero?.showSnackBar(
          SnackBar(content: Text(ApiError.from(error).message)),
        );
      }
    }
  }

  Future<void> _eliminar(
    BuildContext context,
    WidgetRef ref,
    Activity actividad,
  ) async {
    final confirmado = await showDialog<bool>(
      context: context,
      builder: (contextoDialogo) => AlertDialog(
        title: const Text('¿Eliminar la actividad?'),
        content: Text(
          '«${actividad.title}» dejará de aparecer en la agenda y en los avisos. '
          'Los recordatorios ya enviados no se borran.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(contextoDialogo).pop(false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(contextoDialogo).pop(true),
            child: const Text('Eliminar'),
          ),
        ],
      ),
    );
    if (confirmado != true) return;

    try {
      await ref.read(activityRepositoryProvider).eliminarActividad(actividad.id);
      ref.invalidate(actividadesProvider);
      if (context.mounted) AppToast.success(context, 'Actividad eliminada');
    } catch (error) {
      if (context.mounted) {
        AppToast.error(context, 'No se pudo eliminar', ApiError.from(error).message);
      }
    }
  }

  /// Formulario de alta, en panel inferior.
  void _abrirFormulario(BuildContext context, WidgetRef ref, List<Subject> materias) {
    if (materias.isEmpty) {
      AppToast.info(
        context,
        'Sin materias',
        'Una actividad cuelga de una materia; primero tiene que haber una.',
      );
      return;
    }

    // Controladores fuera del builder: dentro se recrearían en cada
    // reconstrucción del panel y el texto escrito desaparecería.
    final tituloCtrl = TextEditingController();
    final descripcionCtrl = TextEditingController();
    var subjectId = materias.first.id;
    var vencimiento = DateTime.now().add(const Duration(days: 7));

    showCompactSheet<void>(
      context: context,
      titulo: 'Nueva actividad',
      subtitulo: 'La fecha límite decide cuándo avisa el servidor.',
      constructor: (contextoHoja) {
        return StatefulBuilder(
          builder: (contextoInterno, setEstado) {
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: tituloCtrl,
                  maxLength: 200,
                  decoration: const InputDecoration(
                    labelText: 'Título',
                    counterText: '',
                  ),
                ),
                const SizedBox(height: AppSpacing.gapSm),
                DropdownButtonFormField<String>(
                  initialValue: subjectId,
                  decoration: const InputDecoration(labelText: 'Materia'),
                  items: [
                    for (final materia in materias)
                      DropdownMenuItem(value: materia.id, child: Text(materia.name)),
                  ],
                  onChanged: (valor) =>
                      setEstado(() => subjectId = valor ?? subjectId),
                ),
                const SizedBox(height: AppSpacing.gapSm),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.event_outlined),
                  title: const Text('Fecha y hora límite'),
                  subtitle: Text(_fechaLarga(vencimiento)),
                  onTap: () async {
                    final fecha = await showDatePicker(
                      context: contextoInterno,
                      initialDate: vencimiento,
                      firstDate: DateTime.now().subtract(const Duration(days: 365)),
                      lastDate: DateTime.now().add(const Duration(days: 730)),
                    );
                    if (fecha == null || !contextoInterno.mounted) return;
                    final hora = await showTimePicker(
                      context: contextoInterno,
                      initialTime: TimeOfDay.fromDateTime(vencimiento),
                    );
                    setEstado(() {
                      vencimiento = DateTime(
                        fecha.year,
                        fecha.month,
                        fecha.day,
                        hora?.hour ?? vencimiento.hour,
                        hora?.minute ?? vencimiento.minute,
                      );
                    });
                  },
                ),
                const SizedBox(height: AppSpacing.gapSm),
                TextField(
                  controller: descripcionCtrl,
                  maxLines: 3,
                  maxLength: 4000,
                  decoration: const InputDecoration(
                    labelText: 'Descripción',
                    counterText: '',
                  ),
                ),
                const SizedBox(height: AppSpacing.gap),
                FilledButton(
                  onPressed: () async {
                    final titulo = tituloCtrl.text.trim();
                    if (titulo.isEmpty) {
                      AppToast.error(contextoInterno, 'Ponle un título');
                      return;
                    }
                    Navigator.of(contextoHoja).pop();
                    try {
                      await ref.read(activityRepositoryProvider).crearActividad(
                            title: titulo,
                            subjectId: subjectId,
                            dueAt: vencimiento,
                            description: descripcionCtrl.text.trim(),
                          );
                      ref.invalidate(actividadesProvider);
                      if (context.mounted) {
                        AppToast.success(context, 'Actividad creada');
                      }
                    } catch (error) {
                      if (context.mounted) {
                        AppToast.error(
                          context,
                          'No se pudo crear',
                          ApiError.from(error).message,
                        );
                      }
                    }
                  },
                  child: const Text('Crear actividad'),
                ),
              ],
            );
          },
        );
      },
    ).whenComplete(() {
      tituloCtrl.dispose();
      descripcionCtrl.dispose();
    });
  }
}

Widget _chipEstado(Activity actividad) => switch (actividad.estado) {
      ActivityState.closed => StatusPill.success('Cerrada'),
      ActivityState.late => StatusPill.danger('Vencida'),
      ActivityState.open => StatusPill('Abierta', kind: SemanticKind.info),
    };

String _fechaLarga(DateTime fecha) {
  final dia = fecha.day.toString().padLeft(2, '0');
  final mes = fecha.month.toString().padLeft(2, '0');
  final hora = fecha.hour.toString().padLeft(2, '0');
  final minuto = fecha.minute.toString().padLeft(2, '0');
  return '$dia/$mes/${fecha.year} · $hora:$minuto';
}

String _textoVencimiento(Activity actividad) {
  final fecha = actividad.dueAt;
  if (fecha == null) return 'sin fecha límite';
  return 'vence ${_fechaLarga(fecha)}';
}

class _FilaActividad extends StatelessWidget {
  final Activity actividad;
  final String materia;
  final bool destacada;
  final VoidCallback onTap;

  const _FilaActividad({
    required this.actividad,
    required this.materia,
    required this.destacada,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final acento = switch (actividad.estado) {
      ActivityState.late => SemanticKind.danger,
      ActivityState.closed => SemanticKind.success,
      ActivityState.open => null,
    };

    final fila = AcademicRow(
      titulo: actividad.title,
      metadatos: [materia, _textoVencimiento(actividad)],
      acento: acento,
      estado: _chipEstado(actividad),
      onTap: onTap,
    );

    if (!destacada) return fila;

    // La notificación abre exactamente esta entrega; el realce dice cuál es
    // sin obligar a repetir la búsqueda que el aviso ya había hecho.
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
        border: Border.all(color: Theme.of(context).colorScheme.primary, width: 2),
      ),
      child: fila,
    );
  }
}
