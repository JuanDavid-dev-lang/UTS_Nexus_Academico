import { describe, expect, it } from 'vitest';
import { crearCoordinador, type Canal, type ParDeTokens } from '@/core/auth/pestanas';

/** Un BroadcastChannel en memoria: entrega a todos menos a quien envía. */
function bus() {
  const oyentes: Array<{ canal: Canal; fn: (e: { data: unknown }) => void }> = [];
  return function abrir(): Canal {
    const canal: Canal = {
      postMessage(mensaje) {
        for (const o of oyentes) if (o.canal !== canal) o.fn({ data: structuredClone(mensaje) });
      },
      addEventListener(_tipo, fn) {
        oyentes.push({ canal, fn });
      },
    };
    return canal;
  };
}

function pestana(abrir: () => Canal, inicial: ParDeTokens | null) {
  let par = inicial;
  const coordinador = crearCoordinador({
    canal: abrir(),
    leerPar: () => par,
    adoptar: async (nuevo) => {
      par = nuevo;
    },
  });
  return { coordinador, par: () => par, poner: (p: ParDeTokens) => (par = p) };
}

const viejo = { accessToken: 'a1', refreshToken: 'r1' };
const nuevo = { accessToken: 'a2', refreshToken: 'r2' };

describe('pestañas con la misma sesión', () => {
  it('la pestaña duplicada adopta el par que rotó la otra', () => {
    const abrir = bus();
    const a = pestana(abrir, viejo);
    const b = pestana(abrir, viejo);

    a.poner(nuevo);
    a.coordinador.anunciarRotacion('r1', nuevo);

    expect(b.par()).toEqual(nuevo);
  });

  it('una pestaña con otra sesión no adopta nada', () => {
    const abrir = bus();
    const a = pestana(abrir, viejo);
    const otra = { accessToken: 'x', refreshToken: 'otra' };
    const b = pestana(abrir, otra);

    a.poner(nuevo);
    a.coordinador.anunciarRotacion('r1', nuevo);

    expect(b.par()).toEqual(otra);
  });

  it('una pestaña que se perdió el aviso recupera el par preguntando', async () => {
    const abrir = bus();
    const a = pestana(abrir, viejo);
    a.poner(nuevo);
    a.coordinador.anunciarRotacion('r1', nuevo);
    // B se abre (o despierta) después del aviso, con el token viejo.
    const b = pestana(abrir, viejo);

    await expect(b.coordinador.consultar('r1', 50)).resolves.toEqual(nuevo);
  });

  it('sin nadie que haya rotado el token, la consulta no inventa nada', async () => {
    const abrir = bus();
    const b = pestana(abrir, viejo);
    pestana(abrir, viejo);

    await expect(b.coordinador.consultar('r1', 20)).resolves.toBeNull();
  });
});
