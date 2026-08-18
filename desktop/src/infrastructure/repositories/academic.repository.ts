/**
 * Índice de los adaptadores académicos.
 *
 * Este archivo tenía 539 líneas y doce repositorios —estudiantes, materias,
 * grupos, matrículas, notas, asistencia, escáneres, docentes, registro,
 * avisos, sugerencias y descargas—: todo el acceso a datos del producto en un
 * sitio. Cualquier endpoint nuevo, de cualquier pantalla, aterrizaba aquí.
 *
 * Ahora cada capacidad tiene el suyo y esto es el índice, para que lo que ya
 * importaba de aquí siga funcionando.
 */
export * from './students.repository';
export * from './subjects.repository';
export * from './enrollment.repository';
export * from './grades.repository';
export * from './attendance.repository';
export * from './professors.repository';
export * from './thesis.repository';
export * from './announcements.repository';
export * from './feedback.repository';
export * from './downloads.repository';
