import { describe, expect, it } from 'vitest';
import { DEFAULT_SERVER_URL, resolverServidorInicial } from '@/core/config/env';

/**
 * Estas pruebas existen por un fallo real que ninguna comprobación de tipos ni
 * de compilación podía ver: la app se instalaba con el servidor correcto de
 * fábrica y aun así no conectaba, porque el valor grabado por una versión
 * anterior ganaba siempre.
 */
describe('resolverServidorInicial', () => {
  it('sin nada guardado usa el servidor de fábrica', () => {
    expect(resolverServidorInicial(null)).toEqual({
      serverUrl: DEFAULT_SERVER_URL,
      migrado: false,
    });
  });

  it('descarta el localhost que grabaron las versiones anteriores', () => {
    // Este es el caso que rompía: instalar la versión nueva no servía de nada
    // porque el residuo de la vieja seguía mandando.
    const resultado = resolverServidorInicial('http://127.0.0.1:4000');

    expect(resultado.serverUrl).toBe(DEFAULT_SERVER_URL);
    expect(resultado.migrado).toBe(true);
  });

  it('descarta también la variante con localhost', () => {
    expect(resolverServidorInicial('http://localhost:4000').serverUrl).toBe(DEFAULT_SERVER_URL);
  });

  it('respeta un servidor que alguien eligió a mano', () => {
    // Una institución con su propio despliegue no puede ver cómo la aplicación
    // le devuelve la dirección al de por defecto en cada actualización.
    const propio = 'https://nexus.miuniversidad.edu.co';
    expect(resolverServidorInicial(propio)).toEqual({ serverUrl: propio, migrado: false });
  });

  it('no marca migración cuando lo guardado ya es el de fábrica', () => {
    expect(resolverServidorInicial(DEFAULT_SERVER_URL)).toEqual({
      serverUrl: DEFAULT_SERVER_URL,
      migrado: false,
    });
  });

  it('normaliza lo guardado antes de compararlo', () => {
    // Una barra final no debería impedir reconocer el residuo.
    expect(resolverServidorInicial('http://127.0.0.1:4000/').migrado).toBe(true);
  });
});
