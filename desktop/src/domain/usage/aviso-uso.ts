/**
 * Aviso de uso y privacidad.
 *
 * El servidor solo guarda qué versión vio cada persona (`Usuario.avisoUsoVersion`);
 * el texto vive aquí, en el móvil (`flutter_app/lib/features/usage/aviso_uso.dart`)
 * y en `docs/USO_Y_PRIVACIDAD.md`. **Los tres dicen lo mismo y llevan la misma
 * versión que `backend/src/domains/usage/aviso-uso.ts`**: subirla en uno y no en
 * los demás vuelve a enseñar el aviso en un cliente y no en el otro.
 */
export const AVISO_USO_VERSION = 1;

export const AVISO_USO_TITULO = 'Uso de la aplicación y privacidad';

export const AVISO_USO_PARRAFOS: readonly string[] = [
  'UTS Nexus registra cuándo usas la aplicación: los días en que entras, el tiempo aproximado de actividad (en tramos de 5 minutos), el número de peticiones y si lo haces desde el escritorio, la web o el móvil. No registra qué pantallas abres ni qué datos consultas o escribes.',
  'Estos datos no se publican ni se comparten con terceros. Solo los ve la administración de la plataforma y únicamente con valor estadístico: para saber cuánto se usa la aplicación y mejorarla.',
  'Tú eres el dueño de tus datos. Puedes pedir a la administración que te muestre lo registrado sobre ti o que lo elimine. Los registros se borran solos a los 400 días.',
];

/** ¿Hay que enseñar el diálogo? Sin conexión no: no se podría marcar y no debe bloquear. */
export function debeMostrarAvisoUso(
  usuario: { avisoUsoPendiente?: boolean } | null | undefined,
  enLinea: boolean,
  descartado: boolean,
): boolean {
  return Boolean(usuario?.avisoUsoPendiente) && enLinea && !descartado;
}
