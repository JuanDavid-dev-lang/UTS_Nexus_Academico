import { describe, expect, it } from 'vitest';
import {
  FACULTADES,
  NIVELES,
  PROGRAMAS,
  programasDe,
  validarAdscripcion,
} from '../src/domains/catalog/uts.js';

/**
 * `validarAdscripcion()` es lo único que comprueba el fondo de una solicitud de
 * registro: que la persona no se adscriba a programas de otra facultad o de un
 * nivel que no marcó. Estaba en `domains/` —puro y sin I/O— pero sin pruebas,
 * que es la mitad del trato: la regla se podía relajar sin que nada se rompiera
 * y el dato acabaría en los reportes institucionales.
 */

const TEC_EMPRESARIAL = 'TEC_GESTION_EMPRESARIAL';

describe('catálogo institucional', () => {
  it('cada programa pertenece a una facultad y un nivel conocidos', () => {
    for (const programa of PROGRAMAS) {
      expect(FACULTADES).toContain(programa.facultad);
      expect(NIVELES).toContain(programa.nivel);
    }
  });

  it('no hay identificadores de programa repetidos', () => {
    const ids = PROGRAMAS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('las dos facultades tienen programas en los dos niveles', () => {
    for (const facultad of FACULTADES) {
      for (const nivel of NIVELES) {
        expect(programasDe(facultad, nivel).length).toBeGreaterThan(0);
      }
    }
  });
});

describe('validarAdscripcion', () => {
  it('acepta una combinación coherente', () => {
    expect(
      validarAdscripcion({
        facultad: 'SOCIOECONOMICAS',
        niveles: ['TECNOLOGICO'],
        programas: [TEC_EMPRESARIAL],
      }),
    ).toEqual([]);
  });

  it('una facultad desconocida corta la revisión ahí mismo', () => {
    // Sin facultad válida no se puede decir nada de los programas: seguir
    // comprobando solo produciría ruido sobre una elección que ya es inválida.
    const errores = validarAdscripcion({
      facultad: 'FACULTAD_DE_MAGIA',
      niveles: [],
      programas: [],
    });
    expect(errores).toHaveLength(1);
    expect(errores[0]?.campo).toBe('facultad');
  });

  it('exige al menos un nivel y al menos un programa', () => {
    const errores = validarAdscripcion({
      facultad: 'SOCIOECONOMICAS',
      niveles: [],
      programas: [],
    });
    expect(errores.map(e => e.campo).sort()).toEqual(['niveles', 'programas']);
  });

  it('rechaza un nivel que no existe', () => {
    const errores = validarAdscripcion({
      facultad: 'SOCIOECONOMICAS',
      niveles: ['POSGRADO'],
      programas: [TEC_EMPRESARIAL],
    });
    expect(errores.some(e => e.campo === 'niveles')).toBe(true);
  });

  it('rechaza un programa que no existe', () => {
    const errores = validarAdscripcion({
      facultad: 'SOCIOECONOMICAS',
      niveles: ['TECNOLOGICO'],
      programas: ['TEC_INVENTADA'],
    });
    expect(errores).toHaveLength(1);
    expect(errores[0]?.campo).toBe('programas');
  });

  it('rechaza un programa de otra facultad', () => {
    // El caso del comentario del módulo: empresariales dictando una ingeniería.
    const ingenieria = PROGRAMAS.find(p => p.facultad === 'NATURALES_INGENIERIAS');
    const errores = validarAdscripcion({
      facultad: 'SOCIOECONOMICAS',
      niveles: [ingenieria!.nivel],
      programas: [ingenieria!.id],
    });
    expect(errores).toHaveLength(1);
    expect(errores[0]?.mensaje).toContain('no pertenece a la facultad');
  });

  it('rechaza un programa de un nivel que no se marcó', () => {
    const errores = validarAdscripcion({
      facultad: 'SOCIOECONOMICAS',
      niveles: ['PROFESIONAL'],
      programas: [TEC_EMPRESARIAL],
    });
    expect(errores).toHaveLength(1);
    expect(errores[0]?.mensaje).toContain('que no marcaste');
  });

  it('acepta programas de los dos niveles cuando los dos están marcados', () => {
    const profesional = programasDe('SOCIOECONOMICAS', 'PROFESIONAL')[0];
    expect(
      validarAdscripcion({
        facultad: 'SOCIOECONOMICAS',
        niveles: ['TECNOLOGICO', 'PROFESIONAL'],
        programas: [TEC_EMPRESARIAL, profesional!.id],
      }),
    ).toEqual([]);
  });

  it('acumula un error por cada programa incorrecto, no solo el primero', () => {
    // El formulario pinta el error de cada campo: quedarse en el primero
    // obligaría a enviar la solicitud tantas veces como fallos hubiera.
    const errores = validarAdscripcion({
      facultad: 'SOCIOECONOMICAS',
      niveles: ['TECNOLOGICO'],
      programas: ['TEC_INVENTADA', 'OTRA_INVENTADA'],
    });
    expect(errores).toHaveLength(2);
  });
});
