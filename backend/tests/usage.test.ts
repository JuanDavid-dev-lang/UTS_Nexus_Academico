import { describe, expect, it } from 'vitest';
import {
  AcumuladorDeUso,
  activosRecientes,
  clienteDePeticion,
  diasDelRango,
  franjaDelDia,
  ordenarRanking,
  rellenarDias,
  validarRango,
} from '../src/domains/usage/usage.js';
import { AVISO_USO_VERSION, avisoUsoPendiente } from '../src/domains/usage/aviso-uso.js';

const BOGOTA = -300;

describe('clienteDePeticion', () => {
  it('la web la decide el canal del token, no las cabeceras', () => {
    expect(clienteDePeticion({ canal: 'web', userAgent: 'Dart/3.5 (dart:io)' })).toBe('web');
  });
  it('el móvil llega sin Origin y con el User-Agent de dart:io', () => {
    expect(clienteDePeticion({ canal: 'app', userAgent: 'Dart/3.5 (dart:io)' })).toBe('movil');
  });
  it('el escritorio llega con el Origin de Tauri', () => {
    expect(clienteDePeticion({ canal: 'app', origen: 'http://tauri.localhost', userAgent: 'Mozilla/5.0' })).toBe(
      'escritorio',
    );
  });
  it('sin Origin ni Dart cuenta como móvil', () => {
    expect(clienteDePeticion({ canal: 'app' })).toBe('movil');
  });
});

describe('franjaDelDia', () => {
  it('parte el día del campus en franjas de 5 minutos', () => {
    // 05:00 UTC = 00:00 en Bogotá.
    expect(franjaDelDia(new Date('2026-11-25T05:00:00Z'), BOGOTA)).toBe(0);
    expect(franjaDelDia(new Date('2026-11-25T05:04:59Z'), BOGOTA)).toBe(0);
    expect(franjaDelDia(new Date('2026-11-25T05:05:00Z'), BOGOTA)).toBe(1);
    // 04:59 UTC = 23:59 del día anterior en Bogotá: última franja.
    expect(franjaDelDia(new Date('2026-11-25T04:59:00Z'), BOGOTA)).toBe(287);
  });
});

describe('AcumuladorDeUso', () => {
  it('cuenta peticiones y franjas sin repetir el mismo rato', () => {
    const acc = new AcumuladorDeUso(BOGOTA);
    const base = Date.parse('2026-11-25T15:00:00Z');
    acc.registrar({ userId: 'u1', rol: 'PROFESSOR', cliente: 'escritorio', instante: new Date(base) });
    acc.registrar({ userId: 'u1', rol: 'PROFESSOR', cliente: 'movil', instante: new Date(base + 60_000) });
    acc.registrar({ userId: 'u1', rol: 'PROFESSOR', cliente: 'escritorio', instante: new Date(base + 6 * 60_000) });
    expect(acc.tamano).toBe(1);

    const [entrada] = acc.vaciar();
    expect(entrada?.dia).toBe('2026-11-25');
    expect(entrada?.peticiones).toBe(3);
    expect(entrada?.porCliente).toEqual({ escritorio: 2, web: 0, movil: 1 });
    expect(entrada?.franjas).toHaveLength(2);
    expect(acc.tamano).toBe(0);
  });

  it('separa los días del campus, no los de UTC', () => {
    const acc = new AcumuladorDeUso(BOGOTA);
    // 03:00 UTC del 26 son las 22:00 del 25 en Bogotá.
    acc.registrar({ userId: 'u1', rol: 'ADMIN', cliente: 'web', instante: new Date('2026-11-26T03:00:00Z') });
    acc.registrar({ userId: 'u1', rol: 'ADMIN', cliente: 'web', instante: new Date('2026-11-26T06:00:00Z') });
    expect(acc.vaciar().map((e) => e.dia).sort()).toEqual(['2026-11-25', '2026-11-26']);
  });

  it('lo que no se pudo volcar vuelve y se suma a lo nuevo', () => {
    const acc = new AcumuladorDeUso(BOGOTA);
    const t = new Date('2026-11-25T15:00:00Z');
    acc.registrar({ userId: 'u1', rol: 'ADMIN', cliente: 'web', instante: t });
    const fallidas = acc.vaciar();
    acc.registrar({ userId: 'u1', rol: 'ADMIN', cliente: 'web', instante: t });
    acc.devolver(fallidas);
    const [e] = acc.vaciar();
    expect(e?.peticiones).toBe(2);
    expect(e?.franjas).toHaveLength(1);
  });
});

describe('lectura del resumen', () => {
  it('rellena con cero los días sin actividad', () => {
    expect(rellenarDias([{ dia: '2026-11-02', usuarios: 3 }], '2026-11-01', '2026-11-03')).toEqual([
      { dia: '2026-11-01', usuarios: 0 },
      { dia: '2026-11-02', usuarios: 3 },
      { dia: '2026-11-03', usuarios: 0 },
    ]);
  });

  it('activos recientes: hoy, los 7 y los 30 días que terminan hoy', () => {
    const r = activosRecientes(['2026-11-25', '2026-11-19', '2026-11-18', '2026-10-27', '2026-10-26'], '2026-11-25');
    expect(r).toEqual({ hoy: 1, semana: 2, mes: 4 });
  });

  it('ordena por minutos, luego días, luego peticiones', () => {
    const fecha = new Date();
    const ranking = ordenarRanking([
      { userId: 'a', diasActivos: 5, franjas: 10, peticiones: 900, ultimaActividad: fecha },
      { userId: 'b', diasActivos: 2, franjas: 30, peticiones: 50, ultimaActividad: fecha },
      { userId: 'c', diasActivos: 6, franjas: 10, peticiones: 10, ultimaActividad: fecha },
    ]);
    expect(ranking.map((f) => f.userId)).toEqual(['b', 'c', 'a']);
    expect(ranking[0]).toMatchObject({ posicion: 1, minutos: 150 });
  });

  it('valida el rango', () => {
    expect(validarRango('2026-11-01', '2026-11-30')).toBeNull();
    expect(validarRango('2026-02-31', '2026-03-01')).not.toBeNull();
    expect(validarRango('2026-12-01', '2026-11-01')).not.toBeNull();
    expect(validarRango('2024-01-01', '2026-11-01')).not.toBeNull();
    expect(diasDelRango('2026-11-30', '2026-12-01')).toEqual(['2026-11-30', '2026-12-01']);
  });
});

describe('avisoUsoPendiente', () => {
  it('pendiente si nunca lo vio o vio una versión anterior', () => {
    expect(avisoUsoPendiente(null, null)).toBe(true);
    expect(avisoUsoPendiente(new Date(), AVISO_USO_VERSION - 1)).toBe(true);
    expect(avisoUsoPendiente(new Date(), AVISO_USO_VERSION)).toBe(false);
  });
});
