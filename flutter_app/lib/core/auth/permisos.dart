import 'auth_user.dart';

/// Qué puede hacer un rol, en un solo sitio.
///
/// El servidor es la autoridad: cada endpoint vuelve a comprobarlo. Esto existe
/// para no ofrecer botones que van a responder 403 — ofrecer una acción que
/// falla no es un fallo de seguridad, es un fallo de la aplicación, y el
/// mensaje de error se lee como una avería.
///
/// `SECRETARY` ve lo mismo que coordinación en sus programas y no escribe nada.
/// Por eso la pregunta que hace el móvil no es «¿es secretaría?» repartido por
/// diez pantallas, sino esta función: cuando aparezca un sexto rol de consulta,
/// se añade aquí y no en las diez.
bool esSoloLectura(String? rol) => rol == 'SECRETARY' || rol == 'STUDENT';

/// ¿Puede capturar notas o asistencia? Es siempre de quien dicta la clase.
bool puedeCapturar(String? rol) => rol == 'ADMIN' || rol == 'PROFESSOR';

/// Rol del usuario en sesión, o `null` sin sesión.
String? rolDe(AuthUser? usuario) => usuario?.role;
