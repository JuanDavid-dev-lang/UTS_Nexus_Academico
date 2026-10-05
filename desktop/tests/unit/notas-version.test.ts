import { describe, expect, it } from 'vitest';
import { leerNotasVersion, textoPlano } from '@/domain/updates/notas-version';

const NOTAS = `# 📱 UTS Nexus Académico 1.8.1 — «Widgets»

Tu horario y tus accesos favoritos, directo en la pantalla de inicio de
Android. Y la **versión web** ahora se lee completa.

---

## 🧩 Widgets en tu pantalla de inicio (Android)

- **Horario** — tus próximas clases con el día («Hoy», «Mañana»), la hora,
  la materia y el grupo.
- **Acceso rápido** — abre \`Notas\` y [Agenda](https://x.y).
`;

describe('leerNotasVersion', () => {
  it('convierte el Markdown de la release en bloques sin símbolos', () => {
    expect(leerNotasVersion(NOTAS)).toEqual([
      {
        tipo: 'parrafo',
        texto:
          'Tu horario y tus accesos favoritos, directo en la pantalla de inicio de Android. Y la versión web ahora se lee completa.',
      },
      { tipo: 'titulo', texto: '🧩 Widgets en tu pantalla de inicio (Android)' },
      {
        tipo: 'vineta',
        texto:
          'Horario — tus próximas clases con el día («Hoy», «Mañana»), la hora, la materia y el grupo.',
      },
      { tipo: 'vineta', texto: 'Acceso rápido — abre Notas y Agenda.' },
    ]);
  });

  it('deja intacto un texto sin marcado', () => {
    expect(leerNotasVersion('Correcciones menores.')).toEqual([
      { tipo: 'parrafo', texto: 'Correcciones menores.' },
    ]);
  });

  it('no devuelve nada para notas vacías', () => {
    expect(leerNotasVersion('  \n\n')).toEqual([]);
  });

  it('no confunde un guion de inciso con cursiva', () => {
    expect(textoPlano('a_b y *c*')).toBe('a_b y c');
  });
});
