import { describe, expect, it } from 'vitest';
import {
  ENTIDADES_BLOQUEADAS,
  compararPeriodos,
  esPeriodoValido,
  mensajeDeBloqueo,
  porcentajeDeCierre,
  puedeEscribir,
  transicionValida,
} from '../src/domains/periods/period-lifecycle.js';

/**
 * Estas pruebas fijan qué se puede escribir en cada estado del periodo.
 *
 * No comprueban una función bonita: comprueban que un semestre cerrado no
 * admita una nota más. Ese fallo no se ve —la nota se guarda, la pantalla la
 * muestra— y solo aparece cuando el acta oficial deja de coincidir con la base
 * de datos, meses después y sin forma de saber cuál de las dos tiene razón.
 */
describe('estado del periodo y escrituras', () => {
  it('un periodo sin registrar se considera abierto', () => {
    // La institución lleva semestres funcionando sin este documento; exigirlo
    // retroactivamente dejaría toda la aplicación en solo lectura.
    for (const entidad of ENTIDADES_BLOQUEADAS) {
      expect(puedeEscribir(null, entidad)).toBe(true);
      expect(puedeEscribir(undefined, entidad)).toBe(true);
    }
  });

  it('bloquea notas, asistencia y matrículas al cerrar', () => {
    for (const entidad of ENTIDADES_BLOQUEADAS) {
      expect(puedeEscribir('CLOSED', entidad)).toBe(false);
    }
  });

  it('también las bloquea MIENTRAS se cierra', () => {
    // Sin esto, una nota guardada a mitad de la fotografía quedaría fuera de
    // ella sin que nadie lo notara.
    for (const entidad of ENTIDADES_BLOQUEADAS) {
      expect(puedeEscribir('CLOSING', entidad)).toBe(false);
    }
  });

  it('deja editables horario, actividades y avisos con el periodo cerrado', () => {
    // Decisión documentada: no forman parte del consolidado, así que
    // bloquearlos impediría corregir datos sin proteger nada.
    for (const entidad of ['schedule', 'activity', 'calendar', 'announcement']) {
      expect(puedeEscribir('CLOSED', entidad)).toBe(true);
    }
  });
});

describe('transiciones de estado', () => {
  it('permite el camino normal', () => {
    expect(transicionValida('OPEN', 'CLOSING')).toBe(true);
    expect(transicionValida('CLOSING', 'CLOSED')).toBe(true);
  });

  it('permite abortar un cierre a medias sin pasar por CLOSED', () => {
    // Dejar un periodo atascado en CLOSING lo bloquearía para siempre sin
    // haber producido ninguna fotografía.
    expect(transicionValida('CLOSING', 'OPEN')).toBe(true);
  });

  it('permite reabrir, pero no saltarse el cierre', () => {
    expect(transicionValida('CLOSED', 'OPEN')).toBe(true);
    expect(transicionValida('OPEN', 'CLOSED')).toBe(false);
    expect(transicionValida('CLOSED', 'CLOSING')).toBe(false);
  });
});

describe('progreso del cierre', () => {
  it('sin trabajo contado devuelve 0, no 100', () => {
    // Mostrar «100 %» antes de empezar es la forma más rápida de que alguien
    // dé por bueno un cierre que no ha corrido.
    expect(porcentajeDeCierre({ total: 0, done: 0 })).toBe(0);
    expect(porcentajeDeCierre(null)).toBe(0);
    expect(porcentajeDeCierre(undefined)).toBe(0);
  });

  it('calcula y acota entre 0 y 100', () => {
    expect(porcentajeDeCierre({ total: 200, done: 50 })).toBe(25);
    expect(porcentajeDeCierre({ total: 200, done: 400 })).toBe(100);
    expect(porcentajeDeCierre({ total: 200, done: -5 })).toBe(0);
  });
});

describe('forma del periodo', () => {
  it('acepta los ciclos reales y rechaza los inventados', () => {
    // Un periodo mal escrito no da error: crea un semestre paralelo vacío, y
    // las notas guardadas con él desaparecen de todos los listados.
    expect(esPeriodoValido('2026-1')).toBe(true);
    expect(esPeriodoValido('2026-2')).toBe(true);
    expect(esPeriodoValido('2026-9')).toBe(false);
    expect(esPeriodoValido('26-1')).toBe(false);
    expect(esPeriodoValido('2026')).toBe(false);
    expect(esPeriodoValido('')).toBe(false);
  });

  it('ordena cronológicamente y no alfabéticamente', () => {
    expect(compararPeriodos('2025-2', '2026-1')).toBeLessThan(0);
    expect(compararPeriodos('2026-2', '2026-1')).toBeGreaterThan(0);
    expect(compararPeriodos('2026-1', '2026-1')).toBe(0);
  });
});

describe('mensaje de bloqueo', () => {
  it('distingue cerrándose de cerrado y nombra el periodo', () => {
    expect(mensajeDeBloqueo('2026-1', 'CLOSING')).toContain('cerrándose');
    expect(mensajeDeBloqueo('2026-1', 'CLOSED')).toContain('reabrirlo');
    expect(mensajeDeBloqueo('2026-1', 'CLOSED')).toContain('2026-1');
  });
});
