/**
 * Patrones de inasistencia. **Lógica pura, sin base de datos.**
 *
 * El porcentaje de asistencia ya lo calcula `attendance.service.ts`, y sirve
 * para el riesgo de fin de semestre; no sirve para detectar a tiempo. Un
 * estudiante con 78 % que ha faltado a las tres últimas clases seguidas está
 * abandonando la materia, y el porcentaje —que sigue por encima del umbral—
 * no lo dice. Estos patrones miran la FORMA de las faltas, no su cantidad.
 *
 * Todo lo que decide vive aquí y no en el servicio ni en los clientes: los
 * umbrales son la definición del problema, y repartidos por tres aplicaciones
 * acabarían siendo tres definiciones distintas del mismo aviso.
 */

export type Patron =
  | 'AUSENCIAS_CONSECUTIVAS_2'
  | 'AUSENCIAS_CONSECUTIVAS_3'
  | 'TARDANZAS_REPETIDAS'
  | 'CAIDA_RECIENTE'
  | 'ASISTENCIA_PARCIAL_REPETIDA';

export type Severidad = 'BAJA' | 'MEDIA' | 'ALTA';

/**
 * Umbrales, en un solo sitio y con nombre.
 *
 * Cambiar una cifra aquí cambia el aviso en el backend, el escritorio y el
 * móvil a la vez, porque ninguno de los tres tiene su propia copia. Y como
 * están fijados por pruebas, un cambio de umbral rompe una prueba en vez de
 * cambiar en silencio a quién se avisa.
 */
export const UMBRALES_PATRON = {
  /** Faltas seguidas que abren un caso leve. */
  CONSECUTIVAS_AVISO: 2,
  /** Faltas seguidas que lo convierten en grave. */
  CONSECUTIVAS_GRAVES: 3,
  /** Minutos a partir de los cuales una llegada cuenta como tarde. */
  MINUTOS_TARDE: 10,
  /** Tardanzas necesarias para abrir un caso. */
  TARDANZAS_MINIMAS: 3,
  /** Clases que forman la "ventana reciente" al comparar con el historial. */
  VENTANA_RECIENTE: 4,
  /** Clases previas mínimas para que la comparación signifique algo. */
  HISTORIAL_MINIMO: 4,
  /** Puntos porcentuales de caída que abren un caso. */
  CAIDA_PUNTOS: 25,
  /**
   * Fracción de la clase que hay que perder para que la asistencia se
   * considere parcial. Llegar diez minutos tarde a una clase de tres horas no
   * es asistencia parcial; llegar cuarenta a una de noventa minutos, sí.
   */
  FRACCION_PARCIAL: 0.25,
  /** Asistencias parciales necesarias para abrir un caso. */
  PARCIALES_MINIMAS: 3,
} as const;

/** Una clase, ordenada por fecha por quien llama. */
export type ClaseAsistida = {
  date: Date | string;
  present: boolean;
  durationMinutes?: number | null;
  /** Minutos de retraso. Ausente en registros anteriores a su captura: cuenta 0. */
  lateMinutes?: number | null;
};

export type DeteccionPatron = {
  patron: Patron;
  severidad: Severidad;
  /** Frase que lee el docente. */
  evidencia: string;
  /** Cifras que sustentan la frase, para pintarlas sin volver a calcularlas. */
  datos: Record<string, number | string>;
};

function aTiempo(clase: ClaseAsistida): number {
  const valor = new Date(clase.date).getTime();
  return Number.isNaN(valor) ? 0 : valor;
}

function duracion(clase: ClaseAsistida): number {
  const minutos = Number(clase.durationMinutes ?? 90);
  return Number.isFinite(minutos) && minutos > 0 ? minutos : 90;
}

function retraso(clase: ClaseAsistida): number {
  const minutos = Number(clase.lateMinutes ?? 0);
  return Number.isFinite(minutos) && minutos > 0 ? minutos : 0;
}

/** Fecha corta para la evidencia. Sin hora: el patrón es de días, no de minutos. */
function fechaCorta(valor: Date | string): string {
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return '';
  return `${String(fecha.getUTCDate()).padStart(2, '0')}/${String(fecha.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Ausencias seguidas al FINAL de la serie.
 *
 * Se miran las últimas y no la racha más larga del semestre a propósito: una
 * racha de tres faltas en marzo que terminó no es un problema abierto en mayo,
 * y abrir un caso por ella enseñaría a ignorar los casos.
 */
function rachaFinal(clases: ClaseAsistida[]): ClaseAsistida[] {
  const racha: ClaseAsistida[] = [];
  for (let i = clases.length - 1; i >= 0; i -= 1) {
    if (clases[i].present) break;
    racha.unshift(clases[i]);
  }
  return racha;
}

/** Porcentaje ponderado por minutos de un tramo. Misma regla que el dominio. */
function porcentaje(clases: ClaseAsistida[]): number {
  let total = 0;
  let presente = 0;
  for (const clase of clases) {
    const minutos = duracion(clase);
    total += minutos;
    if (clase.present) presente += minutos - Math.min(retraso(clase), minutos);
  }
  return total ? Math.round((presente / total) * 1000) / 10 : 100;
}

/**
 * Detecta todos los patrones activos de un estudiante en una materia.
 *
 * Las clases pueden llegar en cualquier orden; aquí se ordenan. Confiar en el
 * orden del llamador es la clase de suposición que funciona hasta que alguien
 * cambia un `sort` en una consulta y las rachas empiezan a contarse al revés
 * sin que nada falle.
 */
export function detectarPatrones(clasesEntrada: ClaseAsistida[]): DeteccionPatron[] {
  const clases = [...clasesEntrada].sort((a, b) => aTiempo(a) - aTiempo(b));
  if (clases.length === 0) return [];

  const detecciones: DeteccionPatron[] = [];

  // ── Ausencias consecutivas ────────────────────────────────────────────
  const racha = rachaFinal(clases);
  if (racha.length >= UMBRALES_PATRON.CONSECUTIVAS_GRAVES) {
    detecciones.push({
      patron: 'AUSENCIAS_CONSECUTIVAS_3',
      severidad: 'ALTA',
      evidencia: `${racha.length} ausencias seguidas (${fechaCorta(racha[0].date)} – ${fechaCorta(racha[racha.length - 1].date)}).`,
      datos: {
        consecutivas: racha.length,
        desde: fechaCorta(racha[0].date),
        hasta: fechaCorta(racha[racha.length - 1].date),
      },
    });
  } else if (racha.length >= UMBRALES_PATRON.CONSECUTIVAS_AVISO) {
    // Solo uno de los dos. Emitir los dos duplicaría el caso y la notificación
    // del mismo hecho, con dos claves distintas que el dedupe no relaciona.
    detecciones.push({
      patron: 'AUSENCIAS_CONSECUTIVAS_2',
      severidad: 'MEDIA',
      evidencia: `${racha.length} ausencias seguidas (${fechaCorta(racha[0].date)} – ${fechaCorta(racha[racha.length - 1].date)}).`,
      datos: {
        consecutivas: racha.length,
        desde: fechaCorta(racha[0].date),
        hasta: fechaCorta(racha[racha.length - 1].date),
      },
    });
  }

  // ── Tardanzas repetidas ───────────────────────────────────────────────
  const tardanzas = clases.filter(c => c.present && retraso(c) >= UMBRALES_PATRON.MINUTOS_TARDE);
  if (tardanzas.length >= UMBRALES_PATRON.TARDANZAS_MINIMAS) {
    const promedio = Math.round(
      tardanzas.reduce((suma, c) => suma + retraso(c), 0) / tardanzas.length,
    );
    detecciones.push({
      patron: 'TARDANZAS_REPETIDAS',
      severidad: tardanzas.length >= UMBRALES_PATRON.TARDANZAS_MINIMAS * 2 ? 'MEDIA' : 'BAJA',
      evidencia: `${tardanzas.length} llegadas tarde, ${promedio} min de retraso medio.`,
      datos: { tardanzas: tardanzas.length, promedioMinutos: promedio },
    });
  }

  // ── Caída reciente ────────────────────────────────────────────────────
  // Compara la ventana reciente con lo anterior. Sin historial suficiente no
  // se compara: dos clases no son una tendencia, y avisar por ellas llenaría
  // la bandeja la primera semana de cada semestre.
  if (clases.length >= UMBRALES_PATRON.VENTANA_RECIENTE + UMBRALES_PATRON.HISTORIAL_MINIMO) {
    const corte = clases.length - UMBRALES_PATRON.VENTANA_RECIENTE;
    const antes = porcentaje(clases.slice(0, corte));
    const ahora = porcentaje(clases.slice(corte));
    const caida = Math.round((antes - ahora) * 10) / 10;
    if (caida >= UMBRALES_PATRON.CAIDA_PUNTOS) {
      detecciones.push({
        patron: 'CAIDA_RECIENTE',
        severidad: caida >= UMBRALES_PATRON.CAIDA_PUNTOS * 2 ? 'ALTA' : 'MEDIA',
        evidencia: `La asistencia bajó de ${antes}% a ${ahora}% en las últimas ${UMBRALES_PATRON.VENTANA_RECIENTE} clases.`,
        datos: { antes, ahora, caida, ventana: UMBRALES_PATRON.VENTANA_RECIENTE },
      });
    }
  }

  // ── Asistencia parcial repetida ───────────────────────────────────────
  const parciales = clases.filter(
    c => c.present && retraso(c) >= duracion(c) * UMBRALES_PATRON.FRACCION_PARCIAL,
  );
  if (parciales.length >= UMBRALES_PATRON.PARCIALES_MINIMAS) {
    detecciones.push({
      patron: 'ASISTENCIA_PARCIAL_REPETIDA',
      severidad: 'MEDIA',
      evidencia: `${parciales.length} clases con asistencia parcial: perdió al menos la cuarta parte de cada una.`,
      datos: { parciales: parciales.length },
    });
  }

  return detecciones;
}

/**
 * Clave de deduplicación del aviso.
 *
 * Identifica el hecho —«este estudiante, esta materia, este periodo, este
 * patrón»— y no el documento del caso ni la fecha de detección. Con la fecha
 * dentro, cada pasada crearía un aviso nuevo del mismo problema.
 */
export function claveDePatron(
  studentId: string,
  subjectId: string,
  period: string,
  patron: Patron,
): string {
  return `attendance-pattern:${studentId}:${subjectId}:${period}:${patron}`;
}

/** Título legible de cada patrón, para la notificación y el historial. */
export const TITULO_PATRON: Record<Patron, string> = {
  AUSENCIAS_CONSECUTIVAS_2: 'Dos ausencias seguidas',
  AUSENCIAS_CONSECUTIVAS_3: 'Tres o más ausencias seguidas',
  TARDANZAS_REPETIDAS: 'Llegadas tarde repetidas',
  CAIDA_RECIENTE: 'Caída reciente de asistencia',
  ASISTENCIA_PARCIAL_REPETIDA: 'Asistencia parcial repetida',
};
