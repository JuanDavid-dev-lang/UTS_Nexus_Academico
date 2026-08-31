export const CUENTAS_PERSONAL_HASH = '#cuentas-personal';

/**
 * React Router cambia la URL sin una navegación completa, por lo que el
 * navegador no siempre desplaza por sí solo al elemento del hash.
 */
export function desplazarASeccion(hash: string): void {
  if (!hash.startsWith('#')) return;
  const id = decodeURIComponent(hash.slice(1));
  if (!id) return;
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
