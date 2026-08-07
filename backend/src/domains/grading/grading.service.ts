/**
 * Motor de calificación canónico de UTS Académico.
 *
 * ÚNICA fuente de verdad para el cálculo de notas. Ni el escritorio ni la app
 * móvil deben recalcular: consumen los endpoints que exponen estas funciones.
 *
 * Reglas académicas (UTS):
 *  - Cada corte se compone de: 30% trabajos + 60% parciales + 10% autoevaluación.
 *  - La nota final pondera los cortes: Corte 1 = 33%, Corte 2 = 33%, Corte 3 = 34%.
 *  - Escala 0.0 – 5.0; se aprueba con 3.0.
 *
 * Funciones puras y sin dependencias de I/O: 100% testeables.
 */

export type ComponenteTipo = 'TRABAJOS' | 'PARCIALES' | 'AUTOEVALUACION';
export type CorteNumero = 1 | 2 | 3;

/** Configuración académica. Centralizada para evitar "números mágicos" dispersos. */
export const RUBRICA = {
  COMPONENTES: {
    TRABAJOS: 0.3,
    PARCIALES: 0.6,
    AUTOEVALUACION: 0.1,
  } as Record<ComponenteTipo, number>,
  CORTES: {
    1: 0.33,
    2: 0.33,
    3: 0.34,
  } as Record<CorteNumero, number>,
  NOTA_APROBACION: 3.0,
  NOTA_MINIMA: 0.0,
  NOTA_MAXIMA: 5.0,
} as const;

/** Una nota individual capturada por el docente. */
export type NotaComponente = {
  corte: CorteNumero;
  tipo: ComponenteTipo;
  score: number;
  /**
   * Identidad de la nota concreta. Son opcionales porque el motor calcula igual
   * sin ellas —solo necesita `score`— pero sin ellas el cliente recibe un
   * promedio anónimo: puede decir «Trabajos: 4.2 de 3 notas» y no cuáles, así
   * que no hay forma de corregir la que está mal sin salir a otra pantalla.
   */
  id?: string;
  label?: string;
};

/** Una nota tal y como se le muestra al docente dentro de su componente. */
export type NotaDetalle = {
  id: string;
  label: string;
  score: number;
};

export type ResumenComponente = {
  tipo: ComponenteTipo;
  peso: number;
  /** Promedio de las notas capturadas de ese tipo en el corte (0 si no hay). */
  promedio: number;
  /** Cantidad de notas capturadas de ese tipo. */
  registros: number;
  /** Aporte del componente a la nota del corte (promedio * peso). */
  aporte: number;
  /**
   * Las notas que produjeron ese promedio, en el orden en que llegaron.
   * `registros` es su cantidad: se conserva porque es lo que ya consumían los
   * clientes y porque un resumen no debería obligar a contar un array.
   */
  notas: NotaDetalle[];
};

export type ResumenCorte = {
  corte: CorteNumero;
  peso: number;
  nota: number;
  aporteFinal: number;
  completo: boolean;
  componentes: ResumenComponente[];
};

export type ResumenNotaFinal = {
  notaFinal: number;
  aprobado: boolean;
  /** true solo si los 3 cortes tienen sus 3 componentes con al menos una nota. */
  completo: boolean;
  cortes: ResumenCorte[];
};

function redondear(valor: number): number {
  return Math.round(valor * 100) / 100;
}

function acotar(valor: number): number {
  if (Number.isNaN(valor)) return 0;
  return Math.min(RUBRICA.NOTA_MAXIMA, Math.max(RUBRICA.NOTA_MINIMA, valor));
}

/**
 * Calcula el resumen de un único corte a partir de sus notas.
 * Si un tipo tiene varias notas, se promedian. Si no tiene ninguna, aporta 0.
 */
export function calcularCorte(corte: CorteNumero, notas: NotaComponente[]): ResumenCorte {
  const delCorte = notas.filter(n => n.corte === corte);

  const componentes: ResumenComponente[] = (
    Object.keys(RUBRICA.COMPONENTES) as ComponenteTipo[]
  ).map(tipo => {
    const peso = RUBRICA.COMPONENTES[tipo];
    const registros = delCorte.filter(n => n.tipo === tipo);
    const promedio = registros.length
      ? acotar(registros.reduce((sum, n) => sum + n.score, 0) / registros.length)
      : 0;
    return {
      tipo,
      peso,
      promedio: redondear(promedio),
      registros: registros.length,
      aporte: redondear(promedio * peso),
      notas: registros.map((n, indice) => ({
        // Sin id de origen se sintetiza uno estable dentro del corte: el cliente
        // necesita una clave para listar, y una nota sin persistir todavía no
        // tiene _id.
        id: n.id ?? `${corte}-${tipo}-${indice}`,
        label: n.label?.trim() || 'Nota',
        score: n.score,
      })),
    };
  });

  const nota = acotar(componentes.reduce((sum, c) => sum + c.promedio * c.peso, 0));
  const completo = componentes.every(c => c.registros > 0);
  const peso = RUBRICA.CORTES[corte];

  return {
    corte,
    peso,
    nota: redondear(nota),
    aporteFinal: redondear(nota * peso),
    completo,
    componentes,
  };
}

/**
 * Calcula la nota final ponderando los 3 cortes (33/33/34).
 * Recibe TODAS las notas de un estudiante en una materia/periodo.
 */
export function calcularNotaFinal(notas: NotaComponente[]): ResumenNotaFinal {
  const cortes = ([1, 2, 3] as CorteNumero[]).map(c => calcularCorte(c, notas));
  const notaFinal = acotar(cortes.reduce((sum, c) => sum + c.aporteFinal, 0));
  const completo = cortes.every(c => c.completo);

  return {
    notaFinal: redondear(notaFinal),
    aprobado: notaFinal >= RUBRICA.NOTA_APROBACION,
    completo,
    cortes,
  };
}

/**
 * Promedio PARCIAL: promedio ponderado considerando SOLO los cortes que ya
 * tienen alguna nota, renormalizando sus pesos. Refleja el desempeño actual del
 * estudiante a mitad de semestre sin castigarlo por cortes aún no calificados
 * (a diferencia de la nota final, que cuenta como 0 lo no calificado).
 */
export function calcularPromedioParcial(notas: NotaComponente[]): {
  promedio: number;
  cortesConNota: number;
} {
  const cortes = ([1, 2, 3] as CorteNumero[]).map(c => calcularCorte(c, notas));
  const conNota = cortes.filter(c => c.componentes.some(comp => comp.registros > 0));
  if (!conNota.length) return { promedio: 0, cortesConNota: 0 };
  const pesoTotal = conNota.reduce((sum, c) => sum + c.peso, 0);
  const promedio = conNota.reduce((sum, c) => sum + c.nota * c.peso, 0) / pesoTotal;
  return { promedio: redondear(acotar(promedio)), cortesConNota: conNota.length };
}

/**
 * Nota mínima que el estudiante necesita en el corte restante para aprobar,
 * asumiendo que los otros cortes ya están fijos. Devuelve null si ya no es
 * alcanzable o si ya aprobó con lo acumulado.
 */
export function notaNecesariaParaAprobar(
  notas: NotaComponente[],
  corteObjetivo: CorteNumero
): number | null {
  const cortes = ([1, 2, 3] as CorteNumero[]).map(c => calcularCorte(c, notas));
  const acumuladoOtros = cortes
    .filter(c => c.corte !== corteObjetivo)
    .reduce((sum, c) => sum + c.aporteFinal, 0);
  const pesoObjetivo = RUBRICA.CORTES[corteObjetivo];
  const requerida = (RUBRICA.NOTA_APROBACION - acumuladoOtros) / pesoObjetivo;
  if (requerida <= RUBRICA.NOTA_MINIMA) return 0;
  if (requerida > RUBRICA.NOTA_MAXIMA) return null;
  return redondear(requerida);
}
