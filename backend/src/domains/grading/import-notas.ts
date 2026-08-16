/**
 * Interpretación de una matriz de notas (Excel, CSV, texto pegado u OCR) y su
 * cruce con la matrícula del grupo.
 *
 * Lógica pura: sin I/O, sin Mongo, sin Express. El mismo principio que el
 * escáner de asistencia: **nada se da por bueno en silencio**. Una nota fuera
 * de rango o una fila sin dueño claro se devuelve marcada para que la revise
 * el docente — el coste de adivinar aquí es una calificación equivocada en el
 * consolidado de alguien.
 */
import {
  cruzarConMatricula,
  type FilaLeida,
  type Matriculado,
  type NivelCoincidencia,
} from '../attendance/sheet-match.js';

export type FilaNotasLeida = {
  indice: number;
  cedula: string;
  nombre: string;
  /** 0–1. Excel y texto pegado valen 1; el OCR trae la suya. */
  confianza: number;
  /** Una posición por columna de nota; `null` = celda vacía o ilegible. */
  notas: (number | null)[];
  avisos: string[];
};

export type ResultadoMatriz = {
  filas: FilaNotasLeida[];
  /** Cuántas columnas de nota se detectaron (todas las filas se rellenan a este ancho). */
  columnas: number;
  avisos: string[];
};

const CEDULA = /^\d{5,12}$/;

/** Interpreta el texto de una celda como nota 0–5; `null` si no es una nota. */
export function leerNota(celda: string): { valor: number | null; aviso: string | null } {
  const texto = celda.trim().replace(',', '.');
  if (!texto || !/^-?\d+(\.\d+)?$/.test(texto)) return { valor: null, aviso: null };

  const valor = Number(texto);
  if (valor < 0 || valor > 5) {
    // No se recorta en silencio: un «45» probablemente es un 4.5 sin punto, y
    // recortarlo a 5 escribiría una nota que nadie puso.
    return { valor: null, aviso: `«${celda.trim()}» está fuera del rango 0–5; revísala.` };
  }
  return { valor, aviso: null };
}

/**
 * Interpreta una matriz de celdas (filas × columnas) como listado de notas.
 *
 * No asume orden de columnas: la cédula se reconoce por forma (solo dígitos,
 * 5–12), las notas por ser números 0–5 y el nombre por ser el resto. Las filas
 * sin cédula ni nota (cabeceras, pies, títulos) se descartan.
 */
export function interpretarMatrizNotas(matriz: string[][]): ResultadoMatriz {
  const filas: FilaNotasLeida[] = [];
  const avisos: string[] = [];

  matriz.forEach((celdas, indiceFila) => {
    const limpias = celdas.map(c => String(c ?? '').trim());
    if (limpias.every(c => !c)) return;

    let cedula = '';
    const partesNombre: string[] = [];
    const notas: (number | null)[] = [];
    const filaAvisos: string[] = [];

    for (const celda of limpias) {
      if (!celda) continue;
      if (!cedula && CEDULA.test(celda)) {
        cedula = celda;
        continue;
      }
      const nota = leerNota(celda);
      if (nota.aviso) {
        filaAvisos.push(nota.aviso);
        notas.push(null);
        continue;
      }
      if (nota.valor !== null) {
        notas.push(nota.valor);
        continue;
      }
      partesNombre.push(celda);
    }

    // Sin cédula y sin ninguna nota no es una fila de estudiante: es una
    // cabecera («Cédula  Nombre  Nota 1») o un pie de página.
    if (!cedula && notas.length === 0) return;

    if (!cedula) filaAvisos.push('No se encontró la cédula en esta fila.');
    filas.push({
      indice: indiceFila,
      cedula,
      nombre: partesNombre.join(' ').replace(/\s+/g, ' ').trim(),
      confianza: 1,
      notas,
      avisos: filaAvisos,
    });
  });

  // Todas las filas al mismo ancho: la columna N de una fila tiene que ser la
  // misma nota que la columna N de las demás.
  const columnas = filas.reduce((max, f) => Math.max(max, f.notas.length), 0);
  for (const fila of filas) {
    while (fila.notas.length < columnas) fila.notas.push(null);
  }

  if (!filas.length) avisos.push('No se reconoció ninguna fila con cédula o notas.');
  if (columnas === 0 && filas.length) avisos.push('Ninguna fila trae notas: solo se leyeron identidades.');

  return { filas, columnas, avisos };
}

export type FilaNotasCruzada = {
  indice: number;
  cedulaLeida: string;
  nombreLeido: string;
  studentId: string | null;
  code: string | null;
  fullName: string | null;
  nivel: NivelCoincidencia;
  confianza: number;
  notas: (number | null)[];
  avisos: string[];
};

export type ResultadoCruceNotas = {
  filas: FilaNotasCruzada[];
  /** Matriculados sin fila en el archivo. No se les escribe nada. */
  sinFila: Matriculado[];
  avisos: string[];
};

/**
 * Cruza filas de notas con los matriculados del grupo.
 *
 * Reutiliza el algoritmo del escáner de asistencia (cédula exacta → cédula
 * parecida + nombre → solo nombre → sin asignar): es el mismo problema y dos
 * implementaciones divergirían en los casos límite.
 */
export function cruzarNotasConMatricula(
  filas: FilaNotasLeida[],
  matriculados: Matriculado[],
): ResultadoCruceNotas {
  const comoLeidas: FilaLeida[] = filas.map(f => ({
    indice: f.indice,
    cedula: f.cedula,
    cedulaConfianza: f.confianza,
    nombre: f.nombre,
    nombreConfianza: f.confianza,
    celdas: [],
  }));

  const cruce = cruzarConMatricula(comoLeidas, matriculados);
  const porIndice = new Map(filas.map(f => [f.indice, f]));

  return {
    filas: cruce.filas.map(f => {
      const original = porIndice.get(f.indice);
      return {
        indice: f.indice,
        cedulaLeida: f.cedulaLeida,
        nombreLeido: f.nombreLeido,
        studentId: f.studentId,
        code: f.code,
        fullName: f.fullName,
        nivel: f.nivel,
        confianza: original?.confianza ?? 1,
        notas: original?.notas ?? [],
        avisos: [...(original?.avisos ?? []), ...f.avisos],
      };
    }),
    sinFila: cruce.ausentesDeLaFoto,
    avisos: cruce.avisos,
  };
}
