import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import 'agenda_repository.dart';
import 'local_notifications_service.dart';

/// Notificaciones push (Firebase Cloud Messaging).
///
/// Cubre lo que las alarmas locales NO pueden saber por adelantado: que un
/// estudiante entró en riesgo, que alguien cambió el horario desde el
/// escritorio, que se creó un evento. Los recordatorios de clase siguen siendo
/// alarmas locales —funcionan sin red y sin cuenta de Firebase—; esto es la
/// otra mitad.
///
/// ── Degradación deliberada ──────────────────────────────────────────────────
/// Si `google-services.json` no está en `android/app/`, el plugin de Gradle no
/// se aplica y `Firebase.initializeApp()` falla. Eso NO puede tumbar la
/// aplicación: se captura, `disponible` queda en `false` y todo lo demás sigue
/// funcionando exactamente igual. Es la misma decisión que el correo saliente y
/// el servicio de ML: una instalación local no debería necesitar una cuenta de
/// Google para arrancar.
///
/// ── Por qué no hay duplicados con el socket ─────────────────────────────────
/// Con la app abierta, la misma notificación puede llegar dos veces: por
/// Socket.IO y por FCM. Las dos se muestran con la MISMA clave —el `_id` que
/// puso el servidor—, y como el identificador de la notificación de Android se
/// deriva de esa clave, la segunda reemplaza a la primera en vez de apilarse.
class PushService {
  PushService._();
  static final instance = PushService._();

  bool _iniciado = false;
  bool _disponible = false;
  String? _token;

  /// `false` cuando este build no tiene Firebase configurado.
  bool get disponible => _disponible;
  String? get token => _token;

  /// Arranca Firebase y engancha los tres caminos por los que llega un mensaje.
  ///
  /// Devuelve `false` si no hay Firebase configurado. No lanza nunca: quien
  /// llama no tiene que envolver esto en un try.
  Future<bool> init() async {
    if (_iniciado) return _disponible;
    _iniciado = true;

    try {
      // Sin `google-services.json` esto lanza y aquí se acaba el push. Las
      // alarmas locales, que son las de las clases, no dependen de esta línea.
      await Firebase.initializeApp();
    } catch (error) {
      debugPrint('[push] Firebase no está configurado en este build: $error');
      _disponible = false;
      return false;
    }

    try {
      final messaging = FirebaseMessaging.instance;

      // Tiene que registrarse desde el isolate principal y antes de `runApp`:
      // es lo que permite a Android despertar el proceso con la app cerrada.
      FirebaseMessaging.onBackgroundMessage(manejarMensajeEnSegundoPlano);

      // El permiso del sistema ya lo pidió `LocalNotificationsService`; esto
      // registra la app ante FCM y no vuelve a molestar al usuario.
      await messaging.requestPermission(alert: true, badge: true, sound: true);

      // Con la app cerrada o en segundo plano, Android pinta la notificación
      // por su cuenta a partir del bloque `notification` que manda el backend.
      // En primer plano no lo hace: hay que mostrarla a mano.
      FirebaseMessaging.onMessage.listen(_alRecibirEnPrimerPlano);

      // Toque sobre una notificación con la app en segundo plano.
      FirebaseMessaging.onMessageOpenedApp.listen(_alTocar);

      // Toque que abrió la app estando cerrada del todo. En ese momento el
      // router todavía no existe, así que la ruta se deja pendiente y la
      // aplicación la consume cuando está lista.
      final inicial = await messaging.getInitialMessage();
      if (inicial != null) {
        final ruta = _rutaDe(inicial.data);
        if (ruta != null) LocalNotificationsService.instance.rutaPendiente = ruta;
      }

      _token = await messaging.getToken();

      // El token rota por su cuenta (reinstalación, borrado de datos, cambio
      // de dispositivo). Sin escuchar esto, el servidor seguiría empujando a
      // un token muerto y el docente dejaría de recibir avisos en silencio.
      messaging.onTokenRefresh.listen((nuevo) {
        _token = nuevo;
        _registrarToken(nuevo);
      });

      _disponible = true;
      return true;
    } catch (error) {
      debugPrint('[push] no se pudo inicializar FCM: $error');
      _disponible = false;
      return false;
    }
  }

  /// Registra el token en el servidor, atado al usuario de la sesión actual.
  ///
  /// `localClassReminders: true` le dice al servidor que este teléfono programa
  /// sus propios recordatorios de clase; con eso deja de mandarle push de tipo
  /// CLASS y el docente no recibe el mismo aviso dos veces.
  Future<void> registrar({String version = ''}) async {
    final token = _token;
    if (!_disponible || token == null || token.isEmpty) return;
    await _registrarToken(token, version: version);
  }

  Future<void> _registrarToken(String token, {String version = ''}) async {
    try {
      await NotificationPrefsRepository().registrarDispositivo(
        token: token,
        plataforma: 'ANDROID',
        nombre: 'Android',
        version: version,
        recordatoriosLocales: true,
      );
    } catch (error) {
      // Un fallo aquí no puede impedir usar la app: significa que no habrá
      // push, no que no haya sesión. Se reintenta en el siguiente inicio.
      debugPrint('[push] no se pudo registrar el dispositivo: $error');
    }
  }

  /// Da de baja el token al cerrar sesión.
  ///
  /// En un teléfono compartido —lo normal en una sala de profesores— sin esto
  /// el docente siguiente recibiría las alertas del anterior, que son datos
  /// académicos de otra persona.
  Future<void> darDeBaja() async {
    final token = _token;
    if (!_disponible || token == null) return;
    try {
      await NotificationPrefsRepository().darDeBajaDispositivo(token);
    } catch (error) {
      debugPrint('[push] no se pudo dar de baja el dispositivo: $error');
    }
  }

  void _alRecibirEnPrimerPlano(RemoteMessage mensaje) {
    final titulo = mensaje.notification?.title ?? mensaje.data['title']?.toString();
    if (titulo == null || titulo.isEmpty) return;

    final cuerpo = mensaje.notification?.body ?? mensaje.data['message']?.toString() ?? '';
    final prioridad = mensaje.data['priority']?.toString() ?? 'INFO';

    LocalNotificationsService.instance.mostrarAhora(
      // La clave es la del servidor: si el mismo aviso llegó ya por Socket.IO,
      // este reemplaza aquel en vez de apilarse.
      clave: mensaje.data['notificationId']?.toString() ?? mensaje.messageId ?? titulo,
      titulo: titulo,
      mensaje: cuerpo,
      canalId: switch (prioridad) {
        'URGENT' => 'uts_urgente',
        'IMPORTANT' => 'uts_importante',
        'SYSTEM' => 'uts_sistema',
        _ => 'uts_informativa',
      },
      ruta: _rutaDe(mensaje.data),
    );
  }

  void _alTocar(RemoteMessage mensaje) {
    final ruta = _rutaDe(mensaje.data);
    if (ruta == null) return;
    final abrir = LocalNotificationsService.instance.onAbrirRuta;
    if (abrir == null) {
      LocalNotificationsService.instance.rutaPendiente = ruta;
      return;
    }
    abrir(ruta);
  }

  /// Ruta interna a la que apunta el mensaje. `null` si no apunta a nada
  /// utilizable.
  ///
  /// Solo rutas internas: una notificación no puede sacar al docente de la
  /// aplicación hacia una dirección que alguien haya podido escribir.
  String? _rutaDe(Map<String, dynamic> datos) {
    final ruta = datos['link']?.toString();
    if (ruta == null || !ruta.startsWith('/')) return null;
    return ruta;
  }
}

/// Manejador de mensajes con la aplicación cerrada o en segundo plano.
///
/// Corre en un isolate propio, sin interfaz y sin acceso al estado de la app;
/// por eso no puede hacer casi nada. No hace falta que haga más: Android ya
/// pinta la notificación a partir del bloque `notification` que envía el
/// backend. Existe porque `firebase_messaging` exige registrarlo para poder
/// despertar el proceso.
///
/// `@pragma('vm:entry-point')` es obligatorio: sin él, el compilador AOT lo
/// elimina por parecer código muerto y los mensajes en segundo plano se pierden
/// sin ningún error.
@pragma('vm:entry-point')
Future<void> manejarMensajeEnSegundoPlano(RemoteMessage mensaje) async {
  await Firebase.initializeApp();
  debugPrint('[push] mensaje en segundo plano: ${mensaje.messageId}');
}
