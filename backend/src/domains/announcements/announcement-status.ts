/**
 * Estado de un aviso. Lógica pura, sin I/O.
 *
 * Lo guardado son dos fechas —`publicadoEn` y `expiraEn`— que decidió una
 * persona; si el aviso ya salió o ya caducó lo deriva el servidor con su reloj,
 * igual que el estado de una actividad. Los clientes no comparan fechas: un
 * equipo con la hora mal puesta enseñaría «Programado» un aviso que los
 * docentes ya están leyendo.
 */
export type EstadoAviso = 'PROGRAMADO' | 'VIGENTE' | 'CADUCADO';

export function estadoDeAviso(
  aviso: { publicadoEn: Date | string; expiraEn?: Date | string | null },
  ahora: Date,
): EstadoAviso {
  const publicado = new Date(aviso.publicadoEn).getTime();
  if (Number.isFinite(publicado) && publicado > ahora.getTime()) return 'PROGRAMADO';
  if (aviso.expiraEn) {
    const expira = new Date(aviso.expiraEn).getTime();
    if (Number.isFinite(expira) && expira <= ahora.getTime()) return 'CADUCADO';
  }
  return 'VIGENTE';
}

/** Error de fechas de un aviso, o `null` si son coherentes. */
export function errorDeFechasDeAviso(publicadoEn: Date, expiraEn: Date | null | undefined): string | null {
  if (expiraEn && expiraEn.getTime() <= publicadoEn.getTime()) {
    return 'La fecha de caducidad tiene que ser posterior a la de publicación.';
  }
  return null;
}

/**
 * Qué se puede cambiar de un aviso ya existente.
 *
 * Mover la publicación de uno que **ya salió** lo escondería a los docentes que
 * lo están leyendo, y su notificación ya se repartió: no habría segunda
 * campana cuando volviera a aparecer. Programar se hace antes de publicar; un
 * aviso publicado se corrige o se elimina.
 */
export function puedeMoverPublicacion(estadoActual: EstadoAviso): boolean {
  return estadoActual === 'PROGRAMADO';
}
