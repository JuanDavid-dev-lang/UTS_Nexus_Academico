import { describe, expect, it } from 'vitest';
import {
  decidirVerificacion,
  mismoNombre,
  palabrasDelNombre,
} from '../src/domains/uniplanner/link-verification.js';

/**
 * Verificación automática del enlace de UniPlanner.
 *
 * Un fallo aquí no da error: verifica a quien no debía —y recibe los avisos y
 * marca la asistencia de otra persona— o deja sin verificar a un estudiante
 * real que escribió bien su nombre.
 */
describe('nombre de una persona', () => {
  it('no distingue tildes, mayúsculas, signos ni el orden', () => {
    // La universidad guarda primero los apellidos; la persona escribe primero
    // los nombres.
    expect(mismoNombre('Juan Carlos Pérez Gómez', 'PÉREZ GÓMEZ JUAN CARLOS')).toBe(true);
    expect(mismoNombre('maría  josé  o’neil', 'ONEIL MARIA JOSE')).toBe(true);
    expect(mismoNombre('Ana Gómez-Pinzón', 'ANA GOMEZ PINZON')).toBe(true);
    expect(mismoNombre('Nuñez Ana', 'ANA NUÑEZ')).toBe(true);
  });

  it('exige el nombre completo: ni una palabra de menos ni una de más', () => {
    // Bastar con el nombre de pila y un apellido es bastar con lo que sabe
    // cualquiera del salón.
    expect(mismoNombre('Juan Pérez', 'PÉREZ GÓMEZ JUAN CARLOS')).toBe(false);
    expect(mismoNombre('Juan Carlos Pérez Gómez Rueda', 'PÉREZ GÓMEZ JUAN CARLOS')).toBe(false);
    expect(mismoNombre('Juan Juan', 'JUAN')).toBe(false);
  });

  it('una sola palabra no es un nombre completo', () => {
    expect(mismoNombre('Juan', 'JUAN')).toBe(false);
    expect(palabrasDelNombre('  ')).toEqual([]);
  });
});

describe('decidir la verificación', () => {
  const ana = { nombre: 'GÓMEZ RUEDA ANA MARÍA', instituciones: new Set(['uts']) };

  it('documento, universidad y nombre de un estudiante registrado: verificado', () => {
    expect(decidirVerificacion({ institucion: 'uts', nombre: 'Ana María Gómez Rueda' }, ana)).toBe('verified');
  });

  it('el nombre no coincide, el documento no existe o es de otra universidad: un solo estado', () => {
    // Tres estados distintos le dirían a quien prueba documentos cuáles son de
    // estudiantes de verdad.
    expect(decidirVerificacion({ institucion: 'uts', nombre: 'Ana Gómez' }, ana)).toBe('not_matched');
    expect(decidirVerificacion({ institucion: 'uts', nombre: 'Ana María Gómez Rueda' }, null)).toBe('not_matched');
    expect(decidirVerificacion({ institucion: 'uis', nombre: 'Ana María Gómez Rueda' }, ana)).toBe('not_matched');
  });

  it('un enlace sin nombre no se toca: lo completa la persona desde su app', () => {
    expect(decidirVerificacion({ institucion: 'uts', nombre: '' }, ana)).toBeNull();
  });
});
