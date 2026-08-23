/**
 * Parsing of a pasted or uploaded student roster.
 *
 * Pure domain logic: no React, no file APIs, no network. What arrives is text
 * exported from Excel or copied out of an institutional list, and what leaves is
 * either rows the backend accepts or a per-line reason why it did not.
 *
 * Nothing is silently discarded. A roster that loses three students without
 * saying so is worse than one that refuses to import, because the missing three
 * only surface weeks later as students with no grades.
 */
import { rosterRowSchema, type RosterRow } from '@/domain/schemas/academic';

export type RosterParseError = {
  /** 1-based line number as the user sees it in their file. */
  line: number;
  raw: string;
  reason: string;
};

export type RosterParseResult = {
  rows: RosterRow[];
  errors: RosterParseError[];
  /** Rows dropped because the same cédula appeared earlier in the file. */
  duplicates: number;
};

/** Delimiters seen in practice: Excel-ES uses `;`, Excel-EN `,`, and TSV a tab. */
const DELIMITERS = [';', ',', '\t', '|'] as const;

/** Cabeceras habituales, sin tildes ni mayúsculas, para detectar y saltar la fila de títulos. */
const HEADER_HINTS = ['cedula', 'documento', 'identificacion', 'codigo', 'nombre', 'estudiante', 'apellido'];

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Elige el separador que produce más columnas de forma consistente. Exportado: el import de notas lo reutiliza. */
export function detectDelimiter(lines: string[]): string {
  let best = ';';
  let bestScore = 0;

  for (const delimiter of DELIMITERS) {
    const counts = lines.slice(0, 20).map((line) => splitLine(line, delimiter).length);
    const score = counts.filter((count) => count >= 2).length;
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }
  return best;
}

/** Split respetando comillas dobles, que es como Excel escapa los nombres con coma. */
export function splitLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      // Dos comillas seguidas dentro de un campo entrecomillado son una comilla literal.
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === delimiter && !quoted) {
      fields.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  fields.push(current);
  return fields.map((field) => field.trim());
}

function looksLikeHeader(fields: string[]): boolean {
  return fields.some((field) => HEADER_HINTS.includes(normalize(field)));
}

/** Un documento es una cadena de dígitos; se le quitan puntos y espacios de miles. */
function cleanCode(value: string): string {
  return value.replace(/[\s.]/g, '');
}

/**
 * Convierte texto tabular en filas listas para `POST /enrollments/bulk`.
 *
 * Formato esperado: cédula y nombre completo, en ese orden o al revés — se
 * detecta cuál columna es numérica en vez de exigirle al usuario un orden fijo.
 * Las columnas extra (correo, programa) se aprovechan si están y se ignoran si no.
 */
export function parseRoster(text: string): RosterParseResult {
  const rows: RosterRow[] = [];
  const errors: RosterParseError[] = [];
  const seen = new Set<string>();
  let duplicates = 0;

  // El BOM que antepone Excel convertiría la primera cédula en un valor no numérico.
  const clean = text.replace(/^\uFEFF/, '');
  const lines = clean.split(/\r?\n/);
  const meaningful = lines.filter((line) => line.trim().length > 0);
  if (meaningful.length === 0) return { rows, errors, duplicates };

  const delimiter = detectDelimiter(meaningful);

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (line.trim().length === 0) return;

    const fields = splitLine(line, delimiter);
    if (looksLikeHeader(fields)) return;

    if (fields.length < 2) {
      errors.push({
        line: lineNumber,
        raw: line.trim(),
        reason: 'Se esperaban al menos dos columnas: cédula y nombre.',
      });
      return;
    }

    // La cédula es la primera columna que es solo dígitos; así el archivo puede
    // venir como "cédula, nombre" o como "nombre, cédula".
    const codeIndex = fields.findIndex((field) => /^\d[\d\s.]*$/.test(field) && cleanCode(field).length >= 3);
    if (codeIndex === -1) {
      errors.push({
        line: lineNumber,
        raw: line.trim(),
        reason: 'No se encontró una cédula (solo dígitos, mínimo 3).',
      });
      return;
    }

    const code = cleanCode(fields[codeIndex] ?? '');
    const name = fields
      .filter((_, position) => position !== codeIndex)
      .find((field) => /\p{L}/u.test(field));

    if (!name) {
      errors.push({ line: lineNumber, raw: line.trim(), reason: 'Falta el nombre del estudiante.' });
      return;
    }

    if (seen.has(code)) {
      duplicates++;
      return;
    }

    // Una celda vacía significa "dato desconocido", no una orden de borrar
    // el correo que el estudiante ya tenga en el backend.
    const email = fields.find((field) => field.includes('@'))?.trim().toLowerCase();
    const parsed = rosterRowSchema.safeParse({
      code,
      fullName: name.replace(/\s+/g, ' ').trim(),
      ...(email ? { email } : {}),
    });

    if (!parsed.success) {
      errors.push({
        line: lineNumber,
        raw: line.trim(),
        reason: parsed.error.issues[0]?.message ?? 'Fila inválida.',
      });
      return;
    }

    seen.add(code);
    rows.push(parsed.data);
  });

  return { rows, errors, duplicates };
}
