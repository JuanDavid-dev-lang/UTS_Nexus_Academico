import { describe, expect, it } from 'vitest';
import { canalDeOrigen, soloEnApp } from '../src/domains/scope/web-access.js';

const APP = ['http://tauri.localhost', 'tauri://localhost'];

describe('canalDeOrigen', () => {
  it('la app de escritorio y el móvil (sin Origin) son app', () => {
    expect(canalDeOrigen('http://tauri.localhost', APP)).toBe('app');
    expect(canalDeOrigen('tauri://localhost', APP)).toBe('app');
    expect(canalDeOrigen(undefined, APP)).toBe('app');
  });

  it('un navegador, sea el dominio que sea, es web', () => {
    expect(canalDeOrigen('https://nexusback.ciaiuts.com', APP)).toBe('web');
    expect(canalDeOrigen('http://localhost:5183', APP)).toBe('web');
  });
});

describe('soloEnApp', () => {
  it('deja pasar lo que la web ofrece', () => {
    expect(soloEnApp('GET', '/subjects')).toBe(false);
    expect(soloEnApp('POST', '/grades')).toBe(false);
    expect(soloEnApp('POST', '/grades/bulk')).toBe(false);
    expect(soloEnApp('POST', '/attendance/bulk')).toBe(false);
    expect(soloEnApp('POST', '/asistencia-qr/sesiones')).toBe(false);
    expect(soloEnApp('GET', '/ml/risk')).toBe(false);
    expect(soloEnApp('POST', '/feedback')).toBe(false);
    expect(soloEnApp('POST', '/enrollments/bulk')).toBe(false);
  });

  it('corta las funciones de la app, con todas sus subrutas', () => {
    expect(soloEnApp('POST', '/ai/chat')).toBe(true);
    expect(soloEnApp('GET', '/agenda')).toBe(true);
    expect(soloEnApp('GET', '/activities/123')).toBe(true);
    expect(soloEnApp('GET', '/avisos')).toBe(true);
    expect(soloEnApp('GET', '/coordinacion/export.xlsx')).toBe(true);
  });

  it('no confunde un prefijo con otra ruta que empiece igual', () => {
    expect(soloEnApp('GET', '/aim')).toBe(false);
    expect(soloEnApp('GET', '/agendas-publicas')).toBe(false);
  });

  it('de los reportes solo deja exportar notas y asistencia', () => {
    expect(soloEnApp('GET', '/reports/excel/grades')).toBe(false);
    expect(soloEnApp('GET', '/reports/pdf/attendance')).toBe(false);
    expect(soloEnApp('GET', '/reports/excel/consolidado')).toBe(true);
    expect(soloEnApp('GET', '/reports/pdf/combined')).toBe(true);
    expect(soloEnApp('PUT', '/reports/template')).toBe(true);
    expect(soloEnApp('GET', '/reports/summary')).toBe(true);
  });

  it('corta las importaciones por foto o archivo, no el registro normal', () => {
    expect(soloEnApp('POST', '/grades/import/scan')).toBe(true);
    expect(soloEnApp('POST', '/attendance/scan')).toBe(true);
    expect(soloEnApp('POST', '/attendance/scan/confirm')).toBe(true);
    expect(soloEnApp('POST', '/enrollments/import/scan/')).toBe(true);
  });
});
