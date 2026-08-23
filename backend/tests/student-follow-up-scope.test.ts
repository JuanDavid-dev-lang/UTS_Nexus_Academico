import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enrollmentExists: vi.fn(),
  enrollmentFind: vi.fn(),
  gradeFind: vi.fn(),
  attendanceFind: vi.fn(),
  attendanceCaseFind: vi.fn(),
  riskFind: vi.fn(),
  activityFind: vi.fn(),
  snapshotFind: vi.fn(),
  subjectFind: vi.fn(),
  studentFindOne: vi.fn(),
  compute: vi.fn(),
}));

function consulta(resultado: unknown) {
  const cadena: any = {
    select: vi.fn(() => cadena),
    sort: vi.fn(() => cadena),
    limit: vi.fn(() => cadena),
    lean: vi.fn(async () => resultado),
  };
  return cadena;
}

vi.mock('../src/models/enrollment.model.js', () => ({ EnrollmentModel: { exists: mocks.enrollmentExists, find: mocks.enrollmentFind } }));
vi.mock('../src/models/grade.model.js', () => ({ GradeModel: { find: mocks.gradeFind } }));
vi.mock('../src/models/attendance.model.js', () => ({ AttendanceModel: { find: mocks.attendanceFind } }));
vi.mock('../src/models/attendance-case.model.js', () => ({ AttendanceCaseModel: { find: mocks.attendanceCaseFind } }));
vi.mock('../src/models/risk-feedback.model.js', () => ({ RiskFeedbackModel: { find: mocks.riskFind } }));
vi.mock('../src/models/activity.model.js', () => ({ ActivityModel: { find: mocks.activityFind } }));
vi.mock('../src/models/academic-snapshot.model.js', () => ({ AcademicSnapshotModel: { find: mocks.snapshotFind } }));
vi.mock('../src/models/subject.model.js', () => ({ SubjectModel: { find: mocks.subjectFind } }));
vi.mock('../src/models/student.model.js', () => ({ StudentModel: { findOne: mocks.studentFindOne } }));
vi.mock('../src/shared/academic.service.js', () => ({ computeAcademicRecords: mocks.compute }));

import { construirExpedienteSeguimiento } from '../src/modules/timeline/timeline.service.js';

describe('alcance del expediente de seguimiento', () => {
  const estudiante = '64b000000000000000000001';
  const materiaProfesor = '64b000000000000000000002';
  const materiaAjena = '64b000000000000000000003';

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enrollmentExists.mockResolvedValue(true);
    mocks.enrollmentFind.mockImplementation((filtro: any) => consulta(filtro.professorId
      ? [{ subjectId: materiaProfesor, period: '2026-1' }]
      : []));
    for (const find of [mocks.gradeFind, mocks.attendanceFind, mocks.attendanceCaseFind,
      mocks.riskFind, mocks.activityFind, mocks.snapshotFind]) {
      find.mockImplementation(() => consulta([]));
    }
    mocks.subjectFind.mockImplementation(() => consulta([{ _id: materiaProfesor, name: 'Materia propia' }]));
    mocks.studentFindOne.mockImplementation(() => consulta({
      _id: estudiante, code: '1', fullName: 'Estudiante compartido', email: null, program: 'Programa',
    }));
    mocks.compute.mockImplementation(async ({ subjectId, period }: any) => subjectId === materiaProfesor && period === '2026-1'
      ? [{
          studentId: estudiante, subjectId: materiaProfesor, period: '2026-1', notaFinal: 4,
          cortes: [4, 4, 4], notaCompleta: true,
          riesgo: { notaActual: 4, porcentajeAsistencia: 100, clasesAusente: 0, nivel: 'BAJO', puntaje: 0, motivos: [] },
        }]
      : [{
          studentId: estudiante, subjectId: materiaAjena, period: '2026-2', notaFinal: 1,
          cortes: [1, 1, 1], notaCompleta: true,
          riesgo: { notaActual: 1, porcentajeAsistencia: 10, clasesAusente: 9, nivel: 'ALTO', puntaje: 99, motivos: ['Privado'] },
        }]);
  });

  it('sin subjectId limita materia y periodo a las matrículas del profesor solicitante', async () => {
    const resultado = await construirExpedienteSeguimiento(
      { studentId: estudiante },
      { page: 1, limit: 20 },
      { id: 'profesor-a', role: 'PROFESSOR' },
    );

    expect(mocks.compute).toHaveBeenCalledTimes(1);
    expect(mocks.compute).toHaveBeenCalledWith({
      studentId: estudiante, subjectId: materiaProfesor, period: '2026-1',
    });
    expect(resultado.academic).toHaveLength(1);
    expect(resultado.academic[0]).toMatchObject({ subjectId: materiaProfesor, period: '2026-1' });
    expect(JSON.stringify(resultado)).not.toContain(materiaAjena);
    expect(JSON.stringify(resultado)).not.toContain('Privado');

    const consultasDeFuentes = [mocks.gradeFind, mocks.attendanceFind, mocks.attendanceCaseFind,
      mocks.riskFind, mocks.snapshotFind].flatMap(mock => mock.mock.calls.map(([filtro]) => filtro));
    for (const filtro of consultasDeFuentes) {
      const filtroAcademico = filtro.$and?.[0] ?? filtro;
      expect(filtroAcademico.$or).toEqual([{ subjectId: expect.anything(), period: '2026-1' }]);
      expect(String(filtroAcademico.$or[0].subjectId)).toBe(materiaProfesor);
    }
  });
});
