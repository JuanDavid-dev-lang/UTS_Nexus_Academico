/**
 * Contexto que se le entrega al asistente.
 *
 * Fija el recorte y su orden, que son lo que impide una respuesta inventada.
 * Antes se emitía una línea por estudiante sin techo: con un alcance de ADMIN
 * eso es la institución entera, Ollama recortaba por `num_ctx` en silencio, y
 * lo que se caía del recorte era el final del prompt — es decir, la pregunta.
 * El modelo respondía entonces a un listado sin pregunta.
 */
import { describe, expect, it } from 'vitest';
import { buildContext } from '../src/modules/ai/assistant.service.js';
import type { AcademicRecord } from '../src/shared/academic.service.js';

function registro(over: Partial<AcademicRecord> & { nivel?: 'BAJO' | 'MEDIO' | 'ALTO' } = {}): AcademicRecord {
  const { nivel = 'BAJO', ...resto } = over;
  return {
    studentId: 's1',
    subjectId: 'm1',
    groupId: null,
    teacherId: null,
    period: '2026-1',
    code: '1098765432',
    fullName: 'Ana Pérez',
    notaFinal: 4,
    cortes: [4, 4, 4],
    aprobado: true,
    notaCompleta: true,
    tieneNotas: true,
    riesgo: {
      nivel,
      puntaje: 0,
      notaActual: 4,
      sinNotas: false,
      porcentajeAsistencia: 95,
      clasesAusente: 0,
      motivos: [],
    },
    ...resto,
  } as AcademicRecord;
}

/**
 * Solo las líneas de detalle.
 *
 * El resumen también empieza por `- ` («- Estudiantes: 200»), así que filtrar
 * por el guion cuenta una línea de más. Se corta a partir del encabezado del
 * detalle, que es lo que separa un bloque del otro.
 */
function lineasDeDetalle(texto: string): string[] {
  const desde = texto.split('\n').findIndex(l => l.startsWith('DETALLE'));
  return texto
    .split('\n')
    .slice(desde + 1)
    .filter(l => l.startsWith('- '));
}

/** Genera n registros distinguibles por nombre. */
const muchos = (n: number, nivel: 'BAJO' | 'MEDIO' | 'ALTO' = 'BAJO') =>
  Array.from({ length: n }, (_, i) =>
    registro({ nivel, studentId: `s${i}`, code: `${i}`, fullName: `Estudiante ${i}` }),
  );

describe('contexto del asistente', () => {
  it('lo dice cuando no hay nada, en vez de devolver un bloque vacío', () => {
    expect(buildContext([])).toContain('No hay estudiantes');
  });

  it('detalla a todos mientras quepan', () => {
    const texto = buildContext(muchos(10));
    expect(texto).toContain('Estudiante 0');
    expect(texto).toContain('Estudiante 9');
    expect(texto).not.toContain('no caben en este contexto');
  });

  it('recorta el detalle cuando hay más de los que caben', () => {
    expect(lineasDeDetalle(buildContext(muchos(200)))).toHaveLength(40);
  });

  it('avisa de cuántos se quedaron fuera y prohíbe suponerlos', () => {
    const texto = buildContext(muchos(200));
    expect(texto).toContain('160 estudiante(s) más que no caben');
    expect(texto).toContain('NO lo des por ausente');
  });

  it('el resumen cuenta el total real, no el recortado', () => {
    expect(buildContext(muchos(200))).toContain('- Estudiantes: 200');
  });

  it('al recortar sobreviven los de mayor riesgo, no los primeros de la lista', () => {
    const enRiesgo = registro({
      nivel: 'ALTO',
      studentId: 'ultimo',
      code: '999',
      fullName: 'Ultimo Enriesgo',
    });
    // Va al final: si el recorte fuera por orden de llegada, se perdería.
    const texto = buildContext([...muchos(100), enRiesgo]);
    expect(texto).toContain('Ultimo Enriesgo');
  });

  it('a igual riesgo detalla primero al de peor nota', () => {
    const peor = registro({
      nivel: 'MEDIO',
      fullName: 'Peor Nota',
      riesgo: { ...registro().riesgo, nivel: 'MEDIO', notaActual: 1.2 },
    });
    const lineas = lineasDeDetalle(buildContext([...muchos(100, 'MEDIO'), peor]));
    expect(lineas[0]).toContain('Peor Nota');
  });

  it('resume los indicadores que se preguntan a diario', () => {
    const reprobando = registro({
      fullName: 'Bajo Rendimiento',
      riesgo: { ...registro().riesgo, nivel: 'ALTO', notaActual: 2.1, porcentajeAsistencia: 55 },
    });
    const texto = buildContext([registro(), reprobando]);
    expect(texto).toContain('- Por debajo de 3.0: 1');
    expect(texto).toContain('- Con asistencia bajo el 80%: 1');
    expect(texto).toContain('- En riesgo (medio/alto): 1');
  });

  it('el promedio del grupo ignora a quien todavía no tiene notas', () => {
    const sinNotas = registro({ fullName: 'Sin Notas', tieneNotas: false });
    const conNota = registro({
      fullName: 'Con Nota',
      riesgo: { ...registro().riesgo, notaActual: 3 },
    });
    expect(buildContext([sinNotas, conNota])).toContain('Promedio del grupo (parcial): 3.00');
  });

  it('marca "sin notas" en lugar de inventar un cero', () => {
    const texto = buildContext([registro({ fullName: 'Sin Notas', tieneNotas: false })]);
    expect(texto).toContain('promedio sin notas');
    expect(texto).not.toContain('promedio 0.00');
  });
});
