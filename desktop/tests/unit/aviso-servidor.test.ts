import { describe, expect, it } from 'vitest';
import {
  avisoDeFalloDelServidor,
  avisoDeLectura,
  esFalloDelServidor,
  etiquetaSinServidor,
  mensajeDeFalloDelServidor,
} from '@/domain/offline/aviso-servidor';

describe('esFalloDelServidor', () => {
  it('cuenta sin respuesta, tiempo agotado y 5xx', () => {
    expect(esFalloDelServidor({ kind: 'network' })).toBe(true);
    expect(esFalloDelServidor({ kind: 'timeout' })).toBe(true);
    expect(esFalloDelServidor({ kind: 'server', status: 500 })).toBe(true);
    expect(esFalloDelServidor({ kind: 'unknown', status: 502 })).toBe(true);
    expect(esFalloDelServidor({ kind: 'unknown', status: 504 })).toBe(true);
  });

  it('no oculta un rechazo del servidor ni una sesión caducada', () => {
    expect(esFalloDelServidor({ kind: 'validation', status: 400 })).toBe(false);
    expect(esFalloDelServidor({ kind: 'conflict', status: 409 })).toBe(false);
    expect(esFalloDelServidor({ kind: 'forbidden', status: 403 })).toBe(false);
    expect(esFalloDelServidor({ kind: 'unauthorized', status: 401 })).toBe(false);
    expect(esFalloDelServidor({ kind: 'rate_limited', status: 429 })).toBe(false);
  });
});

describe('avisoDeFalloDelServidor', () => {
  it('en el escritorio dice el texto pedido, con los cambios en local', () => {
    expect(mensajeDeFalloDelServidor('equipo')).toBe(
      'Hubo un problema en el servidor. Tus cambios quedan en local y se subirán cuando se restablezcan los servicios.',
    );
  });

  it('en la web no promete el disco: la cola vive en la pestaña', () => {
    const aviso = avisoDeFalloDelServidor('pestana');
    expect(aviso.titulo).toBe('Hubo un problema en el servidor');
    expect(aviso.detalle).toContain('esta pestaña');
    expect(aviso.detalle).not.toContain('local');
    expect(etiquetaSinServidor('pestana')).toContain('esta pestaña');
    expect(etiquetaSinServidor('equipo')).toContain('local');
  });

  it('nunca dice que el servidor se cayó', () => {
    for (const texto of [
      mensajeDeFalloDelServidor('equipo'),
      mensajeDeFalloDelServidor('pestana'),
      avisoDeLectura(true).detalle,
      avisoDeLectura(false).detalle,
    ]) {
      expect(texto).not.toMatch(/cay[oó]|ca[ií]do|apagado|encendido/i);
    }
  });
});

describe('avisoDeLectura', () => {
  it('con datos en pantalla enseña lo guardado en vez de un error', () => {
    expect(avisoDeLectura(true).titulo).toBe('Mostrando lo último guardado');
  });

  it('sin datos dice que se cargará al volver los servicios', () => {
    expect(avisoDeLectura(false).titulo).toBe('Hubo un problema en el servidor');
    expect(avisoDeLectura(false).detalle).toContain('restablezcan los servicios');
  });
});
