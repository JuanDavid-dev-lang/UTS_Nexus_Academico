import 'dart:convert';

/// Cuándo renovar la sesión aunque nadie haga ninguna petición.
///
/// Misma regla que el escritorio (`desktop/src/domain/session/keep-alive.ts`).
/// La sesión dura 15 días sin uso y cada renovación empieza otros 15, pero solo
/// se renovaba cuando una petición recibía un 401. Un docente que abre la app
/// un rato cada semana —o que la deja en el bolsillo con la red caída— podía
/// llegar al día dieciséis sin una sola renovación y encontrarse el acceso.
/// Renovar como mucho una vez al día al entrar y al volver a primer plano basta
/// para que eso no pase, y es una petición diaria por teléfono.
const renovarTras = Duration(hours: 24);

/// La carga (payload) de un JWT, sin verificar la firma: solo se usa para
/// decidir cuándo renovar, nunca para conceder nada. Null si no se puede leer.
Map<String, dynamic>? cargaDeJwt(String? token) {
  if (token == null) return null;
  final partes = token.split('.');
  if (partes.length != 3) return null;
  try {
    final json = utf8.decode(base64Url.decode(base64Url.normalize(partes[1])));
    final carga = jsonDecode(json);
    return carga is Map ? Map<String, dynamic>.from(carga) : null;
  } on FormatException {
    return null;
  }
}

bool debeRenovarSesion(Map<String, dynamic>? carga, DateTime ahora) {
  final iat = carga?['iat'];
  if (iat is! num) return false;
  final exp = carga?['exp'];
  final ahoraMs = ahora.millisecondsSinceEpoch;
  // Ya caducado: renovarlo fallaría y cerraría la sesión desde aquí, y eso le
  // toca al flujo normal del 401, que lo explica en pantalla.
  if (exp is num && exp * 1000 <= ahoraMs) return false;
  return ahoraMs - iat * 1000 >= renovarTras.inMilliseconds;
}
