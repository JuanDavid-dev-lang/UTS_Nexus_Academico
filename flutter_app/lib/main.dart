import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import './app.dart';
import './core/storage/offline_status.dart';
import './core/telemetry/error_reporter.dart';
import './core/network/backend_bootstrap.dart';
import './core/notifications/local_notifications_service.dart';
import './core/notifications/push_service.dart';
import './core/theme/theme_controller.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Lo primero después del binding: un fallo durante el arranque ocurre antes
  // de que ninguna pantalla pueda enganchar nada, y es justo el que más
  // interesa. `instalar()` no lanza aunque no haya red ni sesión.
  await ErrorReporter.instance.instalar();
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
  // El tema se lee ANTES de dibujar: leerlo después dejaba el primer fotograma
  // con el modo del sistema y lo cambiaba a continuación, que es el fogonazo
  // que veía quien había elegido claro con el teléfono en oscuro.
  final temaInicial = await ThemeModeController.cargarInicial();

  runApp(
    ProviderScope(
      overrides: [
        themeModeProvider.overrideWith((ref) => ThemeModeController(temaInicial)),
      ],
      child: const UtsApp(),
    ),
  );
}
