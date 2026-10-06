import { describe, expect, it } from 'vitest';
import { leerNotasVersion, textoPlano, tramosEnLinea } from '@/domain/updates/notas-version';

const NOTAS = `# 📱 UTS Nexus Académico 1.8.1 — «Widgets»

Tu horario y tus accesos favoritos, directo en la pantalla de inicio de
Android. Y la **versión web** ahora se lee completa.

---

## 🧩 Widgets en tu pantalla de inicio (Android)

- **Horario** — tus próximas clases con el día («Hoy», «Mañana»), la hora,
  la materia y el grupo.
  - Se actualiza al abrir la app.
- **Acceso rápido** — abre \`Notas\` y [Agenda](https://x.y).

### Cómo agregarlos

1. Deja presionado un espacio vacío.
2. Toca *Widgets*.

> Si no aparece, reinicia el
> teléfono.
`;

/** Solo lo que importa de cada bloque: tipo, extra y texto plano. */
function resumen(markdown: string) {
  return leerNotasVersion(markdown).map(({ tramos: _t, ...resto }) => resto);
}

describe('leerNotasVersion', () => {
  it('convierte el Markdown de la release en bloques sin símbolos', () => {
    expect(resumen(NOTAS)).toEqual([
      {
        tipo: 'parrafo',
        texto:
          'Tu horario y tus accesos favoritos, directo en la pantalla de inicio de Android. Y la versión web ahora se lee completa.',
      },
      { tipo: 'titulo', nivel: 2, texto: '🧩 Widgets en tu pantalla de inicio (Android)' },
      {
        tipo: 'vineta',
        nivel: 0,
        texto:
          'Horario — tus próximas clases con el día («Hoy», «Mañana»), la hora, la materia y el grupo.',
      },
      { tipo: 'vineta', nivel: 1, texto: 'Se actualiza al abrir la app.' },
      { tipo: 'vineta', nivel: 0, texto: 'Acceso rápido — abre Notas y Agenda.' },
      { tipo: 'titulo', nivel: 3, texto: 'Cómo agregarlos' },
      { tipo: 'numerada', numero: 1, texto: 'Deja presionado un espacio vacío.' },
      { tipo: 'numerada', numero: 2, texto: 'Toca Widgets.' },
      { tipo: 'cita', texto: 'Si no aparece, reinicia el teléfono.' },
    ]);
  });

  it('conserva el formato en línea como tramos', () => {
    const [parrafo] = leerNotasVersion('Y la **versión web** ahora `abre` *rápido*.');
    expect(parrafo?.tramos).toEqual([
      { texto: 'Y la ' },
      { texto: 'versión web', negrita: true },
      { texto: ' ahora ' },
      { texto: 'abre', codigo: true },
      { texto: ' ' },
      { texto: 'rápido', cursiva: true },
      { texto: '.' },
    ]);
  });

  it('deja intacto un texto sin marcado', () => {
    expect(resumen('Correcciones menores.')).toEqual([{ tipo: 'parrafo', texto: 'Correcciones menores.' }]);
  });

  it('no devuelve nada para notas vacías', () => {
    expect(leerNotasVersion('  \n\n')).toEqual([]);
  });

  it('lee un bloque de código como texto, sin las vallas', () => {
    expect(resumen('```\nnpm run dev\n```')).toEqual([{ tipo: 'parrafo', texto: 'npm run dev' }]);
  });
});

describe('tramosEnLinea', () => {
  it('no confunde un guion bajo dentro de una palabra con cursiva', () => {
    expect(textoPlano('a_b y *c*')).toBe('a_b y c');
    expect(tramosEnLinea('archivo_de_notas.md')).toEqual([{ texto: 'archivo_de_notas.md' }]);
  });

  it('un asterisco suelto no abre cursiva', () => {
    expect(tramosEnLinea('5 * 3 = 15')).toEqual([{ texto: '5 * 3 = 15' }]);
  });
});
