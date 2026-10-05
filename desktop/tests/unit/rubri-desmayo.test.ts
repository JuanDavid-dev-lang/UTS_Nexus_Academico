import { describe, expect, it } from 'vitest';
import {
  PAUSA_QUE_REINICIA_MS,
  SIN_TOQUES,
  TOQUES_PARA_DESMAYO,
  faseDe,
  registrarToque,
  type ConteoDeToques,
} from '@/domain/rubri/desmayo';

function tocar(veces: number, cadaMs = 200): ConteoDeToques {
  let conteo = SIN_TOQUES;
  for (let i = 0; i < veces; i++) conteo = registrarToque(conteo, 1_000 + i * cadaMs);
  return conteo;
}

describe('desmayo de Rubri', () => {
  it('se desmaya al decimoquinto toque seguido, no antes', () => {
    expect(faseDe(tocar(TOQUES_PARA_DESMAYO - 1).toques)).toBe('mareado');
    expect(faseDe(tocar(TOQUES_PARA_DESMAYO).toques)).toBe('desmayado');
  });

  it('reacciona por fases antes de desmayarse', () => {
    expect(faseDe(tocar(1).toques)).toBe('normal');
    expect(faseDe(tocar(6).toques)).toBe('molesto');
    expect(faseDe(tocar(11).toques)).toBe('mareado');
  });

  it('una pausa larga entre toques empieza la cuenta de cero', () => {
    const casi = tocar(14);
    const tarde = registrarToque(casi, (casi.ultimo ?? 0) + PAUSA_QUE_REINICIA_MS + 1);
    expect(tarde.toques).toBe(1);
  });

  it('no pasa del tope aunque se siga tocando', () => {
    expect(tocar(40).toques).toBe(TOQUES_PARA_DESMAYO);
  });
});
