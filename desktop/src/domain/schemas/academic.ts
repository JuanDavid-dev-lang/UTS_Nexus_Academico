/**
 * Índice de los esquemas académicos.
 *
 * Este archivo tenía 585 líneas y quince secciones —estudiantes, materias,
 * notas, asistencia, matrículas, riesgo, avisos, sugerencias, descargas…—, es
 * decir, todo el dominio del producto en un solo sitio. Cualquier campo nuevo,
 * de cualquier pantalla, se añadía aquí, así que todos los cambios chocaban en
 * el mismo archivo y ninguna capacidad se podía leer sin desplazarse por las
 * otras catorce.
 *
 * Ahora cada capacidad tiene el suyo y esto es solo el índice, para que los
 * cuarenta sitios que ya importaban de aquí sigan funcionando. Un índice de
 * reexportación no es un archivo central: es un sitio desde el que navegar.
 */
export * from './students';
export * from './subjects';
export * from './grades';
export * from './attendance';
export * from './enrollment';
export * from './risk';
export * from './professors';
export * from './thesis';
export * from './registration';
export * from './announcements';
export * from './feedback';
export * from './downloads';
