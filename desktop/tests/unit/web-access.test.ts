import { describe, expect, it } from 'vitest';
import { hayRecorteWeb, rutaEnWeb } from '@/domain/platform/web-access';

describe('versión web', () => {
  it('en la aplicación instalada no recorta nada', () => {
    expect(rutaEnWeb('/agenda', false, 'PROFESSOR')).toBe(true);
    expect(hayRecorteWeb(false, 'PROFESSOR')).toBe(false);
  });

  it('ADMIN ve todo también en la web', () => {
    expect(rutaEnWeb('/auditoria', true, 'ADMIN')).toBe(true);
    expect(hayRecorteWeb(true, 'ADMIN')).toBe(false);
  });

  it('ofrece las pantallas del aula y deja fuera las de la app', () => {
    for (const ruta of ['/materias', '/estudiantes', '/notas', '/asistencia', '/riesgo', '/asistente', '/sugerencias', '/configuracion']) {
      expect(rutaEnWeb(ruta, true, 'PROFESSOR')).toBe(true);
    }
    for (const ruta of ['/', '/agenda', '/actividades', '/avisos', '/reportes', '/trabajos-grado', '/coordinacion', '/notificaciones']) {
      expect(rutaEnWeb(ruta, true, 'COORDINATOR')).toBe(false);
    }
  });

  it('una subruta sigue a su pantalla, y un prefijo parecido no cuela', () => {
    expect(rutaEnWeb('/materias/123', true, 'PROFESSOR')).toBe(true);
    expect(rutaEnWeb('/notas-finales', true, 'PROFESSOR')).toBe(false);
  });

  it('sin sesión todavía no hay rol: se recorta igual', () => {
    expect(hayRecorteWeb(true, undefined)).toBe(true);
  });
});
