import { describe, expect, it } from 'vitest';
import {
  ANTELACIONES_HORAS,
  antelacionesADisparar,
  claveAviso,
  derivarEstado,
  estaVencida,
  textoAntelacion,
} from '../src/domains/activities/activity-status.js';

const AHORA = new Date('2026-05-10T12:00:00.000Z');
const enHoras = (horas: number) => new Date(AHORA.getTime() + horas * 3600_000);

describe('estado derivado de una actividad', () => {
  it('LATE se deriva del reloj, no se guarda', () => {
    // Guardarlo obligaría a un proceso que recorriera todas las actividades
    // cada minuto; cualquier fallo suyo dejaría vencidas presentándose como
    // abiertas, sin forma de notarlo.
    expect(derivarEstado('OPEN', enHoras(-1), AHORA)).toBe('LATE');
    expect(derivarEstado('OPEN', enHoras(1), AHORA)).toBe('OPEN');
  });

  it('cerrar manda sobre el reloj', () => {
    // Cerrarla es precisamente la respuesta a que venciera.
    expect(derivarEstado('CLOSED', enHoras(-100), AHORA)).toBe('CLOSED');
  });

  it('una fecha ilegible no convierte la actividad en vencida', () => {
    expect(derivarEstado('OPEN', 'no es una fecha', AHORA)).toBe('OPEN');
  });

  it('estaVencida coincide con el estado derivado', () => {
    expect(estaVencida('OPEN', enHoras(-1), AHORA)).toBe(true);
    expect(estaVencida('CLOSED', enHoras(-1), AHORA)).toBe(false);
  });
});

describe('antelaciones de aviso', () => {
  const VENTANA = 15;

  it('dispara cada antelación exactamente una vez', () => {
    // Sin la ventana, la actividad de dentro de una hora dispararía los tres
    // avisos a la vez en la misma pasada.
    expect(antelacionesADisparar(enHoras(48), AHORA, VENTANA)).toEqual([48]);
    expect(antelacionesADisparar(enHoras(24), AHORA, VENTANA)).toEqual([24]);
    expect(antelacionesADisparar(enHoras(2), AHORA, VENTANA)).toEqual([2]);
  });

  it('no dispara fuera de ventana', () => {
    expect(antelacionesADisparar(enHoras(30), AHORA, VENTANA)).toEqual([]);
    expect(antelacionesADisparar(enHoras(5), AHORA, VENTANA)).toEqual([]);
  });

  it('una actividad ya vencida no dispara antelaciones', () => {
    // Lo que corresponde entonces es el aviso de «vencida», que es otro hecho
    // y tiene su propia clave.
    expect(antelacionesADisparar(enHoras(-1), AHORA, VENTANA)).toEqual([]);
  });

  it('una ventana grande no duplica: sigue devolviendo la que toca', () => {
    const disparadas = antelacionesADisparar(enHoras(1.9), AHORA, 15);
    expect(disparadas).toEqual([2]);
  });

  it('el catálogo de antelaciones va de mayor a menor', () => {
    expect([...ANTELACIONES_HORAS]).toEqual([48, 24, 2]);
  });
});

describe('clave de deduplicación', () => {
  it('identifica el hecho, no el documento de la notificación', () => {
    // Con la fecha dentro, cada pasada crearía un aviso nuevo del mismo hecho.
    expect(claveAviso('abc', 24)).toBe('activity:abc:24h');
    expect(claveAviso('abc', 'vencida')).toBe('activity:abc:vencida');
    expect(claveAviso('abc', 24)).toBe(claveAviso('abc', 24));
  });
});

describe('texto de la antelación', () => {
  it('habla en días cuando pasa de un día', () => {
    expect(textoAntelacion(24)).toBe('mañana');
    expect(textoAntelacion(48)).toBe('en 2 días');
    expect(textoAntelacion(2)).toBe('en 2 horas');
  });
});
