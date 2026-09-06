import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { retrasoEscalonado, useTandaNueva } from '@/shared/hooks/use-tanda-nueva';

/**
 * La marca de «esto acaba de llegar» tiene que **limpiarse sola**. Es la mitad
 * que se olvida, y la que se nota: en una tabla virtualizada una fila que sale
 * de pantalla y vuelve se remonta, así que sin limpiar la marca cada viaje del
 * cursor volvería a animar las mismas filas.
 */
describe('useTandaNueva', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('no marca nada en la primera carga', () => {
    // Lo que ya estaba al montar no «llegó»: animarlo entero al abrir la
    // pantalla es un efecto distinto y no es el que se quiere aquí.
    const { result } = renderHook(({ n }) => useTandaNueva(n), {
      initialProps: { n: 50 },
    });
    expect(result.current).toBeNull();
  });

  it('marca desde donde empieza la tanda nueva', () => {
    const { result, rerender } = renderHook(({ n }) => useTandaNueva(n), {
      initialProps: { n: 50 },
    });
    rerender({ n: 100 });
    expect(result.current).toBe(50);
  });

  it('limpia la marca pasada la animación', () => {
    const { result, rerender } = renderHook(({ n }) => useTandaNueva(n, 500), {
      initialProps: { n: 50 },
    });
    rerender({ n: 100 });
    expect(result.current).toBe(50);

    act(() => void vi.advanceTimersByTime(600));
    expect(result.current).toBeNull();
  });

  it('una lista que encoge no marca nada', () => {
    // Filtrar deja menos elementos, y los que quedan no son nuevos: son los que
    // sobrevivieron.
    const { result, rerender } = renderHook(({ n }) => useTandaNueva(n), {
      initialProps: { n: 100 },
    });
    rerender({ n: 12 });
    expect(result.current).toBeNull();
  });

  it('dos tandas seguidas marcan desde el final de la anterior', () => {
    const { result, rerender } = renderHook(({ n }) => useTandaNueva(n, 500), {
      initialProps: { n: 50 },
    });
    rerender({ n: 100 });
    expect(result.current).toBe(50);

    act(() => void vi.advanceTimersByTime(600));
    rerender({ n: 150 });
    expect(result.current).toBe(100);
  });
});

describe('retrasoEscalonado', () => {
  it('no retrasa lo que no es nuevo', () => {
    expect(retrasoEscalonado(10, null)).toBeUndefined();
    expect(retrasoEscalonado(10, 50)).toBeUndefined();
  });

  it('escalona dentro de la tanda', () => {
    expect(retrasoEscalonado(50, 50)).toBe('0ms');
    expect(retrasoEscalonado(53, 50)).toBe('66ms');
  });

  it('tiene tope: con una tanda grande no se hace eterno', () => {
    // Sin tope, cincuenta elementos nuevos dejarían el último entrando más de
    // un segundo después del primero.
    expect(retrasoEscalonado(100, 50)).toBe('264ms');
    expect(retrasoEscalonado(500, 50)).toBe('264ms');
  });
});
