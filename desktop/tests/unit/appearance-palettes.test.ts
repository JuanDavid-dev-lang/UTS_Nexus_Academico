import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contraste, hexAHsl, hslAHex, normalizarHex } from '@/domain/appearance/color';
import {
  generarTono,
  SEMILLAS,
  TONOS,
  tokensDeTono,
  tonosSemanticos,
  VISIONES,
  type ModoResuelto,
} from '@/domain/appearance/palettes';
import {
  APARIENCIA_POR_DEFECTO,
  atributosDocumento,
  firmaVisual,
  normalizarApariencia,
  variablesCss,
} from '@/domain/appearance/preferences';

/** El selector también aparece en un comentario de :root; se parte por la regla. */
const BLOQUE_OSCURO = "\n[data-theme='dark'] {";
const MODOS: ModoResuelto[] = ['light', 'dark'];
const AA = 4.5;

/**
 * Lo que el móvil tiene que reproducir. Si cambias el generador, estas cifras
 * cambian aquí y en `flutter_app/test/appearance_palettes_test.dart` en el
 * mismo commit: son la única prueba de que las dos apps pintan el mismo tono.
 */
const REFERENCIA = {
  oceanoClaro: generarTono(SEMILLAS.oceano, 'light'),
  amatistaOscuro: generarTono(SEMILLAS.amatista, 'dark'),
};

const CSS = readFileSync(resolve(__dirname, '../../src/styles/tokens.css'), 'utf8');

/** Valor hex de un token en el bloque claro (`:root`) u oscuro de tokens.css. */
function tokenCss(modo: ModoResuelto, token: string): string | undefined {
  const bloque = CSS.split(BLOQUE_OSCURO)[modo === 'light' ? 0 : 1] ?? '';
  return new RegExp(`--${token}:\\s*(#[0-9a-fA-F]{6})`).exec(bloque)?.[1]?.toUpperCase();
}

describe('color', () => {
  it('hex → HSL → hex conserva el color salvo redondeo', () => {
    for (const hex of ['#0B5D3B', '#1D4ED8', '#6D28D9', '#BE185D', '#334155']) {
      const vuelta = hslAHex(hexAHsl(hex));
      expect(contraste(vuelta, hex)).toBeLessThan(1.1);
    }
  });

  it('normaliza el hex a mayúsculas con almohadilla', () => {
    expect(normalizarHex('abc123')).toBe('#ABC123');
    expect(() => normalizarHex('#12')).toThrow();
  });

  it('calcula el contraste WCAG', () => {
    expect(contraste('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contraste('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
  });
});

describe('tono institucional', () => {
  it.each(MODOS)('coincide con tokens.css en modo %s', (modo) => {
    const tokens = tokensDeTono('institucional', modo);
    for (const [nombre, valor] of Object.entries(tokens)) {
      const enCss = tokenCss(modo, nombre);
      if (enCss) expect([nombre, valor]).toEqual([nombre, enCss]);
    }
  });
});

describe('tonos generados', () => {
  const casos = [
    ...TONOS.flatMap((tono) => MODOS.map((modo) => [tono, modo, undefined] as const)),
    // Colores propios extremos: si el generador aguanta estos, aguanta el resto.
    ...['#FFFF00', '#00FFFF', '#000000', '#FFFFFF', '#FF0000', '#808080'].flatMap((color) =>
      MODOS.map((modo) => ['personalizado', modo, color] as const),
    ),
  ];

  it.each(casos)('%s en %s (%s) pasa AA donde lleva texto', (tono, modo, color) => {
    const t = tokensDeTono(tono, modo, color);
    expect(contraste(t.text, t.surface)).toBeGreaterThanOrEqual(7);
    expect(contraste(t['text-muted'], t['surface-alt'])).toBeGreaterThanOrEqual(AA);
    expect(contraste(t['on-primary'], t.primary)).toBeGreaterThanOrEqual(AA);
    expect(contraste(t['on-accent'], t.accent)).toBeGreaterThanOrEqual(AA);
    expect(contraste(t['accent-strong'], t.surface)).toBeGreaterThanOrEqual(AA);
    if (modo === 'light') {
      expect(contraste(t['on-primary'], t['primary-hover'])).toBeGreaterThanOrEqual(AA);
      expect(contraste('#FFFFFF', t['brand-start'])).toBeGreaterThanOrEqual(AA);
    } else {
      expect(contraste(t.primary, t['surface-hover'])).toBeGreaterThanOrEqual(AA);
    }
  });

  it('los cinco tonos son distintos entre sí', () => {
    for (const modo of MODOS) {
      const primarios = new Set(TONOS.map((tono) => tokensDeTono(tono, modo).primary));
      expect(primarios.size).toBe(TONOS.length);
    }
  });

  it('personalizado sin color cae al color por defecto, no revienta', () => {
    expect(tokensDeTono('personalizado', 'light')).toEqual(generarTono(SEMILLAS.oceano, 'light'));
  });

  it('salidas de referencia que el móvil replica', () => {
    expect(REFERENCIA.oceanoClaro.primary).toMatchInlineSnapshot(`"#1842B4"`);
    expect(REFERENCIA.oceanoClaro.accent).toMatchInlineSnapshot(`"#6B8DEB"`);
    expect(REFERENCIA.amatistaOscuro.primary).toMatchInlineSnapshot(`"#AF8AEA"`);
    expect(REFERENCIA.amatistaOscuro.surface).toMatchInlineSnapshot(`"#292136"`);
    expect(REFERENCIA.oceanoClaro.bg).toMatchInlineSnapshot(`"#E9ECF7"`);
    expect(REFERENCIA.oceanoClaro['text-muted']).toMatchInlineSnapshot(`"#546083"`);
    expect(REFERENCIA.amatistaOscuro['text-muted']).toMatchInlineSnapshot(`"#A59AB6"`);
  });
});

describe('visión del color', () => {
  const superficies = (modo: ModoResuelto) =>
    [
      ...TONOS.map((tono) => tokensDeTono(tono, modo)),
      tokensDeTono('personalizado', modo, '#FFFF00'),
    ].flatMap((t) => [t.surface, t['surface-alt']]);

  // `normal` son los valores de siempre y se fijan contra tokens.css abajo. El
  // rojo de peligro de esa paleta queda en 4.3:1 sobre su chip: es anterior a
  // esto y cambiarlo es una decisión de marca, no de este generador.
  const adaptadas = VISIONES.filter((v) => v !== 'normal');

  it.each(adaptadas.flatMap((v) => MODOS.map((m) => [v, m] as const)))(
    '%s en %s: cada estado se lee sobre su chip y sobre cualquier superficie',
    (vision, modo) => {
      const tonos = tonosSemanticos(vision, modo);
      for (const [estado, { fg, soft }] of Object.entries(tonos)) {
        expect([estado, contraste(fg, soft) >= AA]).toEqual([estado, true]);
        for (const fondo of superficies(modo)) {
          expect([estado, fondo, contraste(fg, fondo) >= AA]).toEqual([estado, fondo, true]);
        }
      }
    },
  );

  it.each(MODOS)('normal en %s coincide con tokens.css', (modo) => {
    for (const [estado, { fg, soft, border }] of Object.entries(tonosSemanticos('normal', modo))) {
      expect([fg, soft, border]).toEqual([
        tokenCss(modo, estado),
        tokenCss(modo, `${estado}-soft`),
        tokenCss(modo, `${estado}-border`),
      ]);
    }
  });

  it('protanopía y deuteranopía no usan el verde de éxito ni el rojo de peligro', () => {
    for (const vision of ['protanopia', 'deuteranopia'] as const) {
      const tonos = tonosSemanticos(vision, 'light');
      expect(tonos.success.fg).not.toBe('#067647');
      expect(tonos.danger.fg).not.toBe('#D92D20');
    }
  });
});

describe('preferencias guardadas', () => {
  it('lo que no se reconoce cae al valor por defecto campo a campo', () => {
    const leida = normalizarApariencia({
      tono: 'amatista',
      colorPropio: 'no-es-color',
      vision: 'marciana',
      esquinas: 'redondeadas',
      tamanoTexto: 42,
      reducirMovimiento: 'si',
    });
    expect(leida).toEqual({
      ...APARIENCIA_POR_DEFECTO,
      tono: 'amatista',
      esquinas: 'redondeadas',
    });
  });

  it('sin nada guardado es la apariencia de siempre', () => {
    expect(normalizarApariencia(undefined)).toEqual(APARIENCIA_POR_DEFECTO);
    expect(normalizarApariencia('basura')).toEqual(APARIENCIA_POR_DEFECTO);
  });

  it('la posición del menú cae a la izquierda si lo guardado no es una de las cuatro', () => {
    expect(normalizarApariencia({ posicionMenu: 'abajo' }).posicionMenu).toBe('abajo');
    expect(normalizarApariencia({ posicionMenu: 'centro' }).posicionMenu).toBe('izquierda');
    // Una preferencia guardada antes de que existiera el campo.
    expect(normalizarApariencia({ tono: 'oceano' }).posicionMenu).toBe('izquierda');
  });

  it('las variables CSS por defecto son las de tokens.css', () => {
    for (const modo of MODOS) {
      const variables = variablesCss(APARIENCIA_POR_DEFECTO, modo);
      for (const [nombre, valor] of Object.entries(variables)) {
        const enCss = tokenCss(modo, nombre.slice(2));
        if (enCss) expect([nombre, valor]).toEqual([nombre, enCss]);
      }
    }
  });

  it('el degradado de las tarjetas es el de tokens.css con el institucional y sigue al tono con los demás', () => {
    const institucional = variablesCss(APARIENCIA_POR_DEFECTO, 'light')['--gradient-surface'];
    expect(institucional).toBe('linear-gradient(180deg, #FFFFFF 0%, #FAFBFD 100%)');
    expect(CSS.toLowerCase()).toContain('linear-gradient(180deg, #ffffff 0%, #fafbfd 100%)');
    expect(CSS.toLowerCase()).toContain('linear-gradient(180deg, #363629 0%, #31312a 100%)');

    const oceano = { ...APARIENCIA_POR_DEFECTO, tono: 'oceano' as const };
    for (const modo of MODOS) {
      const degradado = variablesCss(oceano, modo)['--gradient-surface'];
      expect(degradado).not.toContain('#FFFFFF');
      expect(degradado).not.toContain('#363629');
    }
  });

  it('la visión del color reescribe los cuatro estados', () => {
    const variables = variablesCss({ ...APARIENCIA_POR_DEFECTO, vision: 'deuteranopia' }, 'light');
    const esperados = tonosSemanticos('deuteranopia', 'light');
    expect(variables['--success']).toBe(esperados.success.fg);
    expect(variables['--danger-soft']).toBe(esperados.danger.soft);
  });

  it('solo la acromatopsia pide la interfaz en grises', () => {
    for (const vision of VISIONES) {
      const { grises } = atributosDocumento({ ...APARIENCIA_POR_DEFECTO, vision });
      expect([vision, grises]).toEqual([vision, vision === 'acromatopsia' ? 'si' : 'no']);
    }
  });

  it('la firma cambia con el tono y con el modo, no con el estilo', () => {
    const base = firmaVisual(APARIENCIA_POR_DEFECTO, 'light');
    expect(firmaVisual({ ...APARIENCIA_POR_DEFECTO, tono: 'grafito' }, 'light')).not.toBe(base);
    expect(firmaVisual(APARIENCIA_POR_DEFECTO, 'dark')).not.toBe(base);
    expect(firmaVisual({ ...APARIENCIA_POR_DEFECTO, esquinas: 'rectas' }, 'light')).toBe(base);
  });
});
