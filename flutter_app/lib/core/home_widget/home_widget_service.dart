import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:home_widget/home_widget.dart';

import '../../features/agenda/data/agenda_models.dart';
import '../../features/agenda/widget_horario.dart';
import './home_widget_links.dart';

/// Puente con los widgets de la pantalla de inicio de Android.
///
/// Todo lo que toca el paquete `home_widget` pasa por aquí, envuelto para que
/// un fallo —el widget ya no está anclado, la versión de Android no coopera,
/// iOS, donde esto no existe— nunca tumbe la aplicación: se registra en el
/// log y se sigue. El puente es de un solo sentido desde la app: escribe
/// datos y pide un repintado; quién pinta qué lo decide el
/// `AppWidgetProvider` de Kotlin (`android/.../HorarioWidgetProvider.kt`).
///
/// Solo Android: los widgets de pantalla de inicio de este proyecto son
/// nativos de Android (`AppWidgetProvider` + RemoteViews), no Glance ni
/// WidgetKit. En iOS todo método de aquí es un no-op silencioso.
class HomeWidgetService {
  HomeWidgetService._();
  static final instance = HomeWidgetService._();

  /// Nombre completo del `AppWidgetProvider` de Kotlin. Con el nombre
  /// calificado, `home_widget` no necesita adivinar el paquete de la app.
  static const _qualifiedHorario =
      'co.edu.uts.nexus.academico.HorarioWidgetProvider';

  static bool get _soportado => !kIsWeb && Platform.isAndroid;

  /// Guarda las próximas clases y pide que el widget se repinte.
  ///
  /// Se llama cada vez que la agenda próxima se (re)carga: al iniciar sesión,
  /// al reprogramar los recordatorios locales y cuando `sync:update` avisa de
  /// un cambio de horario o de calendario (ver `_reprogramarRecordatorios` en
  /// `app.dart`, que ya trae la agenda cargada y solo reenvía el resultado).
  Future<void> actualizarHorario(AgendaRango agenda) async {
    if (!_soportado) return;
    try {
      final payload = serializarHorarioWidget(
        agenda.items,
        offsetCampusMinutos: agenda.offsetCampusMinutos,
      );
      await HomeWidget.saveWidgetData<String>(claveDatosHorarioWidget, payload);
      await HomeWidget.updateWidget(qualifiedAndroidName: _qualifiedHorario);
    } catch (error) {
      debugPrint('[home_widget] no se pudo actualizar el horario: $error');
    }
  }

  /// Borra los datos del widget y lo repinta al estado "sin sesión".
  ///
  /// La pantalla de inicio es visible para cualquiera que tenga el teléfono en
  /// la mano —en la sala de profesores, es lo normal—, así que el horario de
  /// un docente no puede seguir ahí para quien entre con la sesión siguiente.
  /// Se llama al cerrar sesión, igual que se cancelan los recordatorios
  /// locales y se da de baja el token de push.
  Future<void> limpiar() async {
    if (!_soportado) return;
    try {
      await HomeWidget.saveWidgetData<String>(claveDatosHorarioWidget, null);
      await HomeWidget.updateWidget(qualifiedAndroidName: _qualifiedHorario);
    } catch (error) {
      debugPrint('[home_widget] no se pudo limpiar el widget: $error');
    }
  }

  /// Ruta pedida por el widget que abrió la aplicación desde cero (arranque en
  /// frío). Con la app ya abierta, el toque llega por [escucharClics].
  Future<String?> manejarDeepLinkInicial() async {
    if (!_soportado) return null;
    try {
      final uri = await HomeWidget.initiallyLaunchedFromHomeWidget();
      return rutaDesdeUriWidget(uri);
    } catch (error) {
      debugPrint('[home_widget] no se pudo leer el lanzamiento: $error');
      return null;
    }
  }

  StreamSubscription<Uri?>? _suscripcion;

  /// Escucha los toques a un widget mientras la aplicación ya está abierta.
  ///
  /// [onRuta] recibe solo rutas ya validadas contra la lista blanca; una URI
  /// que no case con ningún destino conocido no llama a nada.
  void escucharClics(void Function(String ruta) onRuta) {
    if (!_soportado) return;
    unawaited(_suscripcion?.cancel());
    _suscripcion = HomeWidget.widgetClicked.listen((uri) {
      final ruta = rutaDesdeUriWidget(uri);
      if (ruta != null) onRuta(ruta);
    });
  }
}
