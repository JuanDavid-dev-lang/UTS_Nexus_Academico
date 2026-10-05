/**
 * Qué consultas se guardan en disco para abrir sin conexión.
 *
 * Solo lo que un docente necesita para trabajar con el servidor apagado:
 * materias, grupos, estudiantes, matrículas, notas, asistencia, periodos, su
 * perfil y el panel. Lo demás (avisos, auditoría, administración, búsquedas,
 * el QR de la clase) cambia por reloj o no tiene sentido sin servidor, y
 * guardarlo sería llenar el disco de datos que no se usarán — y de datos
 * ajenos al docente, que es lo que MENOS conviene dejar en un equipo.
 */

export const DIAS_DE_CACHE = 7;
export const VIDA_MAXIMA_CACHE_MS = DIAS_DE_CACHE * 24 * 60 * 60 * 1000;

/** Raíz de la clave → subclaves admitidas (`null` = todas). */
const PERSISTIBLES: Readonly<Record<string, readonly string[] | null>> = {
  subjects: null,
  groups: null,
  enrollments: null,
  students: ['list'],
  grades: null,
  gradeTemplates: null,
  attendance: ['list', 'summary'],
  periods: ['list'],
  profile: null,
  analytics: ['dashboard', 'risks'],
  schedules: null,
};

/** Las raíces, para darles una vida en memoria igual a la del disco. */
export const RAICES_PERSISTIDAS: readonly string[] = Object.keys(PERSISTIBLES);

export function debePersistir(queryKey: readonly unknown[]): boolean {
  const raiz = queryKey[0];
  if (typeof raiz !== 'string' || !(raiz in PERSISTIBLES)) return false;
  const admitidas = PERSISTIBLES[raiz];
  if (admitidas === null || admitidas === undefined) return true;
  const sub = queryKey[1];
  return typeof sub === 'string' && admitidas.includes(sub);
}

/**
 * Lo que invalida la caché guardada: la versión de la aplicación (un esquema
 * nuevo no debe hidratarse con datos viejos). El usuario no va aquí: la caché
 * ya se guarda en una clave por usuario.
 */
export function selloDeCache(version: string): string {
  return `v${version}`;
}
