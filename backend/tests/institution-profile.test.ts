import { describe, expect, it } from 'vitest';
import { RUBRICA } from '../src/domains/grading/grading.service.js';
import {
  PERFILES_INICIALES,
  buscarCoincidencias,
  clavesDePerfil,
  configuracionDesdeRubrica,
  generarInstitutionId,
  limpiarAliases,
  normalizarNombre,
  sugerirInstitutionId,
  validarConfiguracionAcademica,
  validarPerfil,
  type ConfiguracionAcademica,
} from '../src/domains/institutions/institution-profile.js';

const perfiles = [
  { institutionId: 'uts', nombre: 'Unidades Tecnológicas de Santander', sigla: 'UTS', aliases: [] },
  { institutionId: 'udes', nombre: 'Universidad de Santander', sigla: 'UDES', aliases: ['U. de Santander'] },
  { institutionId: 'uis', nombre: 'Universidad Industrial de Santander', sigla: 'UIS', aliases: [] },
];

describe('normalizarNombre', () => {
  it('iguala mayúsculas, tildes, puntuación y espacios', () => {
    expect(normalizarNombre('  Universidad   de SANTANDER. ')).toBe('universidad de santander');
    expect(normalizarNombre('Unidades Tecnológicas')).toBe(normalizarNombre('UNIDADES TECNOLOGICAS'));
  });

  it('reduce la eñe a ene: «Ñame» y «Name» son la misma clave', () => {
    expect(normalizarNombre('Universidad del Ñame')).toBe('universidad del name');
  });
});

describe('clavesDePerfil y alias', () => {
  it('reúne nombre, sigla y alias sin repetidos', () => {
    expect(clavesDePerfil({ nombre: 'UDES', sigla: 'udes', aliases: ['Udes', 'Universidad de Santander'] }))
      .toEqual(['udes', 'universidad de santander']);
  });

  it('limpia alias vacíos y repetidos conservando el texto original', () => {
    expect(limpiarAliases(['  U. de  Santander ', '', 'u de santander', 'UDES'])).toEqual([
      'U. de Santander',
      'UDES',
    ]);
  });
});

describe('validarPerfil', () => {
  it('acepta un perfil correcto', () => {
    expect(validarPerfil({ institutionId: 'unab', nombre: 'Universidad Autónoma de Bucaramanga', sigla: 'UNAB' })).toEqual([]);
  });

  it('rechaza nombre vacío, sigla inválida e identificador con mayúsculas', () => {
    const errores = validarPerfil({ institutionId: 'Mi Uni', nombre: '  ', sigla: 'U B!' });
    expect(errores.map(e => e.campo)).toEqual(['nombre', 'sigla', 'institutionId']);
  });

  it('no deja que un alias repita el nombre', () => {
    const errores = validarPerfil({
      institutionId: 'udes',
      nombre: 'Universidad de Santander',
      sigla: 'UDES',
      aliases: ['UNIVERSIDAD DE SANTANDER'],
    });
    expect(errores.some(e => e.campo === 'aliases')).toBe(true);
  });

  it('sugiere el identificador desde la sigla', () => {
    expect(sugerirInstitutionId('UNAB')).toBe('unab');
    expect(sugerirInstitutionId('', 'Universidad Pontificia Bolivariana')).toBe('pontificia-bolivariana');
  });

  it('genera el identificador automáticamente y evita los que ya existen', () => {
    expect(generarInstitutionId('UNAB', 'Universidad Autónoma', [])).toBe('unab');
    expect(generarInstitutionId('UNAB', 'Universidad Autónoma', ['unab'])).toBe('unab-2');
    expect(generarInstitutionId('UNAB', 'Universidad Autónoma', ['unab', 'unab-2'])).toBe('unab-3');
    expect(generarInstitutionId('', '', [])).toBe('institucion');
    expect(validarPerfil({ institutionId: generarInstitutionId('Ü.N.A.B', 'x', []), nombre: 'Universidad', sigla: 'UNAB' })).toEqual([]);
  });
});

describe('buscarCoincidencias', () => {
  it('detecta la misma institución con otras mayúsculas y sin tildes', () => {
    const resultado = buscarCoincidencias({ nombre: 'unidades tecnologicas de santander' }, perfiles);
    expect(resultado.map(r => [r.perfil.institutionId, r.tipo])).toEqual([['uts', 'exacta']]);
  });

  it('detecta un alias registrado', () => {
    const resultado = buscarCoincidencias({ nombre: 'U. de Santander', sigla: 'XX' }, perfiles);
    expect(resultado.map(r => [r.perfil.institutionId, r.tipo])).toEqual([['udes', 'exacta']]);
  });

  it('detecta la sigla aunque el nombre sea otro', () => {
    const resultado = buscarCoincidencias({ nombre: 'Uni Santander', sigla: 'udes' }, perfiles);
    expect(resultado.some(r => r.perfil.institutionId === 'udes' && r.tipo === 'exacta')).toBe(true);
  });

  it('avisa de un parecido sin bloquear', () => {
    const resultado = buscarCoincidencias({ nombre: 'Universidad de Santander UDES', sigla: 'USA' }, perfiles);
    const udes = resultado.find(r => r.perfil.institutionId === 'udes');
    expect(udes?.tipo).toBe('posible');
  });

  it('no coincide consigo mismo al editar', () => {
    const resultado = buscarCoincidencias({ nombre: 'Universidad de Santander', sigla: 'UDES' }, perfiles, 'udes');
    expect(resultado.map(r => r.perfil.institutionId)).not.toContain('udes');
  });

  it('no relaciona instituciones distintas', () => {
    const resultado = buscarCoincidencias({ nombre: 'Universidad Pontificia Bolivariana', sigla: 'UPB' }, perfiles);
    expect(resultado).toEqual([]);
  });
});

describe('validarConfiguracionAcademica', () => {
  const valida: ConfiguracionAcademica = configuracionDesdeRubrica();

  it('acepta la configuración de las UTS', () => {
    expect(validarConfiguracionAcademica(valida)).toEqual([]);
  });

  it('rechaza pesos que no suman 100 %', () => {
    const config = { ...valida, cortes: valida.cortes.map(c => ({ ...c, peso: 0.5 })) };
    expect(validarConfiguracionAcademica(config).map(e => e.campo)).toContain('cortes');
  });

  it('rechaza un peso cero o negativo', () => {
    const config = {
      ...valida,
      componentes: [
        { id: 'A', nombre: 'A', peso: 1 },
        { id: 'B', nombre: 'B', peso: 0 },
      ],
    };
    expect(validarConfiguracionAcademica(config).map(e => e.campo)).toContain('componentes');
  });

  it('rechaza cortes con numeración salteada y componentes repetidos', () => {
    const config: ConfiguracionAcademica = {
      ...valida,
      cortes: [
        { numero: 1, nombre: 'Corte 1', peso: 0.5 },
        { numero: 3, nombre: 'Corte 3', peso: 0.5 },
      ],
      componentes: [
        { id: 'A', nombre: 'A', peso: 0.5 },
        { id: 'A', nombre: 'A bis', peso: 0.5 },
      ],
    };
    const campos = validarConfiguracionAcademica(config).map(e => e.campo);
    expect(campos).toContain('cortes');
    expect(campos).toContain('componentes');
  });

  it('rechaza una escala incoherente', () => {
    expect(validarConfiguracionAcademica({ ...valida, notaAprobacion: 6 }).map(e => e.campo)).toContain('escala');
    expect(validarConfiguracionAcademica({ ...valida, notaMinima: 5 }).map(e => e.campo)).toContain('escala');
  });

  it('exige al menos un corte y un componente', () => {
    const campos = validarConfiguracionAcademica({ ...valida, cortes: [], componentes: [] }).map(e => e.campo);
    expect(campos).toEqual(expect.arrayContaining(['cortes', 'componentes']));
  });
});

describe('perfiles iniciales', () => {
  it('la configuración de las UTS es la del motor de calificación, no una copia', () => {
    const uts = PERFILES_INICIALES.find(p => p.institutionId === 'uts');
    expect(uts?.configuracionAcademica?.cortes.map(c => c.peso)).toEqual([
      RUBRICA.CORTES[1],
      RUBRICA.CORTES[2],
      RUBRICA.CORTES[3],
    ]);
    expect(uts?.configuracionAcademica?.componentes.map(c => [c.id, c.peso])).toEqual([
      ['TRABAJOS', RUBRICA.COMPONENTES.TRABAJOS],
      ['PARCIALES', RUBRICA.COMPONENTES.PARCIALES],
      ['AUTOEVALUACION', RUBRICA.COMPONENTES.AUTOEVALUACION],
    ]);
    expect(uts?.configuracionAcademica?.notaAprobacion).toBe(RUBRICA.NOTA_APROBACION);
  });

  it('UIS y UDES nacen sin ponderados: los fija un administrador', () => {
    for (const id of ['uis', 'udes']) {
      expect(PERFILES_INICIALES.find(p => p.institutionId === id)?.configuracionAcademica).toBeNull();
    }
  });

  it('todos pasan la validación y no coinciden entre sí', () => {
    for (const perfil of PERFILES_INICIALES) {
      expect(validarPerfil(perfil), perfil.institutionId).toEqual([]);
      const otros = PERFILES_INICIALES.filter(p => p.institutionId !== perfil.institutionId);
      expect(buscarCoincidencias(perfil, otros).filter(c => c.tipo === 'exacta')).toEqual([]);
    }
  });
});
