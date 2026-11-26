import { describe, expect, it } from 'vitest';
import { AVISO_USO_VERSION, debeMostrarAvisoUso } from '@/domain/usage/aviso-uso';
import { can } from '@/core/auth/permissions';

describe('aviso de uso y privacidad', () => {
  it('se enseña solo si el servidor lo pide, hay conexión y no se descartó', () => {
    expect(debeMostrarAvisoUso({ avisoUsoPendiente: true }, true, false)).toBe(true);
    expect(debeMostrarAvisoUso({ avisoUsoPendiente: true }, false, false)).toBe(false);
    expect(debeMostrarAvisoUso({ avisoUsoPendiente: true }, true, true)).toBe(false);
    // Un servidor anterior no manda el campo: no hay aviso que enseñar.
    expect(debeMostrarAvisoUso({}, true, false)).toBe(false);
    expect(debeMostrarAvisoUso(null, true, false)).toBe(false);
  });

  it('lleva la misma versión que el backend', () => {
    // `backend/src/domains/usage/aviso-uso.ts` y el móvil dicen 1: subirla en
    // uno solo enseña el aviso en un cliente y no en el otro.
    expect(AVISO_USO_VERSION).toBe(1);
  });
});

describe('uso de la aplicación', () => {
  it('es solo de ADMIN, como la auditoría', () => {
    expect(can('ADMIN', 'usage.read')).toBe(true);
    expect(can('COORDINATOR', 'usage.read')).toBe(false);
    expect(can('SECRETARY', 'usage.read')).toBe(false);
    expect(can('PROFESSOR', 'usage.read')).toBe(false);
  });
});
