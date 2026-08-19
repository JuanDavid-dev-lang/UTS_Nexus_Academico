import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../agenda/data/agenda_models.dart';
import '../agenda/data/agenda_repository.dart';

/// Providers de preferencias de notificación.

final notificationPrefsRepositoryProvider =
    Provider((ref) => NotificationPrefsRepository());

final notificationPrefsProvider =
    FutureProvider<({PreferenciasNotificacion preferencias, bool pushConfigurado})>((ref) {
  return ref.watch(notificationPrefsRepositoryProvider).leer();
});
