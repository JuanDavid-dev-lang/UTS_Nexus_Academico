/**
 * Lo último que se eligió en «Mantener la sesión iniciada».
 *
 * Es una preferencia de interfaz, no un secreto: va en `localStorage`. Los
 * tokens siguen yendo solo al almacén del sistema (ver `token.service.ts`).
 * Por defecto, marcada: casi siempre es el equipo propio del docente, y
 * desmarcarla es lo que hace quien entra desde la sala común.
 */
const CLAVE = 'uts.recordarSesion';

export function leerRecordarSesion(): boolean {
  try {
    return localStorage.getItem(CLAVE) !== '0';
  } catch {
    return true;
  }
}

export function guardarRecordarSesion(valor: boolean): void {
  try {
    localStorage.setItem(CLAVE, valor ? '1' : '0');
  } catch {
    // Sin almacenamiento la casilla vuelve marcada la próxima vez; nada más.
  }
}
