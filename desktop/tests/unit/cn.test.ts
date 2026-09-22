import { describe, expect, it } from 'vitest';
import { cn } from '@/shared/lib/cn';

describe('cn', () => {
  it('un tamaño de la rampa tipográfica no borra el color', () => {
    // El fallo real: el botón primario perdía `text-on-primary` por `text-body`.
    expect(cn('text-on-primary', 'text-body')).toBe('text-on-primary text-body');
    expect(cn('text-muted', 'text-caption')).toBe('text-muted text-caption');
  });

  it('dos tamaños siguen resolviéndose al último, y dos colores también', () => {
    expect(cn('text-body', 'text-caption')).toBe('text-caption');
    expect(cn('text-muted', 'text-text')).toBe('text-text');
  });
});
