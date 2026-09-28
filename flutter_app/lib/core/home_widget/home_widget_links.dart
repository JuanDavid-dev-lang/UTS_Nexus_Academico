/// Enlaces desde los widgets de la pantalla de inicio hacia la aplicación.
///
/// El widget nativo abre `MainActivity` con una URI
/// (`utsnexus://abrir/<segmento>`) y esta función decide a qué ruta interna
/// corresponde — solo a las que están en la lista blanca. Una URI que no case
/// no navega a ningún sitio: un widget no puede ser la puerta para abrir una
/// ruta que nadie escribió a propósito, igual que una notificación no puede
/// sacar al docente hacia una dirección arbitraria (`_rutaDeCarga` en
/// `core/notifications/local_notifications_service.dart`).
library;

/// Rutas a las que un widget puede llevar. Las cuatro son destinos de primer
/// nivel del router (ramas del `StatefulShellRoute`, ver `rutasDeRama` en
/// `core/widgets/app_scaffold.dart`), así que `router.go` las resuelve sin
/// más, igual que ya hace un recordatorio local de clase.
const rutasPermitidasDesdeWidget = <String>{
  '/grades',
  '/attendance',
  '/agenda',
  '/subjects',
};

/// `utsnexus://abrir/grades` → `/grades`. `null` si la URI no viene de un
/// widget conocido o el segmento no está en la lista blanca.
String? rutaDesdeUriWidget(Uri? uri) {
  if (uri == null) return null;
  if (uri.scheme != 'utsnexus' || uri.host != 'abrir') return null;
  if (uri.pathSegments.length != 1) return null;
  final ruta = '/${uri.pathSegments.first}';
  return rutasPermitidasDesdeWidget.contains(ruta) ? ruta : null;
}
