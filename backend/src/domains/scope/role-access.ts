/**
 * Qué puede hacer un rol con una petición. **Lógica pura, sin Express.**
 *
 * Aquí viven dos reglas que, escritas en cada ruta, se habrían roto por
 * omisión:
 *
 * 1. **Secretaría lee lo que lee coordinación.** No se consigue añadiendo
 *    `'SECRETARY'` a las sesenta llamadas de `requireRole` que ya nombran a
 *    `'COORDINATOR'`: basta olvidar una para que secretaría vea una pantalla en
 *    blanco sin ninguna pista de por qué, y basta añadirla donde no tocaba para
 *    abrirle algo que no le corresponde. Se decide una vez, en
 *    `rolesEfectivos()`.
 *
 * 2. **Secretaría no escribe.** El corte es por método HTTP, no por ruta: un
 *    `POST`, `PUT`, `PATCH` o `DELETE` que llegue de una sesión de secretaría
 *    se rechaza con 403 antes de tocar ningún módulo. Lo contrario —marcar ruta
 *    por ruta cuál es de escritura— deja fuera la ruta nueva que alguien añada
 *    el mes que viene, y una ruta de escritura sin marcar es escritura
 *    concedida.
 *
 * La lista de excepciones es corta y explícita, y ninguna toca el expediente
 * académico: iniciar sesión, cerrarla, renovarla, marcar como leído un aviso
 * propio, registrar el teléfono para recibirlos, reportar un error del cliente
 * y escribir una sugerencia. Sin ellas, secretaría no podría ni entrar.
 */
import type { Role } from '../../shared/types.js';

/** Métodos que no modifican nada. `OPTIONS` entra por el preflight de CORS. */
export const METODOS_DE_LECTURA = ['GET', 'HEAD', 'OPTIONS'] as const;

export function esLectura(metodo: string): boolean {
  return (METODOS_DE_LECTURA as readonly string[]).includes(metodo.toUpperCase());
}

/**
 * Escrituras que una sesión de solo lectura sí puede hacer.
 *
 * Las rutas son relativas a la raíz de la API (`/api/v1`), que es lo que ve un
 * middleware montado sobre `apiRouter`. Se comparan con expresiones ancladas:
 * un prefijo suelto (`/auth`) dejaría pasar `/auth/register`.
 */
export const ESCRITURAS_DE_SOLO_LECTURA: readonly RegExp[] = [
  // Sesión: entrar, renovar, salir, recuperar y cambiar la propia contraseña.
  // `password` está aquí y no es una excepción incómoda: escribe sobre la
  // cuenta de quien la pide y sobre nada más. Dejarla fuera obligaba a que un
  // administrador cambiara la contraseña de secretaría por ella, que es lo
  // contrario de lo que consigue cambiarla.
  /^\/auth\/(login|refresh|logout|password|recovery\/request|recovery\/reset)$/,
  // Bandeja propia: marcar leído, borrar un aviso propio, preferencias.
  /^\/notifications\/(read-all|preferences)$/,
  /^\/notifications\/[^/]+\/read$/,
  /^\/notifications\/devices$/,
  /^\/notifications\/[^/]+$/,
  // Telemetría de cliente: un fallo de la propia aplicación se reporta solo.
  /^\/telemetry\/errores$/,
  // Buzón de sugerencias: escribir la suya propia.
  /^\/feedback$/,
  // Asistente: son POST porque llevan cuerpo, no porque cambien nada.
  /^\/ai\/(chat|quick)$/,
] as const;

/**
 * ¿Puede este rol ejecutar esta petición por su método?
 *
 * Solo dice que no cuando el rol es de solo lectura y la petición escribe. El
 * resto de la autorización —qué rol entra a qué ruta, y con qué alcance— sigue
 * siendo cosa de `requireRole` y del alcance de programa.
 */
export function puedeEscribir(role: Role | undefined, metodo: string, ruta: string): boolean {
  if (role !== 'SECRETARY') return true;
  if (esLectura(metodo)) return true;
  return ESCRITURAS_DE_SOLO_LECTURA.some(patron => patron.test(ruta));
}

/**
 * Roles que satisfacen un `requireRole`, dado quién llama y qué método usa.
 *
 * Secretaría cuenta como coordinación **solo en lectura**. La restricción del
 * método no es redundante con `puedeEscribir()`: si aquí se concediera sin
 * mirarlo, una ruta de escritura que solo exija `COORDINATOR` quedaría abierta
 * a secretaría en el momento en que alguien retirara el guardián global, y ese
 * cambio no rompería ninguna prueba.
 */
export function rolesEfectivos(role: Role | undefined, metodo: string): Role[] {
  if (!role) return [];
  if (role === 'SECRETARY' && esLectura(metodo)) return ['SECRETARY', 'COORDINATOR'];
  return [role];
}

/** ¿Alguno de los roles efectivos está entre los permitidos por la ruta? */
export function autorizadoPorRol(
  role: Role | undefined,
  metodo: string,
  permitidos: readonly Role[],
): boolean {
  return rolesEfectivos(role, metodo).some(efectivo => permitidos.includes(efectivo));
}
