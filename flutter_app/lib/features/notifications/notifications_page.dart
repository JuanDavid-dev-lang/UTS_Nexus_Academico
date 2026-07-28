import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/data/models.dart';
import '../../core/data/providers.dart';
import '../../core/network/api_error.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/ui_kit.dart';

/// Alertas académicas.
///
/// Marcar como leída es optimista: el contador baja al instante en vez de
/// esperar al servidor, porque es una acción que prácticamente nunca falla. Si
/// falla, se revierte — la interfaz no debe mentir sobre el estado real.
class NotificationsPage extends ConsumerStatefulWidget {
  const NotificationsPage({super.key});

  @override
  ConsumerState<NotificationsPage> createState() => _NotificationsPageState();
}

class _NotificationsPageState extends ConsumerState<NotificationsPage> {
  bool _onlyUnread = false;
  bool _scanning = false;

  /// Ids marcados localmente, para que la fila reaccione antes que la red.
  final _optimisticallyRead = <String>{};

  @override
  Widget build(BuildContext context) {
    final notifications = ref.watch(notificationsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Notificaciones'),
        actions: [
          IconButton(
            tooltip: 'Buscar estudiantes en riesgo',
            icon: _scanning
                ? const SizedBox(
                    height: 18,
                    width: 18,
                    child: CircularProgressIndicator(strokeWidth: 2.2))
                : const Icon(Icons.radar),
            onPressed: _scanning ? null : _scanRisks,
          ),
        ],
      ),
      body: notifications.when(
        loading: () => ListView(
          padding: const EdgeInsets.all(16),
          children: List.generate(
            6,
            (_) => const Padding(
              padding: EdgeInsets.only(bottom: 10),
              child: SkeletonBox(height: 84, radius: 18),
            ),
          ),
        ),
        error: (error, _) => StateView.error(
          ApiError.from(error).message,
          action: FilledButton(
            onPressed: () => ref.invalidate(notificationsProvider),
            child: const Text('Reintentar'),
          ),
        ),
        data: (items) {
          final unread = items
              .where((n) => n.isUnread && !_optimisticallyRead.contains(n.id))
              .length;
          final visible = _onlyUnread
              ? items
                  .where(
                      (n) => n.isUnread && !_optimisticallyRead.contains(n.id))
                  .toList()
              : items;

          return RefreshIndicator(
            onRefresh: () async {
              _optimisticallyRead.clear();
              ref.invalidate(notificationsProvider);
              await ref.read(notificationsProvider.future);
            },
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
              children: [
                Row(
                  children: [
                    ChoiceChip(
                      label: Text('Todas (${items.length})'),
                      selected: !_onlyUnread,
                      showCheckmark: false,
                      onSelected: (_) => setState(() => _onlyUnread = false),
                    ),
                    const SizedBox(width: 8),
                    ChoiceChip(
                      label:
                          Text(unread == 0 ? 'Sin leer' : 'Sin leer ($unread)'),
                      selected: _onlyUnread,
                      showCheckmark: false,
                      onSelected: (_) => setState(() => _onlyUnread = true),
                    ),
                    const Spacer(),
                    if (unread > 0)
                      TextButton(
                        onPressed: () => _markAll(items),
                        child: const Text('Marcar todas'),
                      ),
                  ],
                ),
                const SizedBox(height: 12),
                if (visible.isEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 50),
                    child: StateView.empty(
                      _onlyUnread
                          ? 'No tienes notificaciones pendientes por leer.'
                          : 'Cuando el sistema detecte alertas académicas, aparecerán aquí.',
                    ),
                  )
                else
                  for (final notification in visible) ...[
                    _NotificationCard(
                      notification: notification,
                      read: _optimisticallyRead.contains(notification.id),
                      onMarkRead: () => _markRead(notification),
                    ),
                    const SizedBox(height: 10),
                  ],
              ],
            ),
          );
        },
      ),
    );
  }

  Future<void> _markRead(AppNotification notification) async {
    if (!notification.isUnread) return;
    setState(() => _optimisticallyRead.add(notification.id));

    try {
      await ref
          .read(academicRepositoryProvider)
          .markNotificationRead(notification.id);
      ref.invalidate(notificationsProvider);
    } on ApiError catch (error) {
      if (!mounted) return;
      setState(() => _optimisticallyRead.remove(notification.id));
      AppToast.error(context, 'No se pudo marcar como leída', error.message);
    }
  }

  Future<void> _markAll(List<AppNotification> items) async {
    for (final notification in items.where((n) => n.isUnread)) {
      await _markRead(notification);
    }
  }

  Future<void> _scanRisks() async {
    setState(() => _scanning = true);
    try {
      final result = await ref.read(academicRepositoryProvider).scanRisks(
            period: ref.read(selectedPeriodProvider),
          );
      ref.invalidate(notificationsProvider);
      ref.invalidate(risksProvider);
      if (!mounted) return;

      final created = (result['created'] as num?)?.toInt() ?? 0;
      final scanned = (result['scanned'] as num?)?.toInt() ?? 0;
      AppToast.success(
        context,
        created > 0 ? '$created alertas nuevas' : 'Sin alertas nuevas',
        'Se revisaron $scanned registros académicos.',
      );
    } on ApiError catch (error) {
      if (!mounted) return;
      AppToast.error(context, 'No se pudo escanear', error.message);
    } finally {
      if (mounted) setState(() => _scanning = false);
    }
  }
}

class _NotificationCard extends StatelessWidget {
  final AppNotification notification;
  final bool read;
  final VoidCallback onMarkRead;

  const _NotificationCard({
    required this.notification,
    required this.read,
    required this.onMarkRead,
  });

  static const _presentation = <String,
      (IconData, Color, Color, String)>{
    'RISK': (
      Icons.warning_amber_rounded,
      AppColors.danger,
      AppColors.dangerSoft,
      'Riesgo'
    ),
    'GRADE': (
      Icons.school_outlined,
      AppColors.info,
      AppColors.infoSoft,
      'Notas'
    ),
    'ATTENDANCE': (
      Icons.event_busy_outlined,
      AppColors.warningText,
      AppColors.warningSoft,
      'Asistencia'
    ),
    'CLASS': (
      Icons.menu_book_outlined,
      AppColors.info,
      AppColors.infoSoft,
      'Clase'
    ),
    'EXAM': (
      Icons.assignment_outlined,
      AppColors.info,
      AppColors.infoSoft,
      'Examen'
    ),
    'DEADLINE': (
      Icons.timer_outlined,
      AppColors.warningText,
      AppColors.warningSoft,
      'Fecha límite'
    ),
  };

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;
    final unread = notification.isUnread && !read;

    final (icon, color, background, label) = _presentation[notification.type] ??
        (
          Icons.notifications_outlined,
          AppColors.info,
          AppColors.infoSoft,
          'Actividad'
        );

    return AppCard(
      padding: const EdgeInsets.all(14),
      onTap: unread ? onMarkRead : null,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            height: 38,
            width: 38,
            decoration: BoxDecoration(
              color: background,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, size: 19, color: color),
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
                        notification.title,
                        style: TextStyle(
                          fontSize: 14.5,
                          fontWeight:
                              unread ? FontWeight.w800 : FontWeight.w600,
                        ),
                      ),
                    ),
                    if (unread)
                      Container(
                        height: 8,
                        width: 8,
                        decoration: BoxDecoration(
                          color: Theme.of(context).colorScheme.primary,
                          shape: BoxShape.circle,
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  notification.message,
                  style: TextStyle(fontSize: 13, color: muted, height: 1.35),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    StatusPill(label, color: color, background: background),
                    const SizedBox(width: 8),
                    Text(
                      _relative(notification.createdAt),
                      style: TextStyle(fontSize: 11, color: muted),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// Tiempo relativo: en un listado de alertas se lee más rápido que una fecha.
  static String _relative(DateTime? date) {
    if (date == null) return '';
    final seconds = DateTime.now().difference(date).inSeconds;
    if (seconds < 60) return 'hace un momento';
    if (seconds < 3600) return 'hace ${seconds ~/ 60} min';
    if (seconds < 86400) return 'hace ${seconds ~/ 3600} h';
    if (seconds < 172800) return 'ayer';
    if (seconds < 604800) return 'hace ${seconds ~/ 86400} días';
    return '${date.day.toString().padLeft(2, '0')}/'
        '${date.month.toString().padLeft(2, '0')}/${date.year}';
  }
}
