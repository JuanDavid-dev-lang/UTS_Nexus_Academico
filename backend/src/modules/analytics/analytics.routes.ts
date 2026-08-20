import { Router } from 'express';
import { z } from 'zod';
import { identificar, requireRole } from '../../middlewares/auth.js';
import { StudentModel } from '../../models/student.model.js';
import { SubjectModel } from '../../models/subject.model.js';
import { RiskFeedbackModel } from '../../models/risk-feedback.model.js';
import { getProfessorScope } from '../../shared/professor-scope.js';
import { emitToUser } from '../../shared/socket.js';
import { computeAcademicRecords, type AcademicFilter, type AcademicRecord } from '../../shared/academic.service.js';

export const analyticsRouter = Router();

analyticsRouter.use(identificar);

/** Construye el filtro académico según el rol (profesor / estudiante / admin). */
async function scopedFilter(req: any): Promise<AcademicFilter> {
  if (req.user?.role === 'PROFESSOR') return { teacherId: req.user.id };
  if (req.user?.role === 'STUDENT') return { studentId: req.user.studentId };
  return {};
}

analyticsRouter.get('/dashboard', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR', 'STUDENT'), async (req, res, next) => {
  try {
    const filter = await scopedFilter(req);
    const records = await computeAcademicRecords(filter);

    // Totales de estudiantes/materias (alcance real por rol).
    let totalStudents: number;
    let totalSubjects: number;
    if (req.user?.role === 'PROFESSOR') {
      const scope = await getProfessorScope(req.user.id);
      totalStudents = scope.studentIds.length;
      totalSubjects = scope.subjectIds.length;
    } else if (req.user?.role === 'STUDENT') {
      totalStudents = 1;
      totalSubjects = new Set(records.map(r => r.subjectId)).size;
    } else {
      [totalStudents, totalSubjects] = await Promise.all([
        StudentModel.countDocuments({ deletedAt: null }),
        SubjectModel.countDocuments({ deletedAt: null }),
      ]);
    }

    // Promedio ACTUAL (parcial): refleja el desempeño con lo ya calificado.
    const conNotas = records.filter(r => r.tieneNotas);
    const averageGrade = conNotas.length
      ? Number((conNotas.reduce((sum, r) => sum + r.riesgo.notaActual, 0) / conNotas.length).toFixed(2))
      : 0;

    // Asistencia: promedio de los porcentajes ponderados por registro.
    const sumaPorcentajes = records.reduce((s, r) => s + r.riesgo.porcentajeAsistencia, 0);
    const averageAttendance = records.length ? Number((sumaPorcentajes / records.length).toFixed(2)) : 0;

    // Agregación a nivel de estudiante (un alumno puede tener varias materias).
    const porEstudiante = new Map<string, { graded: number; failed: number; riesgo: boolean }>();
    for (const r of records) {
      const cur = porEstudiante.get(r.studentId) ?? { graded: 0, failed: 0, riesgo: false };
      if (r.tieneNotas) {
        cur.graded += 1;
        // Proyección con el promedio actual (no la final con ceros).
        if (r.riesgo.notaActual < 3) cur.failed += 1;
      }
      if (r.riesgo.nivel !== 'BAJO') cur.riesgo = true;
      porEstudiante.set(r.studentId, cur);
    }
    const alumnos = [...porEstudiante.values()];
    // Aprobado: tiene notas y ninguna materia perdida. Reprobado: al menos una perdida.
    const approvedStudents = alumnos.filter(s => s.graded > 0 && s.failed === 0).length;
    const failedStudents = alumnos.filter(s => s.failed > 0).length;
    const riskStudents = alumnos.filter(s => s.riesgo).length;

    // Materias críticas: promedio final < 3.0.
    const porMateria = new Map<string, { suma: number; n: number }>();
    for (const r of conNotas) {
      const cur = porMateria.get(r.subjectId) ?? { suma: 0, n: 0 };
      cur.suma += r.riesgo.notaActual;
      cur.n += 1;
      porMateria.set(r.subjectId, cur);
    }
    const criticalSubjects = [...porMateria.values()].filter(m => m.suma / m.n < 3).length;
    const missedClasses = records.reduce((s, r) => s + r.riesgo.clasesAusente, 0);

    res.json({
      ok: true,
      summary: {
        totalStudents,
        totalSubjects,
        averageGrade,
        averageAttendance,
        approvedStudents,
        failedStudents,
        riskStudents,
        criticalSubjects,
        missedClasses,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Anota qué se hizo con un estudiante en riesgo.
 *
 * Convierte el tablero en un seguimiento: sin esto el docente no tenía dónde
 * dejar constancia de que ya había hablado con alguien, y la lista repetía los
 * mismos nombres cada semana sin distinguir el caso nuevo del ya atendido.
 *
 * Escribe sobre el mismo documento que usa la realimentación del modelo —un
 * caso por (estudiante, materia, periodo)— porque es el mismo caso: qué predijo
 * el sistema, qué hizo el docente y cómo terminó. Separarlo en dos colecciones
 * obligaría a cruzarlas para responder «¿funcionó lo que hicimos?».
 */
analyticsRouter.patch('/risks/intervencion', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const body = z.object({
      studentId: z.string(),
      subjectId: z.string(),
      period: z.string().min(4),
      estado: z.enum(['PENDIENTE', 'CONTACTADO', 'CITA_ACORDADA', 'NO_RESPONDE', 'RESUELTO']),
      nota: z.string().max(500).default(''),
    }).parse(req.body);

    // Un docente solo anota sobre sus propios estudiantes y materias. Sin esta
    // comprobación, el seguimiento sería una vía para escribir en el expediente
    // de un estudiante ajeno.
    if (req.user?.role === 'PROFESSOR') {
      const scope = await getProfessorScope(req.user.id);
      if (!scope.studentIds.includes(body.studentId) || !scope.subjectIds.includes(body.subjectId)) {
        return res.status(403).json({ ok: false, message: 'Fuera de tu alcance' });
      }
    }

    const item = await RiskFeedbackModel.findOneAndUpdate(
      { studentId: body.studentId, subjectId: body.subjectId, period: body.period },
      {
        $set: {
          interventionStatus: body.estado,
          interventionNote: body.nota,
          interventionAt: new Date(),
          interventionBy: req.user?.id,
          teacherId: req.user?.id,
        },
        // Solo al crear: si el caso ya existe porque el modelo lo registró, su
        // predicción original no debe reescribirse con un valor de relleno.
        $setOnInsert: { predictedLevel: 'MEDIUM' },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    emitToUser(String(req.user?.id), 'sync:update', {
      entity: 'risk',
      action: 'update',
      id: String(item?._id ?? body.studentId),
    });

    res.json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

// ── Seguimiento: episodios de acompañamiento ────────────────────────────────

/** Nivel de riesgo actual del estudiante en la materia, según el motor canónico. */
async function nivelActualDe(
  studentId: string,
  subjectId: string,
  period: string,
  teacherId?: string,
): Promise<'BAJO' | 'MEDIO' | 'ALTO'> {
  const filter: AcademicFilter = { studentId, period };
  if (teacherId) filter.teacherId = teacherId;
  const records = await computeAcademicRecords(filter);
  const record = records.find(r => String(r.subjectId) === subjectId);
  const nivel = record?.riesgo.nivel;
  return nivel === 'ALTO' || nivel === 'MEDIO' ? nivel : 'BAJO';
}

function progresoEntre(desde: string, hasta: string): 'MEJORA' | 'IGUAL' | 'EMPEORA' {
  const peso: Record<string, number> = { BAJO: 0, MEDIO: 1, ALTO: 2 };
  const delta = (peso[hasta] ?? 0) - (peso[desde] ?? 0);
  return delta < 0 ? 'MEJORA' : delta > 0 ? 'EMPEORA' : 'IGUAL';
}

async function exigirAlcance(req: any, studentId: string, subjectId: string): Promise<boolean> {
  if (req.user?.role !== 'PROFESSOR') return true;
  const scope = await getProfessorScope(req.user.id);
  return scope.studentIds.includes(studentId) && scope.subjectIds.includes(subjectId);
}

/**
 * Episodios de seguimiento de un caso, más lo que el cliente necesita para
 * decidir: si alguno terminó NEGADO (para advertir antes de abrir otro), el
 * nivel actual y el progreso del episodio abierto respecto a su apertura.
 */
analyticsRouter.get('/risks/seguimientos', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const query = z.object({
      studentId: z.string().min(1),
      subjectId: z.string().min(1),
      period: z.string().min(4),
    }).parse(req.query);

    if (!(await exigirAlcance(req, query.studentId, query.subjectId))) {
      return res.status(403).json({ ok: false, message: 'Fuera de tu alcance' });
    }

    const caso = await RiskFeedbackModel.findOne({
      studentId: query.studentId,
      subjectId: query.subjectId,
      period: query.period,
    }).lean();

    const episodios = [...(caso?.seguimientos ?? [])].reverse();
    const nivelActual = await nivelActualDe(
      query.studentId,
      query.subjectId,
      query.period,
      req.user?.role === 'PROFESSOR' ? req.user.id : undefined,
    );
    const abierto = episodios.find(e => e.estado === 'EN_CURSO');

    res.json({
      ok: true,
      items: episodios,
      huboNegado: episodios.some(e => e.estado === 'NEGADO'),
      nivelActual,
      // El progreso del episodio abierto: cómo está hoy frente a cómo estaba
      // cuando el docente decidió intervenir. Lo calcula el servidor.
      progreso: abierto ? progresoEntre(String(abierto.nivelAlCrear), nivelActual) : null,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Abre un episodio de seguimiento: qué se va a hacer con el estudiante.
 *
 * La advertencia de «ya estuvo en acompañamiento y fue negado» la muestra el
 * cliente con el `huboNegado` del GET; aquí no se bloquea nada — reintentar es
 * legítimo, solo tiene que ser una decisión informada.
 */
analyticsRouter.post('/risks/seguimientos', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const body = z.object({
      studentId: z.string().min(1),
      subjectId: z.string().min(1),
      period: z.string().min(4),
      accion: z.enum(['LLAMADA', 'TUTORIA', 'CHARLA', 'OTRA']),
      nota: z.string().max(500).default(''),
    }).parse(req.body);

    if (!(await exigirAlcance(req, body.studentId, body.subjectId))) {
      return res.status(403).json({ ok: false, message: 'Fuera de tu alcance' });
    }

    // Un episodio abierto a la vez: el recordatorio y el progreso hablan de
    // «el seguimiento» de este caso, y con dos abiertos ninguno sabría cuál.
    const previo = await RiskFeedbackModel.findOne({
      studentId: body.studentId,
      subjectId: body.subjectId,
      period: body.period,
      'seguimientos.estado': 'EN_CURSO',
    }).lean();
    if (previo) {
      return res.status(409).json({
        ok: false,
        message: 'Ya hay un seguimiento en curso para este estudiante en esta materia. Ciérralo antes de abrir otro.',
      });
    }

    const nivelAlCrear = await nivelActualDe(
      body.studentId,
      body.subjectId,
      body.period,
      req.user?.role === 'PROFESSOR' ? req.user.id : undefined,
    );

    const item = await RiskFeedbackModel.findOneAndUpdate(
      { studentId: body.studentId, subjectId: body.subjectId, period: body.period },
      {
        $push: {
          seguimientos: {
            accion: body.accion,
            nota: body.nota,
            estado: 'EN_CURSO',
            nivelAlCrear,
            creadoPor: req.user?.id,
            creadoEn: new Date(),
          },
        },
        $set: { teacherId: req.user?.id },
        // Solo al crear el caso: si ya existía por el modelo, su predicción no
        // se pisa con un valor de relleno.
        $setOnInsert: { predictedLevel: 'MEDIUM' },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    emitToUser(String(req.user?.id), 'sync:update', { entity: 'risk', action: 'update', id: String(item._id) });
    res.status(201).json({ ok: true, item: item.seguimientos[item.seguimientos.length - 1] });
  } catch (err) {
    next(err);
  }
});

/**
 * Cierra un episodio con su resultado: BIEN (hubo charla o solución) o NEGADO
 * (el estudiante no aceptó el acompañamiento). El nivel al cierre lo mide el
 * servidor y con él queda dicho si el riesgo mejoró, siguió igual o empeoró.
 */
analyticsRouter.patch('/risks/seguimientos/:id', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const body = z.object({
      resultado: z.enum(['BIEN', 'NEGADO']),
      nota: z.string().max(500).default(''),
    }).parse(req.body);

    const caso = await RiskFeedbackModel.findOne({ 'seguimientos._id': req.params.id });
    if (!caso) return res.status(404).json({ ok: false, message: 'Seguimiento no encontrado' });

    if (!(await exigirAlcance(req, String(caso.studentId), String(caso.subjectId)))) {
      return res.status(403).json({ ok: false, message: 'Fuera de tu alcance' });
    }

    const episodio = (caso.seguimientos as any).id(req.params.id);
    if (!episodio) return res.status(404).json({ ok: false, message: 'Seguimiento no encontrado' });
    if (episodio.estado !== 'EN_CURSO') {
      return res.status(409).json({ ok: false, message: 'Este seguimiento ya está cerrado.' });
    }

    const nivelAlCerrar = await nivelActualDe(
      String(caso.studentId),
      String(caso.subjectId),
      String(caso.period),
      req.user?.role === 'PROFESSOR' ? req.user.id : undefined,
    );

    episodio.estado = body.resultado;
    episodio.notaCierre = body.nota;
    episodio.nivelAlCerrar = nivelAlCerrar;
    episodio.cerradoEn = new Date();
    await caso.save();

    emitToUser(String(req.user?.id), 'sync:update', { entity: 'risk', action: 'update', id: String(caso._id) });
    res.json({
      ok: true,
      item: episodio,
      progreso: progresoEntre(String(episodio.nivelAlCrear), nivelAlCerrar),
    });
  } catch (err) {
    next(err);
  }
});


analyticsRouter.get('/risks', requireRole('ADMIN', 'PROFESSOR', 'COORDINATOR'), async (req, res, next) => {
  try {
    const filter = await scopedFilter(req);
    const records = await computeAcademicRecords(filter);

    // Un registro por estudiante: el peor riesgo entre sus materias.
    const peor = new Map<string, AcademicRecord>();
    for (const r of records) {
      const prev = peor.get(r.studentId);
      if (!prev || r.riesgo.puntaje > prev.riesgo.puntaje) peor.set(r.studentId, r);
    }

    const enRiesgo = [...peor.values()]
      .filter(r => r.riesgo.nivel !== 'BAJO')
      .sort((a, b) => b.riesgo.puntaje - a.riesgo.puntaje)
      .slice(0, 50);

    /*
     * Seguimiento ya anotado sobre cada caso. Va en la misma respuesta para que
     * la lista distinga "aún no lo he mirado" de "llevo un mes detrás": sin eso
     * el tablero informaba lo mismo cada semana y no había forma de saber cuál
     * ya estaba atendido.
     */
    const seguimientos = await RiskFeedbackModel.find({
      deletedAt: null,
      studentId: { $in: enRiesgo.map(r => r.studentId) },
    })
      .select('studentId subjectId interventionStatus interventionNote interventionAt')
      .lean();

    const porCaso = new Map(
      seguimientos.map(s => [`${String(s.studentId)}|${String(s.subjectId)}`, s])
    );

    const items = enRiesgo.map(r => {
      const seguimiento = porCaso.get(`${r.studentId}|${r.subjectId}`);
      return {
        studentId: r.studentId,
        code: r.code,
        fullName: r.fullName,
        subjectId: r.subjectId,
        notaFinal: r.notaFinal,
        attendanceRate: r.riesgo.porcentajeAsistencia,
        missed: r.riesgo.clasesAusente,
        riskScore: r.riesgo.puntaje,
        level: r.riesgo.nivel === 'ALTO' ? 'HIGH' : r.riesgo.nivel === 'MEDIO' ? 'MEDIUM' : 'LOW',
        motivos: r.riesgo.motivos,
        interventionStatus: seguimiento?.interventionStatus ?? 'PENDIENTE',
        interventionNote: seguimiento?.interventionNote ?? '',
        interventionAt: seguimiento?.interventionAt ?? null,
      };
    });

    res.json({ ok: true, items });
  } catch (err) {
    next(err);
  }
});
