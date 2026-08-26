import { describe, expect, it } from 'vitest';
import {
  AREAS,
  PROGRAMAS,
  areaDePrograma,
  areasDeProgramas,
  buscarArea,
  buscarPrograma,
  programasDeAreas,
} from '../src/domains/catalog/uts.js';

/**
 * Un área es una carrera entera: el ciclo tecnológico y el profesional de la
 * misma línea. Lo que estas pruebas protegen no es la lista, es que la lista
 * **cubra el catálogo**: un programa que no pertenezca a ninguna área no da
 * ningún error, simplemente se convierte en una carrera que nadie puede
 * coordinar, y eso se descubre el día que alguien pregunta por qué sus
 * materias no le aparecen a nadie.
 */
describe('áreas académicas', () => {
  it('cubren todos los programas del catálogo', () => {
    const cubiertos = new Set(AREAS.flatMap(area => area.programas));
    const huerfanos = PROGRAMAS.filter(programa => !cubiertos.has(programa.id));
    expect(huerfanos.map(p => p.id)).toEqual([]);
  });

  it('no repiten un programa en dos áreas', () => {
    const todos = AREAS.flatMap(area => area.programas);
    expect(todos.length).toBe(new Set(todos).size);
  });

  it('solo nombran programas que existen', () => {
    for (const area of AREAS) {
      for (const programa of area.programas) {
        expect(buscarPrograma(programa), `${area.id} → ${programa}`).toBeDefined();
      }
    }
  });

  it('agrupan el tecnológico con su profesional, no dos carreras distintas', () => {
    for (const area of AREAS) {
      const facultades = new Set(area.programas.map(id => buscarPrograma(id)!.facultad));
      expect([...facultades], area.id).toEqual([area.facultad]);
    }
  });

  it('la cadena de sistemas es una sola carrera', () => {
    const area = areaDePrograma('ING_SISTEMAS');
    expect(area?.id).toBe('AREA_SISTEMAS');
    expect(area?.programas).toContain('TEC_DESARROLLO_SISTEMAS');
  });
});

describe('programasDeAreas', () => {
  it('expande a los programas que se guardan', () => {
    expect(programasDeAreas(['AREA_SISTEMAS']).sort()).toEqual(
      ['ING_SISTEMAS', 'TEC_DESARROLLO_SISTEMAS'].sort(),
    );
  });

  it('no repite lo que ya estaba', () => {
    const ids = programasDeAreas(['AREA_SISTEMAS', 'AREA_SISTEMAS']);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it('ignora un área desconocida en vez de reventar', () => {
    // Un id viejo guardado en un cliente no puede tumbar la pantalla; quien
    // valida la entrada es la ruta, que además puede decir cuál es el id malo.
    expect(programasDeAreas(['AREA_QUE_NO_EXISTE'])).toEqual([]);
    expect(buscarArea('AREA_QUE_NO_EXISTE')).toBeUndefined();
  });
});

describe('areasDeProgramas', () => {
  it('marca completa el área con sus dos ciclos', () => {
    const [entrada] = areasDeProgramas(['TEC_DESARROLLO_SISTEMAS', 'ING_SISTEMAS']);
    expect(entrada.area.id).toBe('AREA_SISTEMAS');
    expect(entrada.completa).toBe(true);
  });

  it('distingue media carrera de la carrera entera', () => {
    // Es la diferencia que se pierde sin este dato: marcar solo el tecnológico
    // se vería igual que coordinar la carrera completa, y la mitad profesional
    // desaparecería de los listados sin que nada lo dijera.
    const [entrada] = areasDeProgramas(['TEC_DESARROLLO_SISTEMAS']);
    expect(entrada.completa).toBe(false);
    expect(entrada.elegidos).toEqual(['TEC_DESARROLLO_SISTEMAS']);
  });

  it('omite las áreas sin nada elegido', () => {
    expect(areasDeProgramas([])).toEqual([]);
    expect(areasDeProgramas(['ING_CIVIL']).map(e => e.area.id)).toEqual(['AREA_CIVIL']);
  });
});
