/**
 * Guion del recorrido guiado.
 *
 * Cada paso apunta a un elemento real por `data-tour` o por selector, y puede
 * cambiar de pantalla antes de señalar. El orden sigue el trabajo de un docente
 * a lo largo del semestre —armar la materia, matricular, calificar, pasar
 * lista, mirar el riesgo, sacar el reporte—, no el orden del menú: se aprende
 * mejor una herramienta cuando el recorrido se parece a lo que uno va a hacer.
 *
 * Los pasos sin `selector` salen centrados. Se usan para abrir y cerrar, donde
 * no hay nada concreto que iluminar.
 */
export type PasoTour = {
  titulo: string;
  texto: string;
  /** Selector CSS del elemento a resaltar. Sin él, la nota va centrada. */
  selector?: string;
  /** Pantalla en la que vive el paso. */
  ruta?: string;
};

export const PASOS: PasoTour[] = [
  {
    titulo: 'Bienvenido a UTS Nexus Académico',
    texto:
      'Te voy a mostrar la aplicación en un minuto. Puedes salir cuando quieras con Esc o el botón Saltar, y volver a verlo desde Configuración.',
    ruta: '/',
  },
  {
    titulo: 'El panel',
    texto:
      'Lo primero que ves al entrar: cuántos estudiantes tienes, cómo va el promedio y quién está en riesgo. Es un resumen, no un sitio donde se edite nada.',
    selector: '[data-tour="nav-/"]',
    ruta: '/',
  },
  {
    titulo: 'Tus materias',
    texto:
      'Aquí están las asignaturas que dictas. Desde el botón de estudiantes de cada tarjeta puedes importar la lista del grupo desde un archivo, o buscar a alguien que ya esté registrado.',
    selector: '[data-tour="nav-/materias"]',
    ruta: '/materias',
  },
  {
    titulo: 'Estudiantes',
    texto:
      'El listado de tus estudiantes. Con el selector de materia ves solo los de una asignatura concreta; sin él, todos los que tienes a cargo. Nunca vas a ver los de otro docente.',
    selector: '[data-tour="nav-/estudiantes"]',
    ruta: '/estudiantes',
  },
  {
    titulo: 'Notas',
    texto:
      'Las notas se registran por corte y por componente: trabajos, parciales y autoevaluación. El promedio del corte y la definitiva los calcula el servidor con los pesos del reglamento, así que no tienes que hacer cuentas.',
    selector: '[data-tour="nav-/notas"]',
    ruta: '/notas',
  },
  {
    titulo: 'Asistencia',
    texto:
      'Puedes pasar lista tocando cada estudiante, o fotografiar la planilla de papel y dejar que la app la lea. Si escaneas, siempre te muestra lo que entendió para que lo revises antes de guardar.',
    selector: '[data-tour="nav-/asistencia"]',
    ruta: '/asistencia',
  },
  {
    titulo: 'Riesgo académico',
    texto:
      'Cruza notas, tendencia entre cortes y asistencia para señalarte a quién conviene llamar antes de que sea tarde. Siempre te dice en qué se basó: si no puede explicarlo, no lo muestra.',
    selector: '[data-tour="nav-/riesgo"]',
    ruta: '/riesgo',
  },
  {
    titulo: 'Avisos',
    texto:
      'Las comunicaciones de la administración llegan aquí: cambios de fechas, cierres de corte, reuniones. Los que no has abierto aparecen marcados.',
    selector: '[data-tour="nav-/avisos"]',
    ruta: '/avisos',
  },
  {
    titulo: 'Reportes',
    texto:
      'El consolidado de notas y asistencia en PDF o Excel, listo para entregar. Sale con los mismos números que ves en pantalla, porque los genera el mismo motor.',
    selector: '[data-tour="nav-/reportes"]',
    ruta: '/reportes',
  },
  {
    titulo: 'Configuración',
    texto:
      'La dirección del servidor, el tema claro u oscuro, las actualizaciones y —si eres administrador— el registro de docentes. También puedes volver a ver este tutorial desde aquí.',
    selector: '[data-tour="nav-/configuracion"]',
    ruta: '/configuracion',
  },
  {
    titulo: 'Eso es todo',
    texto:
      'Ya conoces las partes principales. Un atajo útil: Ctrl+K abre la búsqueda global y te lleva a cualquier sección sin soltar el teclado.',
    ruta: '/',
  },
];
