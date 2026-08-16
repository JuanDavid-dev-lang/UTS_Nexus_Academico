/**
 * Parsing de notas pegadas como texto o subidas en CSV.
 *
 * Lógica pura: sin React, sin red, sin APIs de archivo — el mismo contrato que
 * `parse-roster.ts`. Entra texto tabular (cédula, nombre opcional y una o más
 * notas 0–5) y salen filas revisables o el motivo, por línea, de por qué no.
 *
 * Nada se recorta ni se descarta en silencio: una nota «45» casi seguro es un
 * 4.5 sin punto, y convertirla a 5 escribiría una calificación que nadie puso.
 */
import { detectDelimiter, splitLine } from '@/domain/roster/parse-roster';

export type GradesRow = {
  code: string;
  fullName: string;
  /** Una posición por columna de nota; `null` = celda vacía. */
  scores: (number | null)[];
  warnings: string[];
};

export type GradesParseError = {
  /** Número de línea 1-based, como lo ve el usuario en su archivo. */
  line: number;
  raw: string;
  reason: string;
};

export type GradesParseResult = {
  rows: GradesRow[];
  errors: GradesParseError[];
  /** Cuántas columnas de nota se detectaron (todas las filas van a este ancho). */
  columns: number;
  /** Filas descartadas porque la misma cédula apareció antes. */
  duplicates: number;
};

const HEADER_HINTS = ['cedula', 'documento', 'identificacion', 'codigo', 'nombre', 'estudiante', 'nota', 'parcial', 'corte'];

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

function looksLikeHeader(fields: string[]): boolean {
  // Cabecera = tiene pinta de títulos Y no trae ningún número que pudiera ser
  // una nota. «Nota 1» contiene un 1, así que el segundo criterio es necesario.
  const hinted = fields.filter((field) => HEADER_HINTS.some((hint) => normalize(field).startsWith(hint)));
  return hinted.length >= 2 || (hinted.length === 1 && !fields.some((f) => /^\d+[.,]?\d*$/.test(f.trim())));
}

/** Interpreta una celda como nota 0–5; fuera de rango se marca, no se recorta. */
export function parseScore(cell: string): { value: number | null; warning: string | null } {
  const text = cell.trim().replace(',', '.');
  if (!text || !/^-?\d+(\.\d+)?$/.test(text)) return { value: null, warning: null };

  const value = Number(text);
  if (value < 0 || value > 5) {
    return { value: null, warning: `«${cell.trim()}» está fuera del rango 0–5; revísala.` };
  }
  return { value, warning: null };
}

/**
 * Convierte texto tabular en filas de notas listas para revisar.
 *
 * No exige orden de columnas: la cédula es la primera celda de solo dígitos
 * largos, las notas son números 0–5 y el nombre es el resto.
 */
export function parseGrades(text: string): GradesParseResult {
  const rows: GradesRow[] = [];
  const errors: GradesParseError[] = [];
  const seen = new Set<string>();
  let duplicates = 0;

  const clean = text.replace(/^﻿/, '');
  const lines = clean.split(/\r?\n/);
  const meaningful = lines.filter((line) => line.trim().length > 0);
  if (meaningful.length === 0) return { rows, errors, columns: 0, duplicates };

  const delimiter = detectDelimiter(meaningful);

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (line.trim().length === 0) return;

    const fields = splitLine(line, delimiter);
    if (looksLikeHeader(fields)) return;

    let code = '';
    const nameParts: string[] = [];
    const scores: (number | null)[] = [];
    const warnings: string[] = [];

    for (const field of fields) {
      const trimmed = field.trim();
      if (!trimmed) continue;

      // Cédula: solo dígitos (admite puntos de miles), 5+ tras limpiar. El
      // largo la separa de una nota entera como «4».
      const asCode = trimmed.replace(/[\s.]/g, '');
      if (!code && /^\d{5,12}$/.test(asCode)) {
        code = asCode;
        continue;
      }

      const score = parseScore(trimmed);
      if (score.warning) {
        warnings.push(score.warning);
        scores.push(null);
        continue;
      }
      if (score.value !== null) {
        scores.push(score.value);
        continue;
      }
      if (/\p{L}/u.test(trimmed)) nameParts.push(trimmed);
    }

    if (!code && scores.length === 0) return; // ni identidad ni notas: ruido

    if (!code) {
      errors.push({ line: lineNumber, raw: line.trim(), reason: 'No se encontró la cédula (solo dígitos, mínimo 5).' });
      return;
    }
    if (scores.length === 0 && warnings.length === 0) {
      errors.push({ line: lineNumber, raw: line.trim(), reason: 'La fila no trae ninguna nota.' });
      return;
    }
    if (seen.has(code)) {
      duplicates++;
      return;
    }

    seen.add(code);
    rows.push({
      code,
      fullName: nameParts.join(' ').replace(/\s+/g, ' ').trim(),
      scores,
      warnings,
    });
  });

  // Mismo ancho para todas: la columna N tiene que ser la misma nota en todas.
  const columns = rows.reduce((max, row) => Math.max(max, row.scores.length), 0);
  for (const row of rows) {
    while (row.scores.length < columns) row.scores.push(null);
  }

  return { rows, errors, columns, duplicates };
}
