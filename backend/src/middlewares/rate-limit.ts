import rateLimit, { type Options } from 'express-rate-limit';
import type { Request } from 'express';
import { esLectura } from '../domains/scope/role-access.js';

/**
 * Límites de tasa de la API, en un solo sitio.
 *
 * Había nueve limitadores repartidos —login, contraseña, recuperación,
 * registro, telemetría, asistente— y **ninguno sobre las rutas que escriben el
 * expediente académico**. Solo las cubría el cupo general, que no se diseñó
 * para eso: 250 peticiones cada quince minutos son muchísimas cuando cada una
 * puede escribir quinientos documentos.
 *
 * El cupo real de escritura por ventana era este:
 *
 *   /students/bulk      →   125 000 documentos
 *   /enrollments/bulk   →   125 000 (× 2: estudiante + matrícula)
 *   /grades/bulk        → 1 250 000
 *
 * Y no hace falta mala intención para llegar ahí. El caso que de verdad ocurre
 * es un cliente con un bucle de reintentos mal escrito.
 */

/**
 * De quién es esta petición, para contarle el cupo.
 *
 * **Por usuario cuando hay sesión, por IP cuando no la hay.** El cupo general
 * contaba solo por IP, y eso falla por los dos lados a la vez: un campus entero
 * sale a internet por una sola dirección —así que una facultad compartía las
 * mismas 250 peticiones— mientras que un script en una máquina tenía esas 250
 * para él solo, que con los lotes actuales son millones de documentos.
 *
 * `ai.routes.ts` ya había llegado a esta conclusión y lo explicaba en un
 * comentario; lo que faltaba era aplicarlo al resto.
 */
function porUsuarioOIp(req: Request): string {
  return req.user?.id ? `u:${req.user.id}` : `ip:${req.ip ?? 'anonimo'}`;
}

/** Base común: cabeceras estándar y la clave de arriba. */
function limitador(opciones: Partial<Options> & { windowMs: number; limit: number }) {
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: porUsuarioOIp,
    ...opciones,
  });
}

/**
 * Cupo general de la API. Sustituye al de 250/15 min por IP.
 *
 * Sube a 600 **porque ahora cuenta por usuario**: lo que antes compartía una
 * facultad entera ahora es de cada persona, así que el número puede ser
 * generoso sin aflojar nada. Una sesión de escritorio con varias pantallas
 * abiertas y el tiempo real invalidando cachés hace bastantes peticiones.
 */
export const limiteGeneral = limitador({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  message: { ok: false, message: 'Demasiadas peticiones. Espera unos minutos.' },
});

/**
 * Cupo de **escritura**, encima del general.
 *
 * Se aplica solo a los métodos que modifican algo, así que consultar no lo
 * gasta. 120 escrituras cada quince minutos es mucho más de lo que produce una
 * persona usando la aplicación —capturar las notas de un grupo entero es UNA
 * petición, no cuarenta— y muy poco para un bucle.
 *
 * No sustituye a los topes por petición: un lote sigue estando acotado a 500
 * filas (`TOPE_LOTE`) y una planilla a 5 000 casillas (`TOPE_CELDAS`). Son dos
 * defensas distintas —cuánto cabe en una petición y cuántas peticiones caben en
 * una ventana— y hacen falta las dos.
 */
export const limiteEscritura = limitador({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  // `skip` en vez de montar el middleware solo en algunas rutas: montado sobre
  // `apiRouter`, cualquier ruta de escritura que alguien añada mañana queda
  // cubierta sin acordarse de nada. Marcar cuáles escriben deja fuera la nueva,
  // y una ruta de escritura sin marcar no falla: concede.
  skip: (req: Request) => esLectura(req.method),
  message: {
    ok: false,
    message:
      'Has hecho muchos cambios seguidos. Espera unos minutos antes de continuar; ' +
      'si estás importando datos, hazlo en menos tandas y más grandes.',
  },
});

/**
 * Cupo de las **escrituras masivas**, encima de los dos anteriores.
 *
 * Estas son las que escriben cientos o miles de documentos por petición, así
 * que su cupo se mide en «cuántas importaciones hace una persona seguidas», no
 * en peticiones. Veinte es un día entero de trabajo de importación; un bucle lo
 * agota en segundos.
 */
export const limiteLotes = limitador({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: {
    ok: false,
    message:
      'Has hecho muchas importaciones seguidas. Espera unos minutos: cada una ' +
      'escribe cientos de registros y el servidor las procesa de una en una.',
  },
});

/**
 * Cupo del inicio de sesión: dos limitadores, y los dos cuentan **solo los
 * intentos fallidos**.
 *
 * Contaba todo, y eso rompía por el lado bueno: diez inicios de sesión por IP
 * cada quince minutos —correctos incluidos— es un cupo que un campus entero
 * detrás de una NAT gasta antes de la primera clase, y el undécimo docente
 * recibía «Demasiados intentos» sin haberse equivocado nunca. La suite E2E lo
 * demostraba sola: inicia sesión con una cuenta por escenario y a partir de la
 * décima todo devolvía 429. Un inicio de sesión correcto no es un intento de
 * fuerza bruta, así que no descuenta cupo.
 *
 * **Por IP** con un cupo amplio (30 fallos): es el freno contra una máquina
 * probando contraseñas, y treinta errores en quince minutos desde la misma
 * dirección no los produce nadie tecleando.
 *
 * **Por correo** con un cupo corto (10 fallos): es lo que frena a quien reparte
 * los intentos contra una sola cuenta entre muchas direcciones. Va *además* del
 * de IP, no en su lugar — solo, bastaría variar el correo para estrenar cupo en
 * cada intento. Se normaliza igual que en el login (minúsculas, sin espacios)
 * para que `Ana@` y `ana@` sean la misma cuenta.
 */
const RESPUESTA_LOGIN = { ok: false, message: 'Demasiados intentos. Espera unos minutos.' };

const limiteLoginPorIp = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: RESPUESTA_LOGIN,
});

function correoDelCuerpo(req: Request): string {
  const email = (req.body as { email?: unknown } | undefined)?.email;
  const clave = typeof email === 'string' ? email.trim().toLowerCase() : '';
  return clave ? `correo:${clave}` : `ip:${req.ip ?? 'anonimo'}`;
}

const limiteLoginPorCorreo = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: correoDelCuerpo,
  message: RESPUESTA_LOGIN,
});

/** Se monta con `app.use(ruta, limiteLogin)`: Express acepta la lista. */
export const limiteLogin = [limiteLoginPorIp, limiteLoginPorCorreo];
