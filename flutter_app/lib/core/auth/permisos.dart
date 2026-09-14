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

/// ¿Puede tocar el horario (ordenar, editar, importar)? Igual que capturar: el
/// backend acepta `/schedules` de escritura solo de ADMIN y del docente.
bool puedeEditarHorario(String? rol) => puedeCapturar(rol);

/// ¿Puede crear, cerrar o borrar actividades y eventos de agenda? Quien dicta y
/// quien coordina; secretaría y estudiante solo leen.
bool puedeGestionarAgenda(String? rol) =>
    rol == 'ADMIN' || rol == 'PROFESSOR' || rol == 'COORDINATOR';

/// ¿Puede reabrir una actividad cerrada? No el docente: reabrir cambia lo que
/// se le puede exigir a un estudiante después de la fecha límite.
bool puedeReabrirActividad(String? rol) => rol == 'ADMIN' || rol == 'COORDINATOR';

/// Rol del usuario en sesión, o `null` sin sesión.
String? rolDe(AuthUser? usuario) => usuario?.role;
