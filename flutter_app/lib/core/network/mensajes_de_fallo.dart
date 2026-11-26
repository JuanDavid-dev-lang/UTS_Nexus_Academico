import './api_error.dart';

/// Qué se le dice al docente cuando el servidor no contesta y lo que escribió
/// queda en el teléfono.
///
/// Un «el servidor está caído» o un «No hay conexión con el servidor» encima
/// de una nota recién puesta se lee como «se perdió», y no se perdió: está en
/// la bandeja de salida y sale sola. El mensaje dice las dos cosas a la vez —qué
/// pasó y que sus cambios están a salvo— y nada más.
const mensajeCambiosGuardados =
    'Hubo un problema en el servidor. Tus cambios quedan guardados en el '
    'teléfono y se subirán cuando se restablezca el servicio.';

/// ¿El fallo es del servicio —no contestó, tardó o devolvió un 5xx (502, 503,
/// 504 del túnel incluidos)— y no del dato?
///
/// Un 4xx no entra: es el servidor diciendo que algo no vale (periodo cerrado,
/// validación, permisos) y ese mensaje tiene que llegar tal cual. Tampoco el
/// 429, que es una espera y no una avería.
bool esFalloDelServicio(ApiErrorKind kind) =>
    kind == ApiErrorKind.network ||
    kind == ApiErrorKind.timeout ||
    kind == ApiErrorKind.server;

/// El motivo de una entrada de la bandeja tal como se enseña.
///
/// Una entrada **pendiente** cuyo último intento falló por el servicio (sin
/// estado HTTP, o 5xx) lleva [mensajeCambiosGuardados]; una **fallida** —un
/// 4xx que el servidor rechazó— conserva el mensaje del servidor, que es lo que
/// el docente necesita para corregirla.
String motivoDeEntrada({
  required bool fallida,
  required int? status,
  required String mensaje,
}) {
  if (mensaje.isEmpty) return '';
  if (fallida) return mensaje;
  final delServicio = status == null || status >= 500;
  return delServicio ? mensajeCambiosGuardados : mensaje;
}
