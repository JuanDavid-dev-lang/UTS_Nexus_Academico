import { describe, expect, it } from 'vitest';
import {
  MAX_INTENTOS_5XX,
  clasificarFallo,
  esperaTrasFallo,
  parsearRetryAfter,
  type ErrorDeEnvio,
} from '@/domain/offline/clasificacion';
import { esperaDeSondeo, respuestaProbarServidor } from '@/domain/offline/conectividad';
import { RAICES_PERSISTIDAS, debePersistir } from '@/domain/offline/persistencia';
import {
  CONCURRENCIA_DE_PRECARGA,
  INTERVALO_DE_PRECARGA_MS,
  debePrecargar,
  tareasBase,
  tareasPorMateria,
} from '@/domain/offline/precarga';
import { queryKeys } from '@/core/api/query-keys';

const err = (cambios: Partial<ErrorDeEnvio>): ErrorDeEnvio => ({
  kind: 'unknown',
  mensaje: 'mensaje',
  ...cambios,
});
const nota = { kind: 'grade.upsert' as const, intentos: 0 };

describe('clasificar el fallo de un envío', () => {
  it('sin red, tiempo agotado y 429 se reintentan y detienen la tanda', () => {
    for (const kind of ['network', 'timeout', 'rate_limited'] as const) {
      expect(clasificarFallo(err({ kind }), nota)).toMatchObject({ tipo: 'reintentar', detener: true });
    }
    expect(clasificarFallo(err({ kind: 'network' }), nota)).toMatchObject({ red: true });
    expect(clasificarFallo(err({ kind: 'rate_limited' }), nota)).toMatchObject({ red: false });
  });

  it('un 5xx se reintenta sin frenar a las demás, hasta cansarse', () => {
    expect(clasificarFallo(err({ kind: 'server' }), nota)).toMatchObject({ tipo: 'reintentar', detener: false });
    expect(clasificarFallo(err({ kind: 'server' }), { ...nota, intentos: MAX_INTENTOS_5XX - 1 })).toMatchObject({
      tipo: 'fallida',
    });
  });

  it('401 pausa y conserva; borrar lo que ya no existe es éxito', () => {
    expect(clasificarFallo(err({ kind: 'unauthorized' }), nota)).toEqual({ tipo: 'pausar' });
    expect(clasificarFallo(err({ kind: 'not_found' }), { kind: 'grade.delete', intentos: 0 })).toEqual({ tipo: 'exito' });
    expect(clasificarFallo(err({ kind: 'not_found' }), nota)).toMatchObject({ tipo: 'fallida' });
  });

  it('CORTE_BLOQUEADO se aplaza; PERIODO_BLOQUEADO y otros 4xx quedan fallidos con su motivo', () => {
    expect(clasificarFallo(err({ kind: 'conflict', status: 409, codigo: 'CORTE_BLOQUEADO' }), nota)).toMatchObject({
      tipo: 'aplazar',
    });
    expect(
      clasificarFallo(err({ kind: 'conflict', status: 409, codigo: 'PERIODO_BLOQUEADO', mensaje: 'Periodo cerrado' }), nota),
    ).toEqual({ tipo: 'fallida', mensaje: 'Periodo cerrado' });
    expect(clasificarFallo(err({ kind: 'validation', status: 400 }), nota)).toMatchObject({ tipo: 'fallida' });
    expect(clasificarFallo(err({ kind: 'forbidden', status: 403 }), nota)).toMatchObject({ tipo: 'fallida' });
  });

  it('DUPLICADO se reintenta un par de veces y después falla', () => {
    const dup = err({ kind: 'conflict', status: 409, codigo: 'DUPLICADO' });
    expect(clasificarFallo(dup, nota)).toMatchObject({ tipo: 'reintentar' });
    expect(clasificarFallo(dup, { ...nota, intentos: 2 })).toMatchObject({ tipo: 'fallida' });
  });
});

describe('esperas', () => {
  it('el backoff crece y tiene techo; Retry-After manda si es mayor', () => {
    expect(esperaTrasFallo(0)).toBe(2000);
    expect(esperaTrasFallo(3)).toBe(16000);
    expect(esperaTrasFallo(30)).toBe(300000);
    expect(esperaTrasFallo(0, 60000)).toBe(60000);
    expect(esperaTrasFallo(5, 1000)).toBe(64000);
  });

  it('interpreta Retry-After en segundos y en fecha, y descarta basura', () => {
    expect(parsearRetryAfter('30')).toBe(30000);
    expect(parsearRetryAfter('Wed, 21 Oct 2026 07:28:30 GMT', Date.parse('Wed, 21 Oct 2026 07:28:00 GMT'))).toBe(30000);
    expect(parsearRetryAfter('mañana')).toBeUndefined();
    expect(parsearRetryAfter(null)).toBeUndefined();
    expect(parsearRetryAfter('99999')).toBe(300000);
  });

  it('el sondeo de conexión espera más cada vez, hasta 30 s', () => {
    expect([0, 1, 2, 10].map(esperaDeSondeo)).toEqual([3000, 6000, 12000, 30000]);
  });
});

describe('qué respuestas prueban que hay servidor', () => {
  it('502/503/504 y 52x los pone el proxy cuando el origen no está', () => {
    for (const s of [200, 401, 404, 409, 429, 500]) expect(respuestaProbarServidor(s)).toBe(true);
    for (const s of [502, 503, 504, 521, 530]) expect(respuestaProbarServidor(s)).toBe(false);
  });
});

describe('qué consultas se guardan en disco', () => {
  it('guarda lo que el docente necesita para trabajar', () => {
    const si = [
      queryKeys.subjects.list(),
      queryKeys.groups.list(),
      queryKeys.students.list(),
      queryKeys.students.list({ subjectId: 's', paginado: true }),
      queryKeys.enrollments.list({ subjectId: 's', period: '2026-2' }),
      queryKeys.grades.consolidated({ period: '2026-2', subjectId: 's' }),
      queryKeys.grades.list({ period: '2026-2' }),
      queryKeys.attendance.list({ subjectId: 's' }),
      queryKeys.periods.list(),
      queryKeys.profile.me(),
      queryKeys.analytics.dashboard(),
      queryKeys.gradeTemplates.list(),
    ];
    for (const clave of si) expect(debePersistir(clave), JSON.stringify(clave)).toBe(true);
  });

  it('no guarda búsquedas, administración, QR ni nada que cambie por reloj', () => {
    const no = [
      queryKeys.students.search('ana'),
      queryKeys.auth.me(),
      queryKeys.audit.list(),
      queryKeys.users.list({}),
      queryKeys.attendanceQrCode.de('x'),
      queryKeys.attendanceQr.abiertas('s'),
      queryKeys.periods.snapshot('2026-2'),
      queryKeys.analytics.seguimientos({ studentId: 'a', subjectId: 'b', period: 'c' }),
      queryKeys.notifications.list(),
      queryKeys.uniplanner.estado(),
      ['desconocida'],
      [],
    ];
    for (const clave of no) expect(debePersistir(clave), JSON.stringify(clave)).toBe(false);
  });

  it('las raíces persistidas coinciden con las claves reales del registro', () => {
    const raices = new Set<string>(
      Object.values(queryKeys).flatMap((grupo) => ('all' in grupo ? [String(grupo.all[0])] : [])),
    );
    for (const raiz of RAICES_PERSISTIDAS) {
      expect(raices.has(raiz), raiz).toBe(true);
    }
  });
});

describe('precarga en segundo plano', () => {
  const base = { rol: 'PROFESSOR', enLinea: true, enCurso: false, ultimaVez: 0, ahora: INTERVALO_DE_PRECARGA_MS };

  it('solo docentes, con servidor, sin otra en marcha y pasados 30 minutos', () => {
    expect(debePrecargar(base)).toBe(true);
    expect(debePrecargar({ ...base, rol: 'ADMIN' })).toBe(false);
    expect(debePrecargar({ ...base, rol: undefined })).toBe(false);
    expect(debePrecargar({ ...base, enLinea: false })).toBe(false);
    expect(debePrecargar({ ...base, enCurso: true })).toBe(false);
    expect(debePrecargar({ ...base, ultimaVez: 1, ahora: INTERVALO_DE_PRECARGA_MS })).toBe(false);
    expect(debePrecargar({ ...base, ultimaVez: 1, ahora: INTERVALO_DE_PRECARGA_MS + 1 })).toBe(true);
  });

  it('la concurrencia es baja', () => {
    expect(CONCURRENCIA_DE_PRECARGA).toBeLessThanOrEqual(2);
  });

  it('la etapa base trae periodos, materias, grupos, estudiantes y panel', () => {
    expect(tareasBase().map((t) => t.tipo)).toEqual(['periods', 'subjects', 'groups', 'students', 'dashboard']);
  });

  it('por materia del periodo actual: matriculados, consolidado y asistencia; y por grupo, los dos primeros', () => {
    const tareas = tareasPorMateria({
      periodo: '2026-2',
      materias: [
        { _id: 'm1', period: '2026-2' },
        { _id: 'vieja', period: '2026-1' },
      ],
      grupos: [
        { _id: 'g1', subjectId: 'm1', period: '2026-2' },
        { _id: 'g2', subjectId: 'm1' },
        { _id: 'gx', subjectId: 'm1', period: '2026-1' },
        { _id: 'gv', subjectId: 'vieja', period: '2026-2' },
      ],
    });

    expect(tareas.map((t) => `${t.tipo}:${t.scope?.groupId ?? '-'}`)).toEqual([
      'enrollments:-',
      'consolidated:-',
      'attendance:-',
      'enrollments:g1',
      'consolidated:g1',
      'enrollments:g2',
      'consolidated:g2',
    ]);
    expect(tareas.every((t) => t.scope?.subjectId === 'm1')).toBe(true);
  });
});
