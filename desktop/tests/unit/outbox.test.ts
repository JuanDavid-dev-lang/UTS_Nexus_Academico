import { describe, expect, it } from 'vitest';
import {
  asistenciaPendiente,
  claveDeClase,
  claveDeNota,
  crearEntradaDeBorrado,
  crearEntradaDeClase,
  crearEntradaDeNota,
  descartarNotaPendiente,
  encolar,
  idDeNotaPendiente,
  marcarEnviando,
  marcarFallida,
  marcarReintento,
  notasPendientes,
  notasPorEliminar,
  proximaEspera,
  recuperarTrasReinicio,
  resumirCola,
  siguienteEnviable,
  textoAlCerrarSesion,
  textoDeCola,
  type ClaseAsistencia,
  type OutboxEntry,
} from '@/domain/offline/outbox';
import type { GradeInput } from '@/domain/schemas/grades';

const nota = (cambios: Partial<GradeInput> = {}): GradeInput => ({
  studentId: 'est1',
  subjectId: 'mat1',
  teacherId: 'doc1',
  corte: 1,
  componentType: 'TRABAJOS',
  label: 'Taller 1',
  score: 4,
  period: '2026-2',
  ...cambios,
});

const clase: ClaseAsistencia = {
  subjectId: 'mat1',
  groupId: 'g1',
  teacherId: 'doc1',
  period: '2026-2',
  dia: '2026-10-05',
  date: '2026-10-05T17:00:00.000Z',
};
const reg = (studentId: string, present: boolean) => ({ studentId, present, lateMinutes: 0, notes: '' });

let n = 0;
const ctx = (ahora = 1000) => ({ userId: 'doc1', id: `e${++n}`, ahora });

describe('encolar: notas', () => {
  it('la misma nota (clave natural) reemplaza a la anterior y conserva sitio e id', () => {
    const a = crearEntradaDeNota(nota(), ctx(1));
    const otra = crearEntradaDeNota(nota({ studentId: 'est2' }), ctx(2));
    const { entradas: cola1 } = encolar([], a);
    const { entradas: cola2 } = encolar(cola1, otra);
    const corregida = crearEntradaDeNota(nota({ score: 4.5 }), ctx(3));
    const { entradas, entrada } = encolar(cola2, corregida);

    expect(entradas).toHaveLength(2);
    expect(entradas[0]!.id).toBe(a.id);
    expect(entrada?.id).toBe(a.id);
    expect(entradas[0]!.datos).toMatchObject({ input: { score: 4.5 } });
    expect(entradas[0]!.body).toMatchObject({ score: 4.5, capturadoEn: new Date(3).toISOString() });
  });

  it('notas con otra etiqueta, corte o componente son entradas distintas', () => {
    let cola: OutboxEntry[] = [];
    for (const cambio of [{}, { label: 'Taller 2' }, { corte: 2 as const }, { componentType: 'PARCIALES' as const }]) {
      cola = encolar(cola, crearEntradaDeNota(nota(cambio), ctx())).entradas;
    }
    expect(cola).toHaveLength(4);
    expect(claveDeNota(nota())).not.toBe(claveDeNota(nota({ label: 'Taller 2' })));
  });

  it('una entrada que ya está enviándose no se reescribe: se añade otra detrás', () => {
    const a = crearEntradaDeNota(nota(), ctx());
    const enVuelo = marcarEnviando([a], a.id);
    const { entradas } = encolar(enVuelo, crearEntradaDeNota(nota({ score: 1 }), ctx()));
    expect(entradas).toHaveLength(2);
    expect(entradas[0]!.estado).toBe('enviando');
  });

  it('corregir una entrada fallida la devuelve a pendiente y sin intentos', () => {
    const a = crearEntradaDeNota(nota(), ctx());
    const fallida = marcarFallida([a], a.id, 'Periodo cerrado');
    const { entradas } = encolar(fallida, crearEntradaDeNota(nota({ score: 3 }), ctx()));
    expect(entradas[0]).toMatchObject({ estado: 'pendiente', intentos: 0, ultimoError: null });
  });
});

describe('encolar: asistencia', () => {
  it('las marcas de una misma clase se funden en un solo envío', () => {
    let cola: OutboxEntry[] = [];
    cola = encolar(cola, crearEntradaDeClase(clase, [reg('a', true)], ctx())).entradas;
    cola = encolar(cola, crearEntradaDeClase(clase, [reg('b', false)], ctx())).entradas;
    cola = encolar(cola, crearEntradaDeClase(clase, [reg('a', false), reg('c', true)], ctx())).entradas;

    expect(cola).toHaveLength(1);
    const datos = cola[0]!.datos;
    if (datos.kind !== 'attendance.class') throw new Error('tipo inesperado');
    expect(datos.registros.map((r) => [r.studentId, r.present])).toEqual([
      ['a', false],
      ['b', false],
      ['c', true],
    ]);
    expect(cola[0]!.path).toBe('/attendance/bulk');
    expect(cola[0]!.body).toMatchObject({ registros: expect.any(Array), subjectId: 'mat1', groupId: 'g1' });
  });

  it('otra fecha o otro grupo son clases distintas', () => {
    let cola: OutboxEntry[] = [];
    cola = encolar(cola, crearEntradaDeClase(clase, [reg('a', true)], ctx())).entradas;
    cola = encolar(cola, crearEntradaDeClase({ ...clase, dia: '2026-10-06' }, [reg('a', true)], ctx())).entradas;
    cola = encolar(cola, crearEntradaDeClase({ ...clase, groupId: 'g2' }, [reg('a', true)], ctx())).entradas;
    expect(cola).toHaveLength(3);
    expect(claveDeClase(clase)).toBe(claveDeClase({ ...clase }));
  });
});

describe('borrar', () => {
  it('borrar dos veces la misma nota del servidor encola una sola vez', () => {
    let cola: OutboxEntry[] = [];
    cola = encolar(cola, crearEntradaDeBorrado('n1', 'Taller 1', ctx())).entradas;
    cola = encolar(cola, crearEntradaDeBorrado('n1', 'Taller 1', ctx())).entradas;
    expect(cola).toHaveLength(1);
    expect(cola[0]).toMatchObject({ method: 'DELETE', path: '/grades/n1', body: null });
  });

  it('borrar una nota que solo existe en la cola quita el envío', () => {
    const a = crearEntradaDeNota(nota(), ctx());
    const b = crearEntradaDeNota(nota({ studentId: 'est2' }), ctx());
    const { entradas, quitada } = descartarNotaPendiente([a, b], idDeNotaPendiente(a));
    expect(quitada).toBe(true);
    expect(entradas.map((e) => e.id)).toEqual([b.id]);
  });

  it('no se puede quitar de la cola una nota que ya está viajando', () => {
    const a = crearEntradaDeNota(nota(), ctx());
    const { entradas, quitada } = descartarNotaPendiente(marcarEnviando([a], a.id), idDeNotaPendiente(a));
    expect(quitada).toBe(false);
    expect(entradas).toHaveLength(1);
  });
});

describe('transiciones y selección', () => {
  it('siguienteEnviable respeta el orden, la espera y las exclusiones', () => {
    const a = crearEntradaDeNota(nota(), ctx());
    const b = crearEntradaDeNota(nota({ studentId: 'est2' }), ctx());
    const esperando = marcarReintento([a, b], a.id, 'sin red', 5000);

    expect(siguienteEnviable(esperando, 1000)?.id).toBe(b.id);
    expect(siguienteEnviable(esperando, 6000)?.id).toBe(a.id);
    expect(siguienteEnviable(esperando, 6000, new Set([a.id]))?.id).toBe(b.id);
    expect(siguienteEnviable(marcarFallida([a], a.id, 'x'), 6000)).toBeUndefined();
    expect(proximaEspera(esperando)).toBe(5000);
  });

  it('al reabrir, lo que estaba enviándose vuelve a pendiente', () => {
    const a = crearEntradaDeNota(nota(), ctx());
    expect(recuperarTrasReinicio(marcarEnviando([a], a.id))[0]!.estado).toBe('pendiente');
  });

  it('el resumen y el texto de la insignia dicen lo que toca', () => {
    const a = crearEntradaDeNota(nota(), ctx());
    const b = crearEntradaDeNota(nota({ studentId: 'e2' }), ctx());
    const c = crearEntradaDeNota(nota({ studentId: 'e3' }), ctx());

    expect(textoDeCola(resumirCola([]))).toBe('');
    expect(textoDeCola(resumirCola([a, b, c]))).toBe('3 sin enviar');
    expect(textoDeCola(resumirCola(marcarEnviando([a, b], a.id)))).toBe('Enviando…');
    expect(textoDeCola(resumirCola(marcarFallida([a, b], a.id, 'x').map((e) => marcarFallida([e], e.id, 'x')[0]!)))).toBe('2 con error');
  });

  it('avisar al cerrar sesión no promete lo que la web no puede cumplir', () => {
    const resumen = resumirCola([crearEntradaDeNota(nota(), ctx())]);
    expect(textoAlCerrarSesion(resumen, true)).toContain('guardados en este equipo');
    expect(textoAlCerrarSesion(resumen, false)).toContain('se perderán');
  });
});

describe('superposición', () => {
  it('asistencia pendiente por estudiante, la más reciente manda', () => {
    const a = crearEntradaDeClase(clase, [reg('a', true), reg('b', true)], ctx());
    const b = crearEntradaDeClase({ ...clase, groupId: 'g2' }, [reg('a', false)], ctx());
    const otraFecha = crearEntradaDeClase({ ...clase, dia: '2026-10-06' }, [reg('z', true)], ctx());
    const marcas = asistenciaPendiente([a, b, otraFecha], { subjectId: 'mat1', dia: '2026-10-05' });

    expect(marcas.get('a')?.present).toBe(false);
    expect(marcas.get('b')?.present).toBe(true);
    expect(marcas.has('z')).toBe(false);
  });

  it('notas pendientes del componente y notas del servidor por eliminar', () => {
    const a = crearEntradaDeNota(nota(), ctx());
    const b = crearEntradaDeNota(nota({ corte: 2 }), ctx());
    const d = crearEntradaDeBorrado('srv9', 'Quiz', ctx());
    const filtro = { studentId: 'est1', subjectId: 'mat1', period: '2026-2', corte: 1, componentType: 'TRABAJOS' };

    expect(notasPendientes([a, b, d], filtro)).toEqual([
      { entradaId: a.id, id: idDeNotaPendiente(a), label: 'Taller 1', score: 4, weight: undefined, fallida: false },
    ]);
    expect([...notasPorEliminar([a, d])]).toEqual(['srv9']);
  });
});
