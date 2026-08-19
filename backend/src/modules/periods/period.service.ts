/**
 * Periodos académicos: consulta de estado, cierre oficial y fotografía.
 *
 * Toda la orquestación y el acceso a datos viven aquí; `period.routes.ts` solo
 * valida, autoriza, delega y responde. La regla de qué se puede escribir en
 * cada estado es pura y está en `domains/periods/period-lifecycle.ts`.
 */
import { Types } from 'mongoose';
import { AcademicPeriodModel } from '../../models/academic-period.model.js';
import { AcademicSnapshotModel } from '../../models/academic-snapshot.model.js';
import { GradeModel } from '../../models/grade.model.js';
import { EnrollmentModel } from '../../models/enrollment.model.js';
import { computeAcademicRecords } from '../../shared/academic.service.js';
import { auditChange } from '../../shared/audit.js';
import { emitSync } from '../../shared/socket.js';
import { invalidarCachePeriodos } from '../../shared/period-guard.js';
import { resumirError } from '../../shared/sanitize.js';
import {
  compararPeriodos,
  porcentajeDeCierre,
  transicionValida,
  type EstadoPeriodo,
} from '../../domains/periods/period-lifecycle.js';
import * as campo from '../../shared/validation.js';

/**
 * Versión del esquema de la fotografía.
 *
 * Sube a mano cuando cambia la FORMA de un `AcademicSnapshot`. Si algún día un
 * consolidado histórico se ve raro, esta cifra es lo que dice con qué reglas
 * se congeló.
 */
export const VERSION_FOTOGRAFIA = 1;

/** Registros por lote del cierre. Acota la memoria y hace el avance visible. */
const LOTE_CIERRE = 200;

// ── Lectura ──────────────────────────────────────────────────────────────────

export type PeriodoResumen = {
  period: string;
  label: string;
  state: EstadoPeriodo;
  closedAt: Date | null;
  closedBy: string | null;
  closingStartedAt: Date | null;
  snapshotVersion: number;
  progreso: number;
  progresoDetalle: { total: number; done: number; lastError: string | null };
  snapshotSummary: Record<string, number>;
  reaperturas: number;
  /** `true` cuando el periodo aún no tiene documento propio (histórico). */
  implicito: boolean;
};

function aResumen(documento: Record<string, any>, implicito = false): PeriodoResumen {
  const progreso = (documento.progress ?? {}) as { total?: number; done?: number; lastError?: string };
  return {
    period: String(documento.period),
    label: String(documento.label ?? ''),
    state: (documento.state ?? 'OPEN') as EstadoPeriodo,
    closedAt: documento.closedAt ?? null,
    closedBy: documento.closedBy ? String(documento.closedBy) : null,
    closingStartedAt: documento.closingStartedAt ?? null,
    snapshotVersion: Number(documento.snapshotVersion ?? 0),
    progreso: porcentajeDeCierre(progreso),
    progresoDetalle: {
      total: Number(progreso.total ?? 0),
      done: Number(progreso.done ?? 0),
      lastError: progreso.lastError ?? null,
    },
    snapshotSummary: (documento.snapshotSummary ?? {}) as Record<string, number>,
    reaperturas: Array.isArray(documento.reopenings) ? documento.reopenings.length : 0,
    implicito,
  };
}

/**
 * Todos los periodos: los registrados y los que solo existen porque hay datos
 * con esa cadena.
 *
 * La unión importa. Los semestres anteriores a esta funcionalidad no tienen
 * documento propio, y un listado que solo mostrara la colección nueva
 * aparecería vacío el día del despliegue — con la administración concluyendo,
 * razonablemente, que la pantalla está rota.
 */
export async function listarPeriodos(): Promise<PeriodoResumen[]> {
  const [registrados, deNotas, deMatriculas] = await Promise.all([
    AcademicPeriodModel.find({ deletedAt: null }).lean(),
    GradeModel.distinct('period', { deletedAt: null }),
    EnrollmentModel.distinct('period', { deletedAt: null }),
  ]);

  const porPeriodo = new Map<string, PeriodoResumen>();
  for (const documento of registrados) {
    porPeriodo.set(String(documento.period), aResumen(documento as Record<string, any>));
  }

  for (const periodo of [...deNotas, ...deMatriculas].map(String).filter(Boolean)) {
    if (porPeriodo.has(periodo)) continue;
    porPeriodo.set(periodo, aResumen({ period: periodo, state: 'OPEN' }, true));
  }

  return [...porPeriodo.values()].sort((a, b) => compararPeriodos(b.period, a.period));
}

export async function obtenerPeriodo(periodo: string): Promise<PeriodoResumen> {
  const documento = await AcademicPeriodModel.findOne({ period: periodo }).lean();
  if (documento) return aResumen(documento as Record<string, any>);
  return aResumen({ period: periodo, state: 'OPEN' }, true);
}

/**
 * Crea el documento del periodo si no existía.
 *
 * `upsert` y no «leer y si no hay, crear»: dos administradores pulsando
 * «cerrar» a la vez crearían dos documentos y el índice único rechazaría uno
 * con un 409 que nadie sabría interpretar.
 */
async function asegurarPeriodo(periodo: string, actorId?: string | null) {
  return AcademicPeriodModel.findOneAndUpdate(
    { period: periodo },
    { $setOnInsert: { period: periodo, state: 'OPEN', createdBy: actorId ?? null } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

// ── Cierre ───────────────────────────────────────────────────────────────────

export type ResultadoCierre = {
  period: string;
  state: EstadoPeriodo;
  registros: number;
  reanudado: boolean;
  resumen: Record<string, number>;
};

/** Error de negocio con código HTTP; sin `statusCode` caería en un 500. */
class ErrorDePeriodo extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
  }
}

/**
 * Inicia (o retoma) el cierre de un periodo.
 *
 * Es **idempotente y reanudable**, y las dos cosas por el mismo motivo: la
 * fotografía son miles de escrituras y el proceso se puede caer a la mitad.
 * Volver a llamar a esta función sobre un periodo en `CLOSING` no empieza de
 * cero ni duplica nada — los upserts van contra la clave
 * (periodo, estudiante, materia) — sino que rehace el recorrido y termina.
 *
 * El orden es lo que garantiza que el acta no mienta:
 *   1. `CLOSING` → las escrituras académicas ya se rechazan.
 *   2. Se genera la fotografía con la pipeline canónica.
 *   3. Solo si terminó, `CLOSED`.
 *
 * Un fallo en el paso 2 deja el periodo en `CLOSING`: bloqueado, sí, pero
 * honesto. **Nunca queda marcado como cerrado con la fotografía a medias.**
 */
export async function cerrarPeriodo(
  periodo: string,
  actor: { id: string; role: string },
): Promise<ResultadoCierre> {
  const documento = await asegurarPeriodo(periodo, actor.id);
  const estadoActual = (documento.get('state') ?? 'OPEN') as EstadoPeriodo;

  if (estadoActual === 'CLOSED') {
    throw new ErrorDePeriodo(`El periodo ${periodo} ya está cerrado.`, 409);
  }
  if (estadoActual === 'OPEN' && !transicionValida('OPEN', 'CLOSING')) {
    throw new ErrorDePeriodo('Transición de estado no permitida.', 409);
  }

  const reanudado = estadoActual === 'CLOSING';

  if (!reanudado) {
    await AcademicPeriodModel.updateOne(
      { period: periodo },
      {
        $set: {
          state: 'CLOSING',
          closingStartedAt: new Date(),
          closingStartedBy: actor.id,
          'progress.lastError': null,
          'progress.done': 0,
          updatedBy: actor.id,
        },
      },
    );
    invalidarCachePeriodos(periodo);
    emitSync('sync:update', { entity: 'period', action: 'update', id: periodo });
  }

  try {
    const resumen = await generarFotografia(periodo, actor.id);

    await AcademicPeriodModel.updateOne(
      { period: periodo },
      {
        $set: {
          state: 'CLOSED',
          closedAt: new Date(),
          closedBy: actor.id,
          snapshotVersion: VERSION_FOTOGRAFIA,
          snapshotSummary: resumen,
          'progress.lastError': null,
          'progress.updatedAt': new Date(),
          updatedBy: actor.id,
        },
      },
    );
    invalidarCachePeriodos(periodo);

    await auditChange({
      actorId: actor.id,
      action: reanudado ? 'period.close.resume' : 'period.close',
      entity: 'AcademicPeriod',
      after: { period: periodo, state: 'CLOSED', ...resumen },
    });
    emitSync('sync:update', { entity: 'period', action: 'update', id: periodo });

    return {
      period: periodo,
      state: 'CLOSED',
      registros: resumen.registros ?? 0,
      reanudado,
      resumen,
    };
  } catch (causa) {
    // El periodo se queda en CLOSING con el error anotado: reintentable, y
    // sin ninguna fotografía a medias presentándose como definitiva.
    await AcademicPeriodModel.updateOne(
      { period: periodo },
      { $set: { 'progress.lastError': resumirError(causa), 'progress.updatedAt': new Date() } },
    );
    throw causa;
  }
}

/**
 * Congela el consolidado del periodo.
 *
 * Reutiliza `computeAcademicRecords()` — la única pipeline académica — y no
 * recalcula ni una fórmula. Lo que se guarda es exactamente lo que el panel y
 * los reportes mostraban un segundo antes del cierre; si aquí se calculara
 * algo por separado, el acta oficial y la pantalla podrían discrepar y no
 * habría forma de saber cuál de las dos tiene razón.
 */
async function generarFotografia(periodo: string, actorId: string): Promise<Record<string, number>> {
  const registros = await computeAcademicRecords({ period: periodo });

  await AcademicPeriodModel.updateOne(
    { period: periodo },
    { $set: { 'progress.total': registros.length, 'progress.done': 0, 'progress.updatedAt': new Date() } },
  );

  const capturedAt = new Date();
  const aId = (valor: string | null) =>
    valor && Types.ObjectId.isValid(valor) ? new Types.ObjectId(valor) : null;

  type OperacionLote = Parameters<typeof AcademicSnapshotModel.bulkWrite>[0][number];

  let hechos = 0;
  for (let i = 0; i < registros.length; i += LOTE_CIERRE) {
    // Un registro sin estudiante o sin materia identificables no puede formar
    // parte del acta: se omite en vez de escribirse a medias.
    const lote = registros
      .slice(i, i + LOTE_CIERRE)
      .filter(registro => aId(registro.studentId) && aId(registro.subjectId));

    // `bulkWrite` no castea los ids a partir del esquema: sin convertirlos a
    // mano el filtro no encuentra nada y el upsert crea un duplicado en vez de
    // actualizar. Es la misma trampa que en las importaciones masivas.
    await AcademicSnapshotModel.bulkWrite(
      lote.map<OperacionLote>(registro => ({
        updateOne: {
          filter: {
            period: periodo,
            studentId: aId(registro.studentId)!,
            subjectId: aId(registro.subjectId)!,
          },
          update: {
            $set: {
              period: periodo,
              studentId: aId(registro.studentId)!,
              subjectId: aId(registro.subjectId)!,
              groupId: aId(registro.groupId),
              teacherId: aId(registro.teacherId),
              code: registro.code,
              fullName: registro.fullName,
              notaFinal: registro.notaFinal,
              cortes: registro.cortes,
              aprobado: registro.aprobado,
              notaCompleta: registro.notaCompleta,
              tieneNotas: registro.tieneNotas,
              asistenciaPorcentaje: registro.riesgo.porcentajeAsistencia,
              clasesAusente: registro.riesgo.clasesAusente,
              riesgoNivel: registro.riesgo.nivel,
              riesgoPuntaje: registro.riesgo.puntaje,
              riesgoMotivos: registro.riesgo.motivos,
              snapshotVersion: VERSION_FOTOGRAFIA,
              capturedAt,
            },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );

    hechos += lote.length;
    await AcademicPeriodModel.updateOne(
      { period: periodo },
      { $set: { 'progress.done': hechos, 'progress.updatedAt': new Date() } },
    );
  }

  const estudiantes = new Set(registros.map(r => r.studentId));
  const materias = new Set(registros.map(r => r.subjectId));
  const conNotas = registros.filter(r => r.tieneNotas);
  const promedio = conNotas.length
    ? Math.round((conNotas.reduce((suma, r) => suma + r.notaFinal, 0) / conNotas.length) * 100) / 100
    : 0;

  void actorId;
  return {
    registros: registros.length,
    estudiantes: estudiantes.size,
    materias: materias.size,
    aprobados: registros.filter(r => r.aprobado).length,
    reprobados: registros.filter(r => r.tieneNotas && !r.aprobado).length,
    enRiesgoAlto: registros.filter(r => r.riesgo.nivel === 'ALTO').length,
    promedioGeneral: promedio,
  };
}

/**
 * Reabre un periodo cerrado.
 *
 * **La fotografía anterior no se borra.** Se anota la reapertura con su autor,
 * su fecha y su motivo, y la versión queda registrada en el historial. Un
 * cierre posterior sobrescribe los registros por su clave única, pero el
 * documento del periodo conserva la traza de que hubo un acta previa distinta
 * — que es lo único que permite responder «¿por qué el consolidado de
 * diciembre no coincide con el de marzo?».
 */
export async function reabrirPeriodo(
  periodo: string,
  actor: { id: string },
  motivo: string,
): Promise<PeriodoResumen> {
  const documento = await AcademicPeriodModel.findOne({ period: periodo });
  if (!documento) throw new ErrorDePeriodo(`El periodo ${periodo} no está registrado.`, 404);

  const estado = (documento.get('state') ?? 'OPEN') as EstadoPeriodo;
  if (estado === 'OPEN') throw new ErrorDePeriodo(`El periodo ${periodo} ya está abierto.`, 409);
  if (!transicionValida(estado, 'OPEN')) {
    throw new ErrorDePeriodo('Transición de estado no permitida.', 409);
  }

  await AcademicPeriodModel.updateOne(
    { period: periodo },
    {
      $set: { state: 'OPEN', updatedBy: actor.id },
      $push: {
        reopenings: {
          at: new Date(),
          by: actor.id,
          reason: motivo,
          snapshotVersion: documento.get('snapshotVersion') ?? 0,
        },
      },
    },
  );
  invalidarCachePeriodos(periodo);

  await auditChange({
    actorId: actor.id,
    action: 'period.reopen',
    entity: 'AcademicPeriod',
    before: { period: periodo, state: estado },
    after: { period: periodo, state: 'OPEN', motivo },
  });
  emitSync('sync:update', { entity: 'period', action: 'update', id: periodo });

  return obtenerPeriodo(periodo);
}

/**
 * Aborta un cierre atascado y devuelve el periodo a `OPEN`.
 *
 * Existe porque `CLOSING` bloquea las escrituras: un cierre que falló por una
 * caída de red dejaría el semestre en solo lectura hasta que alguien tocara la
 * base de datos a mano.
 */
export async function abortarCierre(periodo: string, actor: { id: string }): Promise<PeriodoResumen> {
  const documento = await AcademicPeriodModel.findOne({ period: periodo }).select('state').lean();
  const estado = (documento?.state ?? 'OPEN') as EstadoPeriodo;
  if (estado !== 'CLOSING') {
    throw new ErrorDePeriodo('Solo se puede abortar un cierre en curso.', 409);
  }

  await AcademicPeriodModel.updateOne(
    { period: periodo },
    { $set: { state: 'OPEN', 'progress.lastError': null, updatedBy: actor.id } },
  );
  invalidarCachePeriodos(periodo);

  await auditChange({
    actorId: actor.id,
    action: 'period.close.abort',
    entity: 'AcademicPeriod',
    after: { period: periodo, state: 'OPEN' },
  });
  emitSync('sync:update', { entity: 'period', action: 'update', id: periodo });
  return obtenerPeriodo(periodo);
}

// ── Fotografía ───────────────────────────────────────────────────────────────

export type FiltroFotografia = {
  period: string;
  subjectId?: string;
  studentId?: string;
  /** Docente al que se acota la consulta; lo impone el rol, nunca el cliente. */
  teacherId?: string;
};

/**
 * Consulta paginada de la fotografía.
 *
 * `teacherId` lo pone la ruta a partir de la sesión y va **después** de lo que
 * pide la URL, igual que en `filtroDeListado()`: aceptar un `teacherId` del
 * cuerpo convertiría el histórico en el listado de cualquier docente.
 */
export async function consultarFotografia(
  filtro: FiltroFotografia,
  pagina: campo.Paginacion,
): Promise<{ items: unknown[]; total: number }> {
  const query: Record<string, unknown> = { period: filtro.period };
  if (filtro.subjectId) query.subjectId = filtro.subjectId;
  if (filtro.studentId) query.studentId = filtro.studentId;
  if (filtro.teacherId) query.teacherId = filtro.teacherId;

  const { skip, limit } = campo.saltoYTope(pagina);
  const [items, total] = await Promise.all([
    AcademicSnapshotModel.find(query).sort({ fullName: 1 }).skip(skip).limit(limit).lean(),
    AcademicSnapshotModel.countDocuments(query),
  ]);
  return { items, total };
}

/** Resumen de la fotografía guardada, para la pantalla de administración. */
export async function resumenFotografia(periodo: string, teacherId?: string) {
  const query: Record<string, unknown> = { period: periodo };
  if (teacherId) query.teacherId = teacherId;

  const [total, aprobados, riesgoAlto] = await Promise.all([
    AcademicSnapshotModel.countDocuments(query),
    AcademicSnapshotModel.countDocuments({ ...query, aprobado: true }),
    AcademicSnapshotModel.countDocuments({ ...query, riesgoNivel: 'ALTO' }),
  ]);
  return { period: periodo, registros: total, aprobados, enRiesgoAlto: riesgoAlto };
}
