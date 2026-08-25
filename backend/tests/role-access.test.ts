import { describe, expect, it } from 'vitest';
import {
  autorizadoPorRol,
  esLectura,
  puedeEscribir,
  rolesEfectivos,
} from '../src/domains/scope/role-access.js';

/**
 * Estas pruebas fijan la única diferencia entre coordinación y secretaría.
 *
 * No es una diferencia de pantallas: es que una escribe y la otra no. Si se
 * implementara repitiendo roles en cada `requireRole`, el fallo típico sería
 * una ruta de escritura que también aceptara a secretaría, y ese fallo no da
 * ningún error — deja pasar la petición y guarda el dato.
 */
describe('secretaría lee lo mismo que coordinación', () => {
  it('cuenta como coordinación en una consulta', () => {
    expect(autorizadoPorRol('SECRETARY', 'GET', ['ADMIN', 'COORDINATOR'])).toBe(true);
    expect(rolesEfectivos('SECRETARY', 'GET')).toContain('COORDINATOR');
  });

  it('no hereda lo que coordinación tampoco tiene', () => {
    // La auditoría es solo ADMIN: secretaría no entra por la puerta de al lado.
    expect(autorizadoPorRol('SECRETARY', 'GET', ['ADMIN'])).toBe(false);
  });

  it('deja de contar como coordinación en cuanto la petición escribe', () => {
    expect(autorizadoPorRol('SECRETARY', 'POST', ['ADMIN', 'COORDINATOR'])).toBe(false);
    expect(autorizadoPorRol('SECRETARY', 'DELETE', ['ADMIN', 'COORDINATOR'])).toBe(false);
    expect(rolesEfectivos('SECRETARY', 'PATCH')).toEqual(['SECRETARY']);
  });

  it('no altera a los demás roles', () => {
    expect(rolesEfectivos('PROFESSOR', 'GET')).toEqual(['PROFESSOR']);
    expect(autorizadoPorRol('PROFESSOR', 'GET', ['ADMIN', 'COORDINATOR'])).toBe(false);
    expect(autorizadoPorRol(undefined, 'GET', ['ADMIN'])).toBe(false);
  });
});

describe('el guardián de solo lectura', () => {
  it('deja pasar cualquier consulta', () => {
    expect(esLectura('GET')).toBe(true);
    expect(esLectura('head')).toBe(true);
    expect(puedeEscribir('SECRETARY', 'GET', '/grades')).toBe(true);
  });

  it('corta la escritura académica', () => {
    expect(puedeEscribir('SECRETARY', 'POST', '/grades/bulk')).toBe(false);
    expect(puedeEscribir('SECRETARY', 'PATCH', '/students/abc')).toBe(false);
    expect(puedeEscribir('SECRETARY', 'DELETE', '/enrollments/abc')).toBe(false);
    expect(puedeEscribir('SECRETARY', 'POST', '/periods/2026-1/cierre')).toBe(false);
  });

  it('permite lo imprescindible para tener sesión y bandeja', () => {
    expect(puedeEscribir('SECRETARY', 'POST', '/auth/login')).toBe(true);
    expect(puedeEscribir('SECRETARY', 'POST', '/auth/refresh')).toBe(true);
    expect(puedeEscribir('SECRETARY', 'POST', '/auth/logout')).toBe(true);
    expect(puedeEscribir('SECRETARY', 'PATCH', '/notifications/read-all')).toBe(true);
    expect(puedeEscribir('SECRETARY', 'PATCH', '/notifications/64abc/read')).toBe(true);
    expect(puedeEscribir('SECRETARY', 'POST', '/telemetry/errores')).toBe(true);
    // Su propia contraseña: escribe sobre su cuenta y sobre nada más. Sin esto,
    // cambiarla dependía de que un administrador lo hiciera por ella.
    expect(puedeEscribir('SECRETARY', 'POST', '/auth/password')).toBe(true);
  });

  it('no convierte el alta de cuentas en una excepción de sesión', () => {
    // El prefijo `/auth` suelto habría dejado pasar esto: la lista está
    // anclada justamente para que no ocurra.
    expect(puedeEscribir('SECRETARY', 'POST', '/auth/register')).toBe(false);
  });

  it('no toca a los roles que sí escriben', () => {
    expect(puedeEscribir('COORDINATOR', 'POST', '/grades/bulk')).toBe(true);
    expect(puedeEscribir('PROFESSOR', 'POST', '/grades/bulk')).toBe(true);
    expect(puedeEscribir('ADMIN', 'DELETE', '/students/abc')).toBe(true);
  });
});
