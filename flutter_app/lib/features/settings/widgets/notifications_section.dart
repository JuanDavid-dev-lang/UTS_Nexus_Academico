import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/providers.dart';
import '../../agenda/data/agenda_models.dart';
import '../../../core/network/api_error.dart';
import '../../../core/notifications/local_notifications_service.dart';
import '../../../core/notifications/push_service.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/ui_kit.dart';

/// Antelaciones que ofrece la interfaz. Coinciden con las que valida el backend.
const _antelaciones = <int, String>{
  5: '5 min',
  10: '10 min',
  15: '15 min',
  30: '30 min',
  60: '1 hora',
  1440: '1 día',
};

const _categorias = <(String, String, String)>[
  ('clases', 'Clases', 'Recordatorios y cambios de horario.'),
  ('evaluaciones', 'Evaluaciones', 'Parciales, quices y entregas.'),
  ('asistencia', 'Asistencia', 'Ausencias acumuladas.'),
  ('riesgo', 'Riesgo académico', 'Estudiantes que entran o salen de riesgo.'),
  ('intervenciones', 'Intervenciones', 'Acciones pendientes de seguimiento.'),
  ('eventos', 'Eventos', 'Reuniones, tutorías y eventos.'),
  ('recordatorios', 'Recordatorios', 'Los que creas tú en la agenda.'),
  ('sistema', 'Sistema', 'Versiones nuevas y mantenimiento.'),
];

/// Preferencias de notificación en el teléfono.
///
/// Guardan en el servidor, no en el teléfono: la antelación que el docente elija
/// aquí es la misma con la que le avisa el escritorio. Al guardar se reprograman
/// las alarmas locales en el acto — si no, la pantalla diría una cosa y el
/// teléfono seguiría avisando con la anterior.
class NotificationsSection extends ConsumerStatefulWidget {
  const NotificationsSection({super.key});

  @override
  ConsumerState<NotificationsSection> createState() => _NotificationsSectionState();
}

class _NotificationsSectionState extends ConsumerState<NotificationsSection> {
  bool _guardando = false;

  Future<void> _guardar(Map<String, dynamic> cambios) async {
    setState(() => _guardando = true);
    try {
      await ref.read(notificationPrefsRepositoryProvider).guardar(cambios);
      ref.invalidate(notificationPrefsProvider);

      // Reprogramación inmediata: las alarmas puestas siguen siendo las viejas
      // hasta que se cancelan y se rehacen.
      final agenda = await ref.read(agendaProximaProvider.future);
      final preferencias = await ref.read(notificationPrefsProvider.future);
      final programados = await LocalNotificationsService.instance.reprogramar(
        items: agenda.items,
        preferencias: preferencias.preferencias,
        offsetCampusMinutos: agenda.offsetCampusMinutos,
      );

      if (mounted) {
        AppToast.success(context, 'Preferencias guardadas · $programados avisos programados');
      }
    } catch (error) {
      if (mounted) AppToast.error(context, ApiError.from(error).message);
    } finally {
      if (mounted) setState(() => _guardando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(notificationPrefsProvider);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;

    return async.when(
      loading: () => const AppCard(child: SkeletonBox(height: 120)),
      error: (error, _) => AppCard(
        child: StateView.error(
          ApiError.from(error).message,
          action: FilledButton(
            onPressed: () => ref.invalidate(notificationPrefsProvider),
            child: const Text('Reintentar'),
          ),
        ),
      ),
      data: (datos) {
        final p = datos.preferencias;

        return AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SectionHeader('Notificaciones'),
              Text(
                'Qué te avisamos y con cuánta antelación. Se aplica también al escritorio.',
                style: AppType.caption.copyWith(color: muted),
              ),
              const SizedBox(height: AppSpacing.gap),

              Text('ANTELACIÓN DE LAS CLASES',
                  style: AppType.captionStrong.copyWith(color: muted, letterSpacing: 0.8)),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final entrada in _antelaciones.entries)
                    FilterChip(
                      label: Text(entrada.value),
                      selected: p.antelacionesClase.contains(entrada.key),
                      onSelected: _guardando
                          ? null
                          : (activo) {
                              final siguientes = [...p.antelacionesClase];
                              if (activo) {
                                siguientes.add(entrada.key);
                              } else {
                                siguientes.remove(entrada.key);
                              }
                              _guardar({'classLeadMinutes': siguientes});
                            },
                    ),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                'Además de las que elijas, siempre se avisa cuando la clase comienza.',
                style: AppType.caption.copyWith(color: muted),
              ),

              const Divider(height: 28),
              Text('QUÉ RECIBIR',
                  style: AppType.captionStrong.copyWith(color: muted, letterSpacing: 0.8)),
              for (final (clave, etiqueta, detalle) in _categorias)
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(etiqueta, style: AppType.body),
                  subtitle: Text(detalle, style: AppType.caption.copyWith(color: muted)),
                  value: _valorDe(p, clave),
                  onChanged: _guardando ? null : (valor) => _guardar({clave: valor}),
                ),

              const Divider(height: 28),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: Text('Horas de silencio', style: AppType.body),
                subtitle: Text(
                  p.silencioActivo
                      ? 'De ${p.silencioDesde} a ${p.silencioHasta}. Las notificaciones siguen llegando a la bandeja, sin sonar.'
                      : 'Desactivado.',
                  style: AppType.caption.copyWith(color: muted),
                ),
                value: p.silencioActivo,
                onChanged: _guardando
                    ? null
                    : (valor) => _guardar({
                          'quietHours': {'enabled': valor}
                        }),
              ),

              // Se distinguen los dos lados del push: puede faltar en el
              // servidor o en este build de la app. Decir solo "no disponible"
              // dejaría al docente sin saber a quién preguntar.
              if (!datos.pushConfigurado) ...[
                const SizedBox(height: 8),
                _Aviso(
                  'Este servidor no tiene configurado el envío con la aplicación cerrada. '
                  'Tus clases te avisan igual: el teléfono programa esos recordatorios por '
                  'su cuenta y funcionan sin conexión.',
                ),
              ] else if (!PushService.instance.disponible) ...[
                const SizedBox(height: 8),
                _Aviso(
                  'Esta versión de la aplicación se instaló sin Firebase, así que no recibe '
                  'avisos del servidor con la app cerrada. Los recordatorios de clase sí '
                  'funcionan: los programa el teléfono.',
                ),
              ],

              const SizedBox(height: AppSpacing.gap),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _guardando
                          ? null
                          : () async {
                              final concedido =
                                  await LocalNotificationsService.instance.pedirPermisos();
                              if (!context.mounted) return;
                              if (concedido) {
                                AppToast.success(context, 'Notificaciones activadas');
                              } else {
                                AppToast.error(
                                  context,
                                  'Android no concedió el permiso. Actívalo en Ajustes › Aplicaciones.',
                                );
                              }
                            },
                      icon: const Icon(Icons.notifications_active_outlined),
                      label: const Text('Permisos'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: FilledButton.tonalIcon(
                      onPressed: _guardando
                          ? null
                          : () async {
                              final pendientes =
                                  await LocalNotificationsService.instance.pendientes();
                              if (!context.mounted) return;
                              AppToast.success(
                                context,
                                '$pendientes recordatorios programados en este teléfono',
                              );
                            },
                      icon: const Icon(Icons.fact_check_outlined),
                      label: const Text('Comprobar'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }

  bool _valorDe(PreferenciasNotificacion p, String clave) {
    switch (clave) {
      case 'clases':
        return p.clases;
      case 'evaluaciones':
        return p.evaluaciones;
      case 'asistencia':
        return p.asistencia;
      case 'riesgo':
        return p.riesgo;
      case 'intervenciones':
        return p.intervenciones;
      case 'eventos':
        return p.eventos;
      case 'recordatorios':
        return p.recordatorios;
      case 'sistema':
        return p.sistema;
      default:
        return true;
    }
  }
}

class _Aviso extends StatelessWidget {
  final String texto;
  const _Aviso(this.texto);

  @override
  Widget build(BuildContext context) {
    final tono = SemanticTone.of(context, SemanticKind.info);
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: tono.bg,
        borderRadius: BorderRadius.circular(AppSpacing.radiusInput),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.info_outline, size: 16, color: tono.fg),
          const SizedBox(width: 8),
          Expanded(
            child: Text(texto, style: AppType.caption.copyWith(color: tono.fg)),
          ),
        ],
      ),
    );
  }
}
