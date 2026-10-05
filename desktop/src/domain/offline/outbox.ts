/**
 * Cola de envíos pendientes («buzón de salida»).
 *
 * Con el servidor inalcanzable el docente sigue calificando y pasando lista: lo
 * que escribe se guarda aquí y se sube solo cuando hay conexión. Este módulo es
 * la parte pura —sin React, sin red, sin almacenamiento—: cómo se funden dos
 * escrituras sobre lo mismo, cómo se clasifica un fallo y qué se superpone a lo
 * que ya está en pantalla. Que sea puro es lo que permite fijarlo con pruebas:
 * un error aquí no lanza ninguna excepción, **pierde o duplica una nota** y se
 * descubre semanas después en un acta.
 *
 * Nada de esto calcula notas ni asistencia: la cola solo transporta lo que el
 * docente tecleó. Promedios, estados y riesgo siguen saliendo del servidor.
 */
import type { GradeInput } from '@/domain/schemas/grades';

export type OutboxKind = 'grade.upsert' | 'grade.delete' | 'attendance.class';
export type OutboxEstado = 'pendiente' | 'enviando' | 'fallida';

export type RegistroAsistencia = {
  studentId: string;
  present: boolean;
  lateMinutes: number;
  notes: string;
};

/** La clase a la que pertenece una lista. `dia` es AAAA-MM-DD; `date` lo que viaja. */
export type ClaseAsistencia = {
  subjectId: string;
  groupId?: string;
  teacherId: string;
  period: string;
  dia: string;
  date: string;
};

export type OutboxDatos =
  | { kind: 'grade.upsert'; input: GradeInput }
  | { kind: 'grade.delete'; gradeId: string; etiqueta: string }
  | { kind: 'attendance.class'; clase: ClaseAsistencia; registros: RegistroAsistencia[] };

export type OutboxEntry = {
  id: string;
  userId: string;
  createdAt: number;
  kind: OutboxKind;
  /** Identidad natural de lo escrito: dos entradas con la misma clave son la misma cosa. */
  clave: string;
  method: 'POST' | 'DELETE';
  path: string;
  body: Record<string, unknown> | null;
  estado: OutboxEstado;
  intentos: number;
  ultimoError: string | null;
  /** No reintentar antes de este instante (backoff, Retry-After). */
  proximoIntento: number | null;
  /** Lo que se escribió, tipado: de aquí salen el cuerpo, el resumen y la superposición. */
  datos: OutboxDatos;
  /** Texto para la lista de pendientes. */
  resumen: string;
};

/** Prefijo del id que reciben en pantalla las notas que aún no existen en el servidor. */
export const PREFIJO_NOTA_PENDIENTE = 'pendiente:';

// ── Claves ──────────────────────────────────────────────────────────────────

/** Las mismas seis columnas que el índice único de Nota en el servidor. */
export function claveDeNota(input: GradeInput): string {
  return [
    'grade',
    input.studentId,
    input.subjectId,
    input.period,
    input.corte,
    input.componentType,
    input.label.trim(),
  ].join('|');
}

export function claveDeClase(clase: Pick<ClaseAsistencia, 'subjectId' | 'groupId' | 'period' | 'dia'>): string {
  return ['att', clase.subjectId, clase.groupId ?? '', clase.period, clase.dia].join('|');
}

export function claveDeBorrado(gradeId: string): string {
  return `grade.delete|${gradeId}`;
}

// ── Construcción ────────────────────────────────────────────────────────────

type Contexto = { userId: string; id: string; ahora: number };

const iso = (instante: number) => new Date(instante).toISOString();

const BASE = { estado: 'pendiente', intentos: 0, ultimoError: null, proximoIntento: null } as const;

export function crearEntradaDeNota(input: GradeInput, ctx: Contexto): OutboxEntry {
  return {
    ...BASE,
    id: ctx.id,
    userId: ctx.userId,
    createdAt: ctx.ahora,
    kind: 'grade.upsert',
    clave: claveDeNota(input),
    method: 'POST',
    path: '/grades',
    body: { ...input, capturadoEn: iso(ctx.ahora) },
    datos: { kind: 'grade.upsert', input },
    resumen: `Nota «${input.label.trim()}»: ${input.score}`,
  };
}

export function crearEntradaDeBorrado(
  gradeId: string,
  etiqueta: string,
  ctx: Contexto,
): OutboxEntry {
  return {
    ...BASE,
    id: ctx.id,
    userId: ctx.userId,
    createdAt: ctx.ahora,
    kind: 'grade.delete',
    clave: claveDeBorrado(gradeId),
    method: 'DELETE',
    path: `/grades/${gradeId}`,
    body: null,
    datos: { kind: 'grade.delete', gradeId, etiqueta },
    resumen: `Eliminar nota «${etiqueta}»`,
  };
}

function cuerpoDeClase(
  clase: ClaseAsistencia,
  registros: RegistroAsistencia[],
  capturadoEn: number,
): Record<string, unknown> {
  return {
    subjectId: clase.subjectId,
    ...(clase.groupId ? { groupId: clase.groupId } : {}),
    teacherId: clase.teacherId,
    period: clase.period,
    date: clase.date,
    registros,
    capturadoEn: iso(capturadoEn),
  };
}

function resumenDeClase(clase: ClaseAsistencia, registros: RegistroAsistencia[]): string {
  const presentes = registros.filter((r) => r.present).length;
  return `Asistencia del ${clase.dia}: ${presentes} presentes, ${registros.length - presentes} ausentes`;
}

export function crearEntradaDeClase(
  clase: ClaseAsistencia,
  registros: RegistroAsistencia[],
  ctx: Contexto,
): OutboxEntry {
  return {
    ...BASE,
    id: ctx.id,
    userId: ctx.userId,
    createdAt: ctx.ahora,
    kind: 'attendance.class',
    clave: claveDeClase(clase),
    method: 'POST',
    path: '/attendance/bulk',
    body: cuerpoDeClase(clase, registros, ctx.ahora),
    datos: { kind: 'attendance.class', clase, registros },
    resumen: resumenDeClase(clase, registros),
  };
}

// ── Fusión ──────────────────────────────────────────────────────────────────

/**
 * Registros de asistencia: los de `nuevos` pisan a los de `base` por estudiante
 * y los demás se conservan. El orden de aparición se mantiene.
 */
export function fundirRegistros(
  base: RegistroAsistencia[],
  nuevos: RegistroAsistencia[],
): RegistroAsistencia[] {
  const porEstudiante = new Map(base.map((r) => [r.studentId, r]));
  for (const registro of nuevos) porEstudiante.set(registro.studentId, registro);
  return [...porEstudiante.values()];
}

/** Una entrada se puede reescribir mientras no esté viajando. */
const esReescribible = (entrada: OutboxEntry) => entrada.estado !== 'enviando';

/**
 * Añade una entrada a la cola fundiéndola con lo que ya espera.
 *
 *  - Misma nota (clave natural) → reemplaza a la anterior, que ya no importa:
 *    el servidor guarda una sola. Mantiene el sitio y el id, de modo que el
 *    orden de envío no cambia por corregir un número.
 *  - Misma clase de asistencia → los marcados se funden en UNA lista. Pasar
 *    lista a treinta alumnos son treinta clics y un solo envío, y el límite de
 *    120 escrituras por 15 minutos no se agota en una clase.
 *  - Borrar lo mismo dos veces → una vez.
 *  - Borrar una nota que solo existe en la cola → la quita, no viaja nada.
 *
 * Una entrada que ya está `enviando` no se toca: se añade otra detrás. Las
 * escrituras son idempotentes, así que la segunda corrige a la primera.
 *
 * Devuelve la entrada efectiva (la nueva, o la que absorbió a la nueva) para
 * que quien espera el resultado sepa cuál mirar; `null` si la nueva canceló a
 * una pendiente y no queda nada por enviar.
 */
export function encolar(
  entradas: OutboxEntry[],
  nueva: OutboxEntry,
): { entradas: OutboxEntry[]; entrada: OutboxEntry | null } {
  const indice = entradas.findIndex((e) => e.clave === nueva.clave && esReescribible(e));

  if (indice < 0) return { entradas: [...entradas, nueva], entrada: nueva };

  const previa = entradas[indice]!;
  let fundida: OutboxEntry;

  if (nueva.datos.kind === 'attendance.class' && previa.datos.kind === 'attendance.class') {
    const registros = fundirRegistros(previa.datos.registros, nueva.datos.registros);
    const clase = nueva.datos.clase;
    fundida = {
      ...previa,
      createdAt: nueva.createdAt,
      datos: { kind: 'attendance.class', clase, registros },
      body: cuerpoDeClase(clase, registros, nueva.createdAt),
      resumen: resumenDeClase(clase, registros),
    };
  } else if (nueva.kind === 'grade.delete') {
    // Mismo borrado ya en cola: no se repite.
    return { entradas, entrada: previa };
  } else {
    fundida = { ...nueva, id: previa.id };
  }

  const reiniciada: OutboxEntry = {
    ...fundida,
    estado: 'pendiente',
    intentos: 0,
    ultimoError: null,
    proximoIntento: null,
  };
  return {
    entradas: entradas.map((e, i) => (i === indice ? reiniciada : e)),
    entrada: reiniciada,
  };
}

/** Id con el que se enseña, en la lista de notas, una nota que solo está en la cola. */
export const idDeNotaPendiente = (entrada: OutboxEntry) => `${PREFIJO_NOTA_PENDIENTE}${entrada.id}`;

export const esNotaPendiente = (id: string) => id.startsWith(PREFIJO_NOTA_PENDIENTE);

/**
 * Descarta una nota que solo existe en la cola (borrar «Taller 2» antes de
 * haberlo enviado). No hay nada que borrar en el servidor: simplemente no se
 * envía. Falla si ya va de camino — entonces hay que esperar y borrarla de verdad.
 */
export function descartarNotaPendiente(
  entradas: OutboxEntry[],
  id: string,
): { entradas: OutboxEntry[]; quitada: boolean } {
  const entradaId = esNotaPendiente(id) ? id.slice(PREFIJO_NOTA_PENDIENTE.length) : id;
  const objetivo = entradas.find((e) => e.id === entradaId && e.kind === 'grade.upsert');
  if (!objetivo || !esReescribible(objetivo)) return { entradas, quitada: false };
  return { entradas: entradas.filter((e) => e.id !== objetivo.id), quitada: true };
}

// ── Transiciones ────────────────────────────────────────────────────────────

const conId = (entradas: OutboxEntry[], id: string, cambio: (e: OutboxEntry) => OutboxEntry) =>
  entradas.map((e) => (e.id === id ? cambio(e) : e));

export const quitarEntrada = (entradas: OutboxEntry[], id: string) =>
  entradas.filter((e) => e.id !== id);

export const marcarEnviando = (entradas: OutboxEntry[], id: string) =>
  conId(entradas, id, (e) => ({ ...e, estado: 'enviando' }));

/** Vuelve a la cola tras un fallo transitorio. `proximoIntento` ya incluye el backoff. */
export const marcarReintento = (
  entradas: OutboxEntry[],
  id: string,
  mensaje: string,
  proximoIntento: number,
) =>
  conId(entradas, id, (e) => ({
    ...e,
    estado: 'pendiente',
    intentos: e.intentos + 1,
    ultimoError: mensaje,
    proximoIntento,
  }));

/** Devuelve la entrada a la cola sin contar intento (la sesión pausó el envío). */
export const marcarPendiente = (entradas: OutboxEntry[], id: string, mensaje: string | null) =>
  conId(entradas, id, (e) => ({ ...e, estado: 'pendiente', ultimoError: mensaje }));

export const marcarFallida = (entradas: OutboxEntry[], id: string, mensaje: string) =>
  conId(entradas, id, (e) => ({
    ...e,
    estado: 'fallida',
    intentos: e.intentos + 1,
    ultimoError: mensaje,
    proximoIntento: null,
  }));

/** «Reintentar» desde la lista: vuelve a pendiente y sin espera. */
export const reiniciarEntrada = (entradas: OutboxEntry[], id: string) =>
  conId(entradas, id, (e) => ({
    ...e,
    estado: 'pendiente',
    intentos: 0,
    ultimoError: null,
    proximoIntento: null,
  }));

/**
 * Al abrir la aplicación nada puede estar «enviando»: si lo estaba, se cerró a
 * medias. Se devuelve a pendiente; reenviarlo es seguro porque el servidor
 * escribe por clave natural.
 */
export function recuperarTrasReinicio(entradas: OutboxEntry[]): OutboxEntry[] {
  return entradas.map((e) => (e.estado === 'enviando' ? { ...e, estado: 'pendiente' } : e));
}

/** La primera entrada que toca enviar ahora: pendiente, sin espera vigente, fuera de `excluir`. */
export function siguienteEnviable(
  entradas: OutboxEntry[],
  ahora: number,
  excluir: ReadonlySet<string> = new Set(),
): OutboxEntry | undefined {
  return entradas.find(
    (e) =>
      e.estado === 'pendiente' &&
      !excluir.has(e.id) &&
      (e.proximoIntento === null || e.proximoIntento <= ahora),
  );
}

/** El instante más cercano en que alguna entrada en espera vuelve a ser enviable. */
export function proximaEspera(entradas: OutboxEntry[]): number | null {
  const esperas = entradas
    .filter((e) => e.estado === 'pendiente' && e.proximoIntento !== null)
    .map((e) => e.proximoIntento as number);
  return esperas.length > 0 ? Math.min(...esperas) : null;
}

// ── Resumen para la interfaz ────────────────────────────────────────────────

export type ResumenCola = { pendientes: number; enviando: number; fallidas: number; total: number };

export function resumirCola(entradas: OutboxEntry[]): ResumenCola {
  let pendientes = 0;
  let enviando = 0;
  let fallidas = 0;
  for (const e of entradas) {
    if (e.estado === 'pendiente') pendientes += 1;
    else if (e.estado === 'enviando') enviando += 1;
    else fallidas += 1;
  }
  return { pendientes, enviando, fallidas, total: entradas.length };
}

/** El texto de la insignia de la barra superior. Vacío = no hay nada que decir. */
export function textoDeCola(resumen: ResumenCola): string {
  if (resumen.total === 0) return '';
  if (resumen.enviando > 0) return 'Enviando…';
  if (resumen.pendientes > 0) return `${resumen.pendientes} sin enviar`;
  return `${resumen.fallidas} con error`;
}

// ── Superposición sobre lo que ya está en pantalla ──────────────────────────

export type MarcaPendiente = { present: boolean; fallida: boolean };

/**
 * Lo que la cola dice de una clase concreta, por estudiante. Las entradas se
 * recorren en orden: si hubo dos, manda la más reciente.
 */
export function asistenciaPendiente(
  entradas: OutboxEntry[],
  filtro: { subjectId: string; dia: string },
): Map<string, MarcaPendiente> {
  const marcas = new Map<string, MarcaPendiente>();
  for (const entrada of entradas) {
    const datos = entrada.datos;
    if (datos.kind !== 'attendance.class') continue;
    if (datos.clase.subjectId !== filtro.subjectId || datos.clase.dia !== filtro.dia) continue;
    for (const registro of datos.registros) {
      marcas.set(registro.studentId, {
        present: registro.present,
        fallida: entrada.estado === 'fallida',
      });
    }
  }
  return marcas;
}

export type NotaPendiente = {
  entradaId: string;
  id: string;
  label: string;
  score: number;
  weight: number | undefined;
  fallida: boolean;
};

/** Las notas de un componente de un corte que esperan envío. No se promedian: no es cosa del cliente. */
export function notasPendientes(
  entradas: OutboxEntry[],
  filtro: {
    studentId: string;
    subjectId: string;
    period: string;
    corte: number;
    componentType: string;
  },
): NotaPendiente[] {
  const notas: NotaPendiente[] = [];
  for (const entrada of entradas) {
    const datos = entrada.datos;
    if (datos.kind !== 'grade.upsert') continue;
    const { input } = datos;
    if (
      input.studentId !== filtro.studentId ||
      input.subjectId !== filtro.subjectId ||
      input.period !== filtro.period ||
      input.corte !== filtro.corte ||
      input.componentType !== filtro.componentType
    ) {
      continue;
    }
    notas.push({
      entradaId: entrada.id,
      id: idDeNotaPendiente(entrada),
      label: input.label.trim(),
      score: input.score,
      weight: input.weight,
      fallida: entrada.estado === 'fallida',
    });
  }
  return notas;
}

/**
 * Lo que se le dice a quien va a cerrar sesión con cambios sin enviar.
 * Con la cola en disco se conservan; en la versión web viven en memoria y
 * cerrar la sesión (o la pestaña) los pierde, y decir lo contrario sería mentir.
 */
export function textoAlCerrarSesion(resumen: ResumenCola, persiste: boolean): string {
  const cuantos =
    resumen.total === 1 ? 'Tienes 1 cambio sin enviar' : `Tienes ${resumen.total} cambios sin enviar`;
  return persiste
    ? `${cuantos} al servidor. Se quedan guardados en este equipo y se envían cuando vuelvas a entrar con esta misma cuenta y haya conexión.`
    : `${cuantos} al servidor. Si cierras la sesión ahora se perderán: la versión web no los guarda en el equipo.`;
}

/** Ids de notas del servidor cuyo borrado espera envío. */
export function notasPorEliminar(entradas: OutboxEntry[]): Set<string> {
  const ids = new Set<string>();
  for (const entrada of entradas) {
    if (entrada.datos.kind === 'grade.delete') ids.add(entrada.datos.gradeId);
  }
  return ids;
}
