import { describe, expect, it } from 'vitest';
import {
  LIMITES_PLANTILLA,
  normalizarEstructura,
  notasPendientes,
  pesoSegunEstructura,
  resolverPeso,
  validarEstructura,
  type EstructuraCorte,
} from '../src/domains/grading/plantilla-notas.js';
import type { NotaComponente } from '../src/domains/grading/grading.service.js';

/**
 * Una plantilla decide con qué peso se guarda cada nota de un grupo entero.
 * Un peso mal resuelto no da error: cambia la nota del corte en silencio.
 */

const PLANTILLA: EstructuraCorte = [
  {
    tipo: 'TRABAJOS',
    notas: [
      { label: 'Taller 1', weight: 1 },
      { label: 'Taller 2', weight: 1 },
      { label: 'Taller 3', weight: 1 },
    ],
  },
  {
    tipo: 'PARCIALES',
    notas: [
      { label: 'Parcial teórico', weight: 60 },
      { label: 'Parcial práctico', weight: 40 },
    ],
  },
  { tipo: 'AUTOEVALUACION', notas: [{ label: 'Autoevaluación', weight: 1 }] },
];

describe('validarEstructura', () => {
  it('acepta la plantilla típica: 3 talleres, teórico 60 / práctico 40, autoevaluación', () => {
    expect(validarEstructura(PLANTILLA)).toEqual([]);
  });

  it('un componente sin notas es válido: el docente lo deja libre', () => {
    expect(validarEstructura([{ tipo: 'TRABAJOS', notas: [] }])).toEqual([]);
  });

  it('rechaza etiquetas repetidas dentro del componente, sin distinguir mayúsculas', () => {
    const problemas = validarEstructura([
      {
        tipo: 'PARCIALES',
        notas: [
          { label: 'Parcial', weight: 1 },
          { label: 'parcial ', weight: 1 },
        ],
      },
    ]);
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toMatch(/repetida/);
  });

  it('rechaza un componente repetido, una nota sin nombre y pesos fuera de rango', () => {
    const problemas = validarEstructura([
      { tipo: 'TRABAJOS', notas: [{ label: '  ', weight: 1 }] },
      { tipo: 'TRABAJOS', notas: [] },
      { tipo: 'PARCIALES', notas: [{ label: 'P', weight: 0 }] },
    ]);
    expect(problemas.some(p => /sin nombre/.test(p))).toBe(true);
    expect(problemas.some(p => /dos veces/.test(p))).toBe(true);
    expect(problemas.some(p => /peso/.test(p))).toBe(true);
  });

  it('acota las notas por componente', () => {
    const notas = Array.from({ length: LIMITES_PLANTILLA.NOTAS_POR_COMPONENTE + 1 }, (_, i) => ({
      label: `Quiz ${i}`,
      weight: 1,
    }));
    expect(validarEstructura([{ tipo: 'TRABAJOS', notas }])).toHaveLength(1);
  });
});

describe('normalizarEstructura', () => {
  it('devuelve los tres componentes en orden canónico y recorta etiquetas', () => {
    const normal = normalizarEstructura([
      { tipo: 'PARCIALES', notas: [{ label: '  Teórico ', weight: 2 }] },
    ]);
    expect(normal.map(c => c.tipo)).toEqual(['TRABAJOS', 'PARCIALES', 'AUTOEVALUACION']);
    expect(normal[1].notas).toEqual([{ label: 'Teórico', weight: 2 }]);
    expect(normal[0].notas).toEqual([]);
  });
});

describe('pesoSegunEstructura y resolverPeso', () => {
  it('encuentra el peso por etiqueta sin distinguir mayúsculas', () => {
    expect(pesoSegunEstructura(PLANTILLA, 'PARCIALES', 'parcial TEÓRICO')).toBe(60);
    expect(pesoSegunEstructura(PLANTILLA, 'PARCIALES', 'Quiz sorpresa')).toBeNull();
    expect(pesoSegunEstructura(null, 'PARCIALES', 'Parcial teórico')).toBeNull();
  });

  it('el peso explícito manda sobre la plantilla; sin ninguno vale 1', () => {
    expect(resolverPeso(2, PLANTILLA, 'PARCIALES', 'Parcial teórico')).toBe(2);
    expect(resolverPeso(undefined, PLANTILLA, 'PARCIALES', 'Parcial teórico')).toBe(60);
    expect(resolverPeso(undefined, PLANTILLA, 'PARCIALES', 'Quiz')).toBe(1);
    expect(resolverPeso(undefined, null, 'PARCIALES', 'Quiz')).toBe(1);
  });

  it('un peso explícito inválido cae a 1, no a la plantilla', () => {
    expect(resolverPeso(0, PLANTILLA, 'PARCIALES', 'Parcial teórico')).toBe(1);
  });
});

describe('notasPendientes', () => {
  const nota = (corte: 1 | 2 | 3, tipo: NotaComponente['tipo'], label: string): NotaComponente => ({
    corte,
    tipo,
    score: 4,
    label,
  });

  it('lista lo que falta del corte, por componente, ignorando otros cortes', () => {
    const pendientes = notasPendientes(PLANTILLA, 1, [
      nota(1, 'TRABAJOS', 'Taller 1'),
      nota(1, 'PARCIALES', 'parcial teórico'),
      nota(2, 'PARCIALES', 'Parcial práctico'),
    ]);
    expect(pendientes.TRABAJOS.map(n => n.label)).toEqual(['Taller 2', 'Taller 3']);
    expect(pendientes.PARCIALES.map(n => n.label)).toEqual(['Parcial práctico']);
    expect(pendientes.AUTOEVALUACION.map(n => n.label)).toEqual(['Autoevaluación']);
  });

  it('una nota fuera de la plantilla no descuenta nada de ella', () => {
    const pendientes = notasPendientes(PLANTILLA, 1, [nota(1, 'TRABAJOS', 'Exposición')]);
    expect(pendientes.TRABAJOS).toHaveLength(3);
  });
});
