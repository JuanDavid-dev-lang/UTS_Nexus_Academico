import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'app.dart';
import 'core/data/offline_status.dart';
import 'core/services/backend_bootstrap.dart';
import 'core/services/local_notifications_service.dart';
import 'core/services/push_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Recupera del disco la última sincronización conocida: «hace 4 minutos»
  // tiene que seguir siendo cierto después de cerrar y abrir la aplicación.
  await OfflineStatus.instance.cargar();
  // Antes de dibujar nada: si la app se abrió tocando una notificación, aquí es
  // donde se recoge a qué apuntaba. Después de montar el router ya sería tarde.
  await LocalNotificationsService.instance.init();
  // Push del servidor. Devuelve `false` y no lanza cuando este build no tiene
  // Firebase configurado; la app arranca igual, sin push.
  await PushService.instance.init();
  await BackendBootstrap.ensureRunning();
  runApp(const ProviderScope(child: UtsApp()));
}
