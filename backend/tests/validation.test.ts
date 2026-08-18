/**
 * Campos acotados y paginación: funciones puras, sin base de datos.
 *
 * Fija lo que se rompió una vez y no debe volver a romperse en silencio: que
 * ningún texto entre sin techo, y que un listado que trunca lo **diga**. La
 * versión anterior devolvía mil registros de tres mil sin ninguna señal, y la
 * interfaz mostraba "1000" como si fuera el total.
 */
import { describe, expect, it } from 'vitest';
import {
  TOPE_LOTE,
  codigo,
  correo,
  linea,
  nombre,
  nota,
  TOPE_PAGINA,
  paginacion,
  paginacionCon,
  parrafo,
  respuestaPaginada,
  saltoYTope,
  url,
} from '../src/shared/validation.js';

describe('campos acotados', () => {
  it('rechaza un texto por encima del tope en vez de guardarlo', () => {
    expect(() => nombre.parse('a'.repeat(121))).toThrow();
    expect(() => linea.parse('a'.repeat(201))).toThrow();
    expect(() => nota.parse('a'.repeat(501))).toThrow();
    expect(() => parrafo.parse('a'.repeat(4001))).toThrow();
    expect(() => codigo.parse('9'.repeat(41))).toThrow();
  });

  it('acepta el valor justo en el tope: el límite es inclusivo', () => {
    expect(nombre.parse('a'.repeat(120))).toHaveLength(120);
    expect(parrafo.parse('a'.repeat(4000))).toHaveLength(4000);
  });

  it('normaliza el correo a minúsculas y sin espacios', () => {
    expect(correo.parse('  Docente@UTS.edu.co ')).toBe('docente@uts.edu.co');
  });

  it('rechaza un correo que pasa del máximo real de una dirección', () => {
    expect(() => correo.parse(`${'a'.repeat(250)}@uts.edu.co`)).toThrow();
  });

  it('exige que una URL lo sea de verdad', () => {
    expect(() => url.parse('no-es-una-url')).toThrow();
    expect(url.parse('https://uts.edu.co/foto.png')).toBe('https://uts.edu.co/foto.png');
  });

  it('recorta los espacios antes de medir, no después', () => {
    // Sin `.trim()` previo, 120 caracteres más un espacio sobrarían del tope
    // por culpa del espacio, que es justo lo que un formulario suele dejar.
    expect(nombre.parse(`  ${'a'.repeat(120)}  `)).toHaveLength(120);
  });
});

describe('paginación', () => {
  it('trae valores por defecto cuando no se pide nada', () => {
    expect(paginacion.parse({})).toEqual({ page: 1, limit: 100 });
  });

  it('convierte los parámetros de la query, que llegan como texto', () => {
    expect(paginacion.parse({ page: '3', limit: '25' })).toEqual({ page: 3, limit: 25 });
  });

  it('no deja pedir una página entera de la base de una vez', () => {
    expect(() => paginacion.parse({ limit: String(TOPE_PAGINA + 1) })).toThrow();
    expect(() => paginacion.parse({ page: '0' })).toThrow();
  });

  it('cada listado conserva por defecto el tope que ya devolvía', () => {
    // Lo que protege a los clientes ya publicados: un móvil sin actualizar
    // sigue pidiendo la lista de siempre y sigue recibiéndola entera. Bajar
    // este defecto le daría la décima parte del salón sin ningún error.
    expect(paginacionCon(1000).parse({}).limit).toBe(1000);
    expect(paginacionCon(2000).parse({}).limit).toBe(2000);
  });

  it('el cliente puede pedir menos de lo que trae por defecto', () => {
    expect(paginacionCon(1000).parse({ limit: '20' }).limit).toBe(20);
  });

  it('el techo absoluto manda sobre el defecto del endpoint', () => {
    expect(() => paginacionCon(2000).parse({ limit: '99999' })).toThrow();
  });

  it('traduce la página a salto y tope', () => {
    expect(saltoYTope({ page: 1, limit: 50 })).toEqual({ skip: 0, limit: 50 });
    expect(saltoYTope({ page: 3, limit: 50 })).toEqual({ skip: 100, limit: 50 });
  });
});

describe('respuesta paginada', () => {
  const pagina = { page: 1, limit: 100 };

  it('deja `items` en la raíz para no romper a los clientes existentes', () => {
    const respuesta = respuestaPaginada([{ id: 'a' }], 1, pagina);
    expect(respuesta.items).toEqual([{ id: 'a' }]);
    expect(respuesta.ok).toBe(true);
  });

  it('avisa de que hay más cuando el total pasa de la página', () => {
    expect(respuestaPaginada([], 250, pagina).hasMore).toBe(true);
    expect(respuestaPaginada([], 100, pagina).hasMore).toBe(false);
    expect(respuestaPaginada([], 0, pagina).hasMore).toBe(false);
  });

  it('en la última página no dice que haya más', () => {
    expect(respuestaPaginada([], 250, { page: 3, limit: 100 }).hasMore).toBe(false);
  });

  it('el total es el del filtro completo, no el de la página', () => {
    const respuesta = respuestaPaginada([1, 2, 3], 4321, pagina);
    expect(respuesta.total).toBe(4321);
    expect(respuesta.items).toHaveLength(3);
  });
});

describe('tope de lote', () => {
  it('es holgado para un grupo real y acotado para una petición', () => {
    expect(TOPE_LOTE).toBe(500);
  });
});
