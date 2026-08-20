import { describe, expect, it } from 'vitest';
import {
  RUBRICA,
  calcularCorte,
  calcularNotaFinal,
  calcularPromedioParcial,
  notaNecesariaEnRestantes,
  notaNecesariaParaAprobar,
  type CorteNumero,
  type NotaComponente,
} from '../src/domains/grading/grading.service.js';

/**
 * El motor de calificación decide quién aprueba una materia. Un peso mal tocado
 * no rompe nada visible: cambia notas finales en silencio y se descubre por un
 * reclamo. Estas pruebas fijan las reglas académicas, no la implementación.
 */

function nota(
  corte: CorteNumero,
  tipo: NotaComponente['tipo'],
  score: number,
  label?: string
): NotaComponente {
  return { corte, tipo, score, ...(label ? { label } : {}) };
}

describe('rúbrica', () => {
  it('los componentes de un corte suman exactamente 1', () => {
    const suma = Object.values(RUBRICA.COMPONENTES).reduce((a, b) => a + b, 0);
    expect(suma).toBeCloseTo(1, 10);
  });

  it('los tres cortes suman exactamente 1', () => {
    const suma = Object.values(RUBRICA.CORTES).reduce((a, b) => a + b, 0);
    expect(suma).toBeCloseTo(1, 10);
  });
});

describe('calcularCorte', () => {
  it('aplica 30% trabajos + 60% parciales + 10% autoevaluación', () => {
    const resumen = calcularCorte(1, [
      nota(1, 'TRABAJOS', 4.0),
      nota(1, 'PARCIALES', 3.0),
      nota(1, 'AUTOEVALUACION', 5.0),
    ]);

    // 4.0*0.3 + 3.0*0.6 + 5.0*0.1 = 1.2 + 1.8 + 0.5
    expect(resumen.nota).toBe(3.5);
  });

  it('promedia varias notas del mismo componente: la suma dividida por cuántas hay', () => {
    const resumen = calcularCorte(1, [
      nota(1, 'TRABAJOS', 5.0, 'Taller 1'),
      nota(1, 'TRABAJOS', 4.0, 'Taller 2'),
      nota(1, 'TRABAJOS', 3.0, 'Exposición'),
    ]);

    const trabajos = resumen.componentes.find(c => c.tipo === 'TRABAJOS')!;
    expect(trabajos.promedio).toBe(4);
    expect(trabajos.registros).toBe(3);
    // Solo trabajos calificado: 4.0 * 0.3
    expect(resumen.nota).toBe(1.2);
  });

  it('devuelve cada nota con su motivo para poder corregir la que está mal', () => {
    const resumen = calcularCorte(2, [
      nota(2, 'PARCIALES', 2.5, 'Parcial 1'),
      nota(2, 'PARCIALES', 4.5, 'Parcial 2'),
    ]);

    const parciales = resumen.componentes.find(c => c.tipo === 'PARCIALES')!;
    expect(parciales.notas.map(n => n.label)).toEqual(['Parcial 1', 'Parcial 2']);
    expect(parciales.notas.map(n => n.score)).toEqual([2.5, 4.5]);
    expect(parciales.promedio).toBe(3.5);
  });

  it('una nota sin motivo se lista igual, con etiqueta por defecto', () => {
    const resumen = calcularCorte(1, [nota(1, 'TRABAJOS', 4.0)]);
    const trabajos = resumen.componentes.find(c => c.tipo === 'TRABAJOS')!;
    expect(trabajos.notas).toHaveLength(1);
    expect(trabajos.notas[0].label).toBe('Nota');
  });

  it('un componente sin ninguna nota aporta cero y no se salta el peso', () => {
    const resumen = calcularCorte(1, [nota(1, 'PARCIALES', 5.0)]);

    const trabajos = resumen.componentes.find(c => c.tipo === 'TRABAJOS')!;
    expect(trabajos.registros).toBe(0);
    expect(trabajos.promedio).toBe(0);
    // 5.0 * 0.6 y nada más: el 40% restante no se redistribuye.
    expect(resumen.nota).toBe(3);
  });

  it('un corte solo está completo cuando sus tres componentes tienen nota', () => {
    const incompleto = calcularCorte(1, [nota(1, 'TRABAJOS', 4.0), nota(1, 'PARCIALES', 4.0)]);
    expect(incompleto.completo).toBe(false);

    const completo = calcularCorte(1, [
      nota(1, 'TRABAJOS', 4.0),
      nota(1, 'PARCIALES', 4.0),
      nota(1, 'AUTOEVALUACION', 4.0),
    ]);
    expect(completo.completo).toBe(true);
  });

  it('ignora las notas de otros cortes', () => {
    const resumen = calcularCorte(1, [nota(2, 'PARCIALES', 5.0)]);
    expect(resumen.nota).toBe(0);
    expect(resumen.componentes.every(c => c.registros === 0)).toBe(true);
  });

  it('acota a la escala 0–5 aunque lleguen valores fuera de rango', () => {
    const alta = calcularCorte(1, [nota(1, 'TRABAJOS', 9)]);
    expect(alta.componentes.find(c => c.tipo === 'TRABAJOS')!.promedio).toBe(5);

    const baja = calcularCorte(1, [nota(1, 'TRABAJOS', -3)]);
    expect(baja.componentes.find(c => c.tipo === 'TRABAJOS')!.promedio).toBe(0);
  });
});

describe('calcularNotaFinal', () => {
  const corteCompleto = (corte: CorteNumero, valor: number): NotaComponente[] => [
    nota(corte, 'TRABAJOS', valor),
    nota(corte, 'PARCIALES', valor),
    nota(corte, 'AUTOEVALUACION', valor),
  ];

  it('pondera los cortes 33/33/34', () => {
    const resumen = calcularNotaFinal([
      ...corteCompleto(1, 5),
      ...corteCompleto(2, 4),
      ...corteCompleto(3, 3),
    ]);

    // 5*0.33 + 4*0.33 + 3*0.34 = 1.65 + 1.32 + 1.02
    expect(resumen.notaFinal).toBe(3.99);
  });

  it('aprueba justo en 3.0, que es el mínimo, no por encima de él', () => {
    const resumen = calcularNotaFinal([
      ...corteCompleto(1, 3),
      ...corteCompleto(2, 3),
      ...corteCompleto(3, 3),
    ]);

    expect(resumen.notaFinal).toBe(3);
    expect(resumen.aprobado).toBe(true);
  });

  it('no aprueba por debajo del mínimo', () => {
    const resumen = calcularNotaFinal([
      ...corteCompleto(1, 2.9),
      ...corteCompleto(2, 2.9),
      ...corteCompleto(3, 2.9),
    ]);
    expect(resumen.aprobado).toBe(false);
  });

  it('cuenta como cero lo no calificado: es la nota final, no el desempeño actual', () => {
    const resumen = calcularNotaFinal(corteCompleto(1, 5));
    // Solo el corte 1: 5 * 0.33
    expect(resumen.notaFinal).toBe(1.65);
    expect(resumen.completo).toBe(false);
  });

  it('sin ninguna nota da cero y no reprueba a nadie por sorpresa: marca incompleto', () => {
    const resumen = calcularNotaFinal([]);
    expect(resumen.notaFinal).toBe(0);
    expect(resumen.completo).toBe(false);
  });
});

describe('calcularPromedioParcial', () => {
  it('renormaliza sobre los cortes ya calificados en vez de castigar lo que falta', () => {
    const resumen = calcularPromedioParcial([
      nota(1, 'TRABAJOS', 4),
      nota(1, 'PARCIALES', 4),
      nota(1, 'AUTOEVALUACION', 4),
    ]);

    // El corte 1 vale 4.0 y es el único con nota: el promedio parcial es 4.0,
    // no 1.32. Esta es la regla que evita marcar en riesgo a media carrera a
    // quien va bien.
    expect(resumen.promedio).toBe(4);
    expect(resumen.cortesConNota).toBe(1);
  });

  it('pondera entre los cortes calificados según su peso relativo', () => {
    const resumen = calcularPromedioParcial([
      nota(1, 'TRABAJOS', 5),
      nota(1, 'PARCIALES', 5),
      nota(1, 'AUTOEVALUACION', 5),
      nota(2, 'TRABAJOS', 3),
      nota(2, 'PARCIALES', 3),
      nota(2, 'AUTOEVALUACION', 3),
    ]);

    // Pesos iguales (0.33 y 0.33): media aritmética.
    expect(resumen.promedio).toBe(4);
    expect(resumen.cortesConNota).toBe(2);
  });

  it('un corte con un solo componente calificado ya cuenta como corte con nota', () => {
    const resumen = calcularPromedioParcial([nota(1, 'PARCIALES', 5)]);
    expect(resumen.cortesConNota).toBe(1);
    // 5 * 0.6 = 3.0 dentro del corte; renormalizado sigue siendo 3.0.
    expect(resumen.promedio).toBe(3);
  });

  it('sin notas devuelve cero cortes, que es lo que distingue "va mal" de "aún no empieza"', () => {
    expect(calcularPromedioParcial([])).toEqual({ promedio: 0, cortesConNota: 0 });
  });
});

describe('notaNecesariaEnRestantes', () => {
  it('sin ningún corte calificado necesita 3.0 de media en los tres', () => {
    expect(notaNecesariaEnRestantes([0, 0, 0])).toEqual({
      cortesRestantes: 3,
      requerido: 3,
      aprobado: false,
    });
  });

  it('con dos cortes en 5.0 el tercero ya está asegurado', () => {
    // 5×0.33 + 5×0.33 = 3.3 ≥ 3.0
    const r = notaNecesariaEnRestantes([5, 5, 0]);
    expect(r).toEqual({ cortesRestantes: 1, requerido: 0, aprobado: true });
  });

  it('con dos cortes en 1.0 ya no alcanza ni con 5.0', () => {
    // Acumulado 0.66; necesitaría (3 − 0.66) / 0.34 = 6.88 > 5.
    const r = notaNecesariaEnRestantes([1, 1, 0]);
    expect(r).toEqual({ cortesRestantes: 1, requerido: null, aprobado: false });
  });

  it('con dos cortes en 2.0 pide 4.94 en el que falta', () => {
    const r = notaNecesariaEnRestantes([2, 2, 0]);
    expect(r.cortesRestantes).toBe(1);
    expect(r.requerido).toBeCloseTo(4.94, 2);
    expect(r.aprobado).toBe(false);
  });

  it('con los tres cortes cerrados solo dictamina', () => {
    expect(notaNecesariaEnRestantes([3, 3, 3])).toEqual({
      cortesRestantes: 0,
      requerido: null,
      aprobado: true,
    });
    expect(notaNecesariaEnRestantes([2, 2, 2]).aprobado).toBe(false);
  });

  it('un corte en 0 cuenta como pendiente, no como perdido', () => {
    // La aproximación declarada: el agregado no distingue un 0.0 real.
    const r = notaNecesariaEnRestantes([0, 4, 0]);
    expect(r.cortesRestantes).toBe(2);
    expect(r.requerido).toBeCloseTo((3 - 4 * 0.33) / 0.67, 2);
  });
});

describe('notaNecesariaParaAprobar', () => {
  const corteCompleto = (corte: CorteNumero, valor: number): NotaComponente[] => [
    nota(corte, 'TRABAJOS', valor),
    nota(corte, 'PARCIALES', valor),
    nota(corte, 'AUTOEVALUACION', valor),
  ];

  it('devuelve cero cuando lo acumulado ya alcanza para aprobar', () => {
    const notas = [...corteCompleto(1, 5), ...corteCompleto(2, 5)];
    expect(notaNecesariaParaAprobar(notas, 3)).toBe(0);
  });

  it('devuelve null cuando ya no es alcanzable ni con 5.0', () => {
    const notas = [...corteCompleto(1, 0), ...corteCompleto(2, 0)];
    expect(notaNecesariaParaAprobar(notas, 3)).toBeNull();
  });

  it('calcula cuánto falta en el corte objetivo', () => {
    const notas = [...corteCompleto(1, 3), ...corteCompleto(2, 3)];
    // Acumulado: 3*0.33 + 3*0.33 = 1.98. Falta 1.02 sobre un peso de 0.34 -> 3.0
    expect(notaNecesariaParaAprobar(notas, 3)).toBe(3);
  });
});
