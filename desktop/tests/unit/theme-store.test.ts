import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APARIENCIA_POR_DEFECTO } from '@/domain/appearance/preferences';

/**
 * La tienda se importa de nuevo en cada prueba: `persist` lee `localStorage`
 * al crearse, así que es la única forma de simular abrir la app con algo guardado.
 */
async function abrirConGuardado(valor: unknown) {
  localStorage.setItem('uts.theme', JSON.stringify(valor));
  vi.resetModules();
  const { useTheme } = await import('@/state/theme.store');
  return useTheme.getState();
}

describe('tienda de tema', () => {
  beforeEach(() => localStorage.clear());

  it('conserva el modo guardado por la versión anterior, que no tenía apariencia', async () => {
    const estado = await abrirConGuardado({ state: { preference: 'dark' }, version: 0 });
    expect(estado.preference).toBe('dark');
    expect(estado.apariencia).toEqual(APARIENCIA_POR_DEFECTO);
  });

  it('sanea una apariencia guardada con valores que no existen', async () => {
    const estado = await abrirConGuardado({
      state: { preference: 'light', apariencia: { tono: 'grafito', vision: 'x' } },
      version: 1,
    });
    expect(estado.apariencia.tono).toBe('grafito');
    expect(estado.apariencia.vision).toBe('normal');
  });

  it('aplicar un tono escribe sus colores y el estilo en <html>', async () => {
    const { setApariencia } = await abrirConGuardado({
      state: { preference: 'light' },
      version: 1,
    });
    setApariencia({ tono: 'oceano', esquinas: 'rectas', vision: 'acromatopsia' });
    const raiz = document.documentElement;
    expect(raiz.style.getPropertyValue('--primary')).toBe('#1842B4');
    expect(raiz.dataset.esquinas).toBe('rectas');
    expect(raiz.dataset.grises).toBe('si');
  });
});
