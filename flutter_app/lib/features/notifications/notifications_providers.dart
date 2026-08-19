import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/data/models.dart';
import '../../core/data/providers.dart';

/// Providers de la campana de notificaciones.

final notificationsProvider = FutureProvider<List<AppNotification>>((ref) {
  return ref.watch(academicRepositoryProvider).notifications();
});

final unreadCountProvider = Provider<int>((ref) {
  return ref.watch(notificationsProvider).maybeWhen(
        data: (items) => items.where((n) => n.isUnread).length,
        orElse: () => 0,
      );
});
