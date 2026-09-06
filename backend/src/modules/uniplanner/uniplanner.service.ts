/**
 * Orquestación del puente con UniPlanner: quién está enlazado y a quién se le
 * escribe.
 *
 * Dos reglas gobiernan este archivo:
 *
 * 1. **El cliente dice a quién, el servidor decide qué.** Ninguna ruta acepta
 *    la nota, las faltas ni el horario en el cuerpo de la petición: se leen de
 *    la base con la misma pipeline académica que el resto del sistema. Si el
 *    cliente pudiera mandar el número, un docente —o alguien con su sesión—
 *    escribiría en la app de un estudiante una nota que nunca se puso.
 * 2. **El alcance se aplica siempre.** Un docente solo avisa a los estudiantes
 *    de sus matrículas. Es la misma garantía que el resto del backend y se
 *    comprueba aquí, no en la ruta.
 */
import { Types } from 'mongoose';
import { EnrollmentModel } from '../../models/enrollment.model.js';
import { StudentModel } from '../../models/student.model.js';
import { SubjectModel } from '../../models/subject.model.js';
import { InstitutionModel } from '../../models/institution.model.js';
import { ScheduleModel } from '../../models/schedule.model.js';
import { GroupModel } from '../../models/group.model.js';
import { UserModel } from '../../models/user.model.js';
import { computeAcademicRecords, type AcademicRecord } from '../../shared/academic.service.js';
import { env } from '../../shared/env.js';
import { auditChange } from '../../shared/audit.js';
import * as puente from '../../shared/uniplanner.js';
import { idDeEnlace } from '../../domains/uniplanner/link-id.js';
import {
  avisoDeCargaAcademica,
  avisoDeEntrega,
  avisoDeInasistencia,
  avisoDeNota,
  nivelDeInasistencia,
  type Aviso,
  type MateriaCarga,
  type NivelInasistencia,
} from '../../domains/uniplanner/message.js';

/** Tope de destinatarios de un envío en lote. Una lista de clase no pasa de
 * aquí, y el tope impide que un `for` mal cerrado escriba en mil buzones. */
export const TOPE_LOTE = 80;

export type EstadoCanal = {
  configurado: boolean;
  soloVerificados: boolean;
};

/**
 * Si el canal está encendido.
 *
 * **No devuelve ninguna institución**, y eso es deliberado: cada materia
 * pertenece a la de quien la dicta, así que un despliegue con varias
 * universidades no tiene una sola respuesta. La clave sale del perfil
 * institucional en cada envío.
 */
export function estadoDelCanal(): EstadoCanal {
  return {
    configurado: puente.configurado(),
    soloVerificados: env.UNIPLANNER_SOLO_VERIFICADOS,
  };
}

/**
 * La clave con la que UniPlanner conoce a la institución de una materia.
 *
 * El camino es materia → docente que la dicta → su perfil institucional. Sale
 * de `Institucion.institutionId`, que es el identificador estable que ese
 * modelo declara como «el que usará UniPlanner»: tenerlo también en una
 * variable de entorno serían dos verdades, y la del entorno se quedaría vieja
 * en cuanto hubiera una segunda universidad.
 *
 * `null` si no se puede resolver. Entonces **no se manda nada**: sin la clave
 * correcta el enlace no se encuentra, y lo que parecería un envío hecho sería
 * un aviso que no existe en ningún sitio.
 */
export async function claveInstitucional(subjectId: string): Promise<string | null> {
  const materia = await SubjectModel.findById(subjectId).select('professorId').lean();
  if (!materia?.professorId) return null;

  const docente = await UserModel.findById(materia.professorId).select('institutionId').lean();
  const institucionId = (docente as { institutionId?: unknown } | null)?.institutionId;
  if (!institucionId) return null;

  const institucion = await InstitutionModel.findById(institucionId)
    .select('institutionId')
    .lean();
  const clave = (institucion as { institutionId?: unknown } | null)?.institutionId;
  return typeof clave === 'string' && clave ? clave : null;
}

export type EstadoEnlace = {
  studentId: string;
  code: string;
  enlazado: boolean;
  verificado: boolean;
  /**
   * Semáforo de inasistencias.
   *
   * Lo calcula el servidor y no el cliente a propósito: es la misma cifra que
   * decide a quién alcanza el envío masivo, y con dos cuentas —una para pintar
   * y otra para enviar— la lista enseñaría a alguien en verde al que el botón
   * de "avisar a los que están en riesgo" sí le escribe.
   */
  nivel: NivelInasistencia;
};

type EstudianteBasico = { id: string; code: string; fullName: string };

/** Los estudiantes de una materia, acotados al docente si lo hay. */
async function estudiantesDe(filtro: {
  subjectId: string;
  period?: string;
  teacherId?: string;
  studentIds?: string[];
}): Promise<EstudianteBasico[]> {
  const consulta: Record<string, unknown> = {
    subjectId: new Types.ObjectId(filtro.subjectId),
    enrollmentStatus: 'ACTIVE',
    deletedAt: null,
  };
  if (filtro.period) consulta.period = filtro.period;
  if (filtro.teacherId) consulta.professorId = new Types.ObjectId(filtro.teacherId);
  if (filtro.studentIds) {
    consulta.studentId = { $in: filtro.studentIds.map((id) => new Types.ObjectId(id)) };
  }

  const matriculas = await EnrollmentModel.find(consulta).select('studentId').lean();
  const ids = matriculas.map((m) => m.studentId);
  if (ids.length === 0) return [];

  const estudiantes = await StudentModel.find({ _id: { $in: ids }, deletedAt: null })
    .select('code fullName')
    .lean();

  return estudiantes.map((e) => ({
    id: String(e._id),
    code: String(e.code ?? ''),
    fullName: String(e.fullName ?? ''),
  }));
}

/**
 * Qué estudiantes de una materia tienen UniPlanner.
 *
 * Una sola lectura para toda la lista: preguntar uno a uno por cuarenta
 * estudiantes serían cuarenta viajes a otro proyecto cada vez que se pinta la
 * lista de clase.
 */
export async function estadoDeEnlaces(filtro: {
  subjectId: string;
  period?: string;
  teacherId?: string;
}): Promise<EstadoEnlace[]> {
  const estudiantes = await estudiantesDe(filtro);
  if (estudiantes.length === 0) return [];

  const institucion = await claveInstitucional(filtro.subjectId);

  const porId = new Map<string, EstudianteBasico>();
  if (institucion) {
    for (const estudiante of estudiantes) {
      const id = idDeEnlace(institucion, estudiante.code);
      if (id) porId.set(id, estudiante);
    }
  }

  const [enlaces, registros] = await Promise.all([
    puente.buscarEnlaces([...porId.keys()]),
    computeAcademicRecords({
      subjectId: filtro.subjectId,
      period: filtro.period,
      teacherId: filtro.teacherId,
    }),
  ]);

  const nivelPorEstudiante = new Map<string, NivelInasistencia>(
    registros.map((registro) => [
      registro.studentId,
      nivelDeInasistencia(registro.riesgo.porcentajeAsistencia),
    ]),
  );

  return estudiantes.map((estudiante) => {
    const id = institucion ? idDeEnlace(institucion, estudiante.code) : null;
    const enlace = id ? enlaces.get(id) : undefined;
    return {
      studentId: estudiante.id,
      code: estudiante.code,
      enlazado: Boolean(enlace),
      verificado: Boolean(enlace?.verified),
      // Sin asistencia registrada todavía no hay nada gastado: verde.
      nivel: nivelPorEstudiante.get(estudiante.id) ?? 'VERDE',
    };
  });
}

export type ResultadoDestinatario = {
  studentId: string;
  code: string;
  fullName: string;
  enviado: boolean;
  motivo?:
    | 'sin-enlace'
    | 'sin-verificar'
    | 'sin-configurar'
    | 'sin-token'
    | 'rechazado'
    | 'red'
    | 'sin-datos'
    | 'sin-institucion';
};

/**
 * Escribe el mismo tipo de aviso a una lista de estudiantes.
 *
 * Devuelve una fila por destinatario, incluidos los que no recibieron nada y
 * por qué. Descartar en silencio a quien no tiene la app convertiría «avisé a
 * treinta» en una frase que nadie puede comprobar.
 */
async function repartir(
  institucion: string | null,
  destinatarios: { estudiante: EstudianteBasico; aviso: Aviso | null }[],
): Promise<ResultadoDestinatario[]> {
  // Sin la clave de la institución no se busca ni se escribe nada: el nombre
  // del documento de enlace se deriva de ella, así que con la clave equivocada
  // —o sin ella— el enlace no se encuentra y el envío parecería hecho sin
  // haber llegado a ningún sitio.
  if (!institucion) {
    return destinatarios.map(({ estudiante }) => ({
      studentId: estudiante.id,
      code: estudiante.code,
      fullName: estudiante.fullName,
      enviado: false,
      motivo: 'sin-institucion' as const,
    }));
  }

  const porId = new Map<string, EstudianteBasico>();
  for (const { estudiante } of destinatarios) {
    const id = idDeEnlace(institucion, estudiante.code);
    if (id) porId.set(id, estudiante);
  }

  const enlaces = await puente.buscarEnlaces([...porId.keys()]);
  const resultados: ResultadoDestinatario[] = [];

  for (const { estudiante, aviso } of destinatarios) {
    const base = { studentId: estudiante.id, code: estudiante.code, fullName: estudiante.fullName };

    if (!aviso) {
      resultados.push({ ...base, enviado: false, motivo: 'sin-datos' });
      continue;
    }

    const idEnlace = idDeEnlace(institucion, estudiante.code);
    const enlace = idEnlace ? enlaces.get(idEnlace) : undefined;

    if (!enlace) {
      resultados.push({ ...base, enviado: false, motivo: 'sin-enlace' });
      continue;
    }
    if (env.UNIPLANNER_SOLO_VERIFICADOS && !enlace.verified) {
      resultados.push({ ...base, enviado: false, motivo: 'sin-verificar' });
      continue;
    }

    const envio = await puente.escribirAviso(enlace.uid, institucion, aviso);
    resultados.push(
      envio.ok ? { ...base, enviado: true } : { ...base, enviado: false, motivo: envio.motivo },
    );
  }

  return resultados;
}

async function nombreDelDocente(teacherId: string | null | undefined): Promise<string | undefined> {
  if (!teacherId) return undefined;
  const usuario = await UserModel.findById(teacherId).select('fullName name').lean();
  const nombre = (usuario as { fullName?: string; name?: string } | null);
  return nombre?.fullName || nombre?.name || undefined;
}

// ── Inasistencias ────────────────────────────────────────────────────────────

export type FiltroInasistencia = {
  subjectId: string;
  period?: string;
  teacherId?: string;
  /** Solo a estos estudiantes. Sin esto, a todos los que pasen del umbral. */
  studentIds?: string[];
  /** Desde qué color se avisa. Por defecto, del amarillo hacia arriba. */
  desde?: NivelInasistencia;
  corte?: string;
  mensaje?: string;
};

/**
 * Avisa de inasistencias acumuladas.
 *
 * Las faltas **no llegan en la petición**: salen de `computeAcademicRecords`,
 * la misma pipeline que alimenta el panel y el escáner de riesgo. El docente
 * decide a quién y con qué texto; cuántas faltas tiene cada uno lo dice la
 * base.
 */
export async function avisarInasistencias(
  filtro: FiltroInasistencia,
  actor: { id: string; ip?: string | null; userAgent?: string | null },
): Promise<{ resultados: ResultadoDestinatario[] }> {
  const materia = await SubjectModel.findById(filtro.subjectId).select('name code').lean();
  const registros = await computeAcademicRecords({
    subjectId: filtro.subjectId,
    period: filtro.period,
    teacherId: filtro.teacherId,
    studentIds: filtro.studentIds,
  });

  const docente = await nombreDelDocente(filtro.teacherId ?? null);
  const umbral = filtro.desde ?? 'AMARILLO';

  const elegidos = registros.filter((registro) => {
    // Con estudiantes nombrados manda el docente: si pulsó el botón de esa
    // fila, se envía aunque el semáforo esté en verde. El envío masivo sí
    // filtra, que es lo que lo hace masivo y no indiscriminado.
    if (filtro.studentIds?.length) return true;
    const nivel = nivelDeInasistencia(registro.riesgo.porcentajeAsistencia);
    return umbral === 'ROJO' ? nivel === 'ROJO' : nivel !== 'VERDE';
  });

  const destinatarios = elegidos.slice(0, TOPE_LOTE).map((registro: AcademicRecord) => ({
    estudiante: { id: registro.studentId, code: registro.code, fullName: registro.fullName },
    aviso: avisoDeInasistencia({
      materiaCodigo: materia?.code ?? undefined,
      materiaNombre: materia?.name ?? 'tu materia',
      docente,
      corte: filtro.corte,
      clasesAusente: registro.riesgo.clasesAusente,
      totalClases: registro.riesgo.clasesTotales,
      porcentajeAsistencia: registro.riesgo.porcentajeAsistencia,
      mensaje: filtro.mensaje,
    }),
  }));

  const resultados = await repartir(await claveInstitucional(filtro.subjectId), destinatarios);
  await registrarEnvio('inasistencia', filtro.subjectId, resultados, actor);
  return { resultados };
}

// ── Notas publicadas ─────────────────────────────────────────────────────────

/**
 * Avisa de la nota de un corte.
 *
 * La nota se lee de la pipeline académica, nunca del cuerpo de la petición: es
 * el dato que va a acabar en el simulador de promedio de otra persona.
 */
export async function avisarNotas(
  filtro: {
    subjectId: string;
    corte: number;
    period?: string;
    teacherId?: string;
    studentIds?: string[];
    mensaje?: string;
  },
  actor: { id: string; ip?: string | null; userAgent?: string | null },
): Promise<{ resultados: ResultadoDestinatario[] }> {
  const materia = await SubjectModel.findById(filtro.subjectId).select('name code').lean();
  const registros = await computeAcademicRecords({
    subjectId: filtro.subjectId,
    period: filtro.period,
    teacherId: filtro.teacherId,
    studentIds: filtro.studentIds,
  });
  const docente = await nombreDelDocente(filtro.teacherId ?? null);

  const destinatarios = registros.slice(0, TOPE_LOTE).map((registro) => {
    const nota = registro.cortes[filtro.corte - 1];
    return {
      estudiante: { id: registro.studentId, code: registro.code, fullName: registro.fullName },
      // Sin nota en ese corte no hay nada que publicar. Mandar un cero sería
      // publicar una calificación que nadie puso.
      aviso:
        Number.isFinite(nota) && nota > 0
          ? avisoDeNota({
              materiaCodigo: materia?.code ?? undefined,
              materiaNombre: materia?.name ?? 'tu materia',
              docente,
              corte: filtro.corte,
              nota,
              // Cinco fijo, y **no** el `notaMaxima` del perfil institucional,
              // aunque ese campo exista. La nota que se manda la calcula
              // `domains/grading`, que hoy aplica la RUBRICA de la casa a todo
              // el mundo: sale en 0–5 aunque la institución tenga configurado
              // 0–100. Leer aquí su escala mandaría «4.3 sobre 100», y
              // UniPlanner convertiría de buena fe un 4.3 en un 0.215.
              //
              // El día que `domains/grading` se parametrice por institución,
              // esta línea tiene que moverse con él: son el mismo número visto
              // desde dos sitios, y quedarse quieta aquí es lo que rompería el
              // promedio del estudiante.
              escala: 5,
              mensaje: filtro.mensaje,
            })
          : null,
    };
  });

  const resultados = await repartir(await claveInstitucional(filtro.subjectId), destinatarios);
  await registrarEnvio('nota', filtro.subjectId, resultados, actor);
  return { resultados };
}

// ── Carga académica ──────────────────────────────────────────────────────────

/**
 * Manda el horario del semestre a un estudiante.
 *
 * Es de coordinación y no del docente a propósito: el horario es institucional
 * y un docente solo ve su propia materia, así que un envío suyo describiría un
 * semestre de una asignatura. UniPlanner lo mete por su asistente de
 * importación, que empareja con lo que la persona ya tenga, así que un envío
 * parcial no rompería nada — pero tampoco serviría de mucho.
 */
export async function avisarCargaAcademica(
  filtro: { studentId: string; period: string; subjectIds?: string[]; mensaje?: string },
  actor: { id: string; ip?: string | null; userAgent?: string | null },
): Promise<{ resultados: ResultadoDestinatario[] }> {
  const estudiante = await StudentModel.findById(filtro.studentId).select('code fullName').lean();
  if (!estudiante) return { resultados: [] };

  const consulta: Record<string, unknown> = {
    studentId: new Types.ObjectId(filtro.studentId),
    period: filtro.period,
    enrollmentStatus: 'ACTIVE',
    deletedAt: null,
  };
  if (filtro.subjectIds?.length) {
    consulta.subjectId = { $in: filtro.subjectIds.map((id) => new Types.ObjectId(id)) };
  }

  const matriculas = await EnrollmentModel.find(consulta).select('subjectId groupId').lean();
  const subjectIds = matriculas.map((m) => m.subjectId);

  const [materias, horarios, grupos] = await Promise.all([
    SubjectModel.find({ _id: { $in: subjectIds }, deletedAt: null })
      .select('name code professorId')
      .lean(),
    ScheduleModel.find({ subjectId: { $in: subjectIds }, deletedAt: null })
      .select('subjectId dayOfWeek startTime endTime classroom')
      .lean(),
    GroupModel.find({ _id: { $in: matriculas.map((m) => m.groupId) }, deletedAt: null })
      .select('name')
      .lean(),
  ]);

  const grupoPorId = new Map(grupos.map((g) => [String(g._id), String((g as { name?: string }).name ?? '')]));
  const grupoPorMateria = new Map(
    matriculas.map((m) => [String(m.subjectId), grupoPorId.get(String(m.groupId)) ?? '']),
  );

  const franjasPorMateria = new Map<string, MateriaCarga['franjas']>();
  for (const horario of horarios) {
    const clave = String(horario.subjectId);
    const lista = franjasPorMateria.get(clave) ?? [];
    lista.push({
      dia: Number(horario.dayOfWeek),
      inicio: String(horario.startTime),
      fin: String(horario.endTime),
      aula: String((horario as { classroom?: string }).classroom ?? '') || null,
    });
    franjasPorMateria.set(clave, lista);
  }

  const carga: MateriaCarga[] = materias.map((materia) => ({
    codigo: String((materia as { code?: string }).code ?? '') || undefined,
    nombre: String((materia as { name?: string }).name ?? ''),
    grupo: grupoPorMateria.get(String(materia._id)) || null,
    franjas: (franjasPorMateria.get(String(materia._id)) ?? []).sort(
      (a, b) => a.dia - b.dia || a.inicio.localeCompare(b.inicio),
    ),
  }));

  // La institución sale de cualquiera de sus materias: todas las que cursa este
  // semestre las dictan docentes de la misma. Si algún día un estudiante
  // cursara en dos, esto sería el sitio donde partir el envío.
  const institucion = subjectIds.length
    ? await claveInstitucional(String(subjectIds[0]))
    : null;

  const resultados = await repartir(institucion, [
    {
      estudiante: {
        id: String(estudiante._id),
        code: String(estudiante.code ?? ''),
        fullName: String(estudiante.fullName ?? ''),
      },
      aviso: carga.length
        ? avisoDeCargaAcademica({
            materias: carga,
            periodo: filtro.period,
            mensaje: filtro.mensaje,
          })
        : null,
    },
  ]);

  await registrarEnvio('carga', filtro.studentId, resultados, actor);
  return { resultados };
}

// ── Entregas ─────────────────────────────────────────────────────────────────

export async function avisarEntrega(
  filtro: {
    subjectId: string;
    period?: string;
    teacherId?: string;
    studentIds?: string[];
    titulo: string;
    fecha?: string;
    hora?: string;
    mensaje?: string;
  },
  actor: { id: string; ip?: string | null; userAgent?: string | null },
): Promise<{ resultados: ResultadoDestinatario[] }> {
  const materia = await SubjectModel.findById(filtro.subjectId).select('name code').lean();
  const estudiantes = await estudiantesDe({
    subjectId: filtro.subjectId,
    period: filtro.period,
    teacherId: filtro.teacherId,
    studentIds: filtro.studentIds,
  });
  const docente = await nombreDelDocente(filtro.teacherId ?? null);

  const aviso = avisoDeEntrega({
    materiaCodigo: materia?.code ?? undefined,
    materiaNombre: materia?.name ?? 'tu materia',
    docente,
    titulo: filtro.titulo,
    fecha: filtro.fecha,
    hora: filtro.hora,
    mensaje: filtro.mensaje,
  });

  const resultados = await repartir(
    await claveInstitucional(filtro.subjectId),
    estudiantes.slice(0, TOPE_LOTE).map((estudiante) => ({ estudiante, aviso })),
  );
  await registrarEnvio('entrega', filtro.subjectId, resultados, actor);
  return { resultados };
}

// ── Auditoría ────────────────────────────────────────────────────────────────

/**
 * Deja constancia de cada envío.
 *
 * Se anotan los **códigos** de quienes recibieron algo, no el contenido: lo que
 * hay que poder responder meses después es «¿quién avisó a este estudiante y
 * cuándo?», y para eso no hace falta guardar otra copia del texto.
 */
async function registrarEnvio(
  tipo: string,
  entityId: string,
  resultados: ResultadoDestinatario[],
  actor: { id: string; ip?: string | null; userAgent?: string | null },
): Promise<void> {
  const enviados = resultados.filter((r) => r.enviado);
  if (enviados.length === 0) return;
  await auditChange({
    actorId: actor.id,
    action: `uniplanner.${tipo}`,
    entity: 'uniplanner',
    entityId,
    after: {
      destinatarios: enviados.map((r) => r.code),
      total: resultados.length,
      enviados: enviados.length,
    },
    ip: actor.ip,
    userAgent: actor.userAgent,
  });
}
