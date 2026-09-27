import { describe, expect, it } from 'vitest';
import {
  TINTA,
  ajustarAnchos,
  altoDeFilaExcel,
  anchoExcel,
  anchoUtil,
  contraste,
  dimensionesDeImagen,
  fechaCorta,
  fechaHoraDeCampus,
  formatoDeImagen,
  marcaComoTexto,
  orientacionPara,
  repartirAnchos,
  textoSobre,
} from '../src/modules/reports/report-layout.js';

/**
 * Maquetación de los PDF y Excel. Lo que fijan estas pruebas es lo que antes
 * fallaba en silencio: columnas estrechadas hasta cortar el texto, un
 * encabezado negro sobre verde oscuro, una fecha del día siguiente.
 */

const suma = (anchos: number[]) => anchos.reduce((s, a) => s + a, 0);

describe('contraste del texto sobre los colores de la plantilla', () => {
  it('sobre el verde institucional el texto es blanco', () => {
    expect(textoSobre('#144D37')).toBe(TINTA.blanco);
  });

  it('sobre un color claro (el menta de la primera plantilla) el texto es oscuro', () => {
    expect(textoSobre('#d7f0e5')).toBe(TINTA.texto);
    expect(textoSobre('#CAD225')).toBe(TINTA.texto);
  });

  it('un color de marca claro no se usa como color del título', () => {
    expect(marcaComoTexto('#CAD225')).toBe(TINTA.texto);
    expect(marcaComoTexto('#144D37')).toBe('#144D37');
  });

  it('los tonos de estado se leen sobre blanco con AA', () => {
    for (const color of [TINTA.ok, TINTA.alerta, TINTA.mal, TINTA.secundario]) {
      expect(contraste(color, TINTA.blanco)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('ajustarAnchos', () => {
  it('la tabla ocupa exactamente el ancho disponible', () => {
    expect(suma(ajustarAnchos([68, 150, 50], 523))).toBeCloseTo(523, 5);
    expect(suma(ajustarAnchos([68, 150, 50], 770))).toBeCloseTo(770, 5);
  });

  it('conserva las proporciones', () => {
    const [a, b] = ajustarAnchos([50, 100], 300);
    expect(b / a).toBeCloseTo(2, 1);
  });

  it('sin anchos útiles reparte a partes iguales', () => {
    expect(ajustarAnchos([0, 0], 100)).toEqual([50, 50]);
    expect(ajustarAnchos([], 100)).toEqual([]);
  });
});

describe('repartirAnchos', () => {
  it('si los preferidos caben, cada columna recibe al menos el suyo', () => {
    // Nombres cortos: la columna del estudiante no se lleva el espacio que
    // necesita la materia para caber en una línea.
    const anchos = repartirAnchos([60, 180], [40, 60], 300);
    expect(anchos[0]).toBeGreaterThanOrEqual(60);
    expect(anchos[1]).toBeGreaterThanOrEqual(180);
    expect(suma(anchos)).toBeCloseTo(300, 5);
  });

  it('ninguna columna queda por debajo de su mínimo si caben todos', () => {
    const anchos = repartirAnchos([36, 200, 200], [60, 20, 20], 300);
    expect(anchos[0]).toBeGreaterThanOrEqual(59.99);
    expect(suma(anchos)).toBeCloseTo(300, 5);
  });

  it('lo que falta sale de las columnas con holgura', () => {
    const [, b, c] = repartirAnchos([36, 200, 200], [60, 20, 20], 300);
    // El sobrante del redondeo (centésimas) va a la más ancha.
    expect(b).toBeCloseTo(c, 1);
  });

  it('si los mínimos no caben juntos, se reparten en proporción sin salirse de la caja', () => {
    const anchos = repartirAnchos([10, 10], [300, 100], 200);
    expect(suma(anchos)).toBeCloseTo(200, 5);
    expect(anchos[0]).toBeCloseTo(150, 5);
  });
});

describe('orientacionPara', () => {
  it('lo que cabe en vertical va en vertical', () => {
    expect(orientacionPara([[100, 200, 100]])).toBe('portrait');
  });

  it('basta una tabla más ancha que la página vertical para ir en horizontal', () => {
    expect(orientacionPara([[100], [anchoUtil('portrait') + 1]])).toBe('landscape');
  });
});

describe('fechas', () => {
  it('la hora de generación es la del campus, no la del servidor', () => {
    // 01:30 UTC del 28 es aún el 27 a las 20:30 en Bucaramanga (UTC-5).
    expect(fechaHoraDeCampus(new Date('2026-09-28T01:30:00Z'), -300)).toBe('27 sep 2026, 20:30');
  });

  it('el día de un filtro se lee en UTC: «2026-09-01» no se convierte en el 31 de agosto', () => {
    expect(fechaCorta(new Date('2026-09-01'))).toBe('01/09/2026');
  });

  it('una fecha inválida o ausente queda vacía', () => {
    expect(fechaCorta('no-es-fecha')).toBe('');
    expect(fechaCorta(null)).toBe('');
  });
});

describe('anchoExcel', () => {
  it('crece con el contenido más largo', () => {
    expect(anchoExcel(['Estudiante', 'CARLOS ANDRES MARTINEZ VILLAMIZAR'], 10)).toBe(35);
  });

  it('respeta el mínimo y el máximo', () => {
    expect(anchoExcel(['A'], 12)).toBe(12);
    expect(anchoExcel(['x'.repeat(300)], 12, 50)).toBe(50);
  });
});

describe('altoDeFilaExcel', () => {
  it('una línea a 10 pt mide lo de siempre', () => {
    expect(altoDeFilaExcel('Periodo: 2026-2', 120, 10)).toBe(18);
  });

  it('la ficha con todos los filtros crece en vez de recortarse', () => {
    // Periodo, materia, grupo, estudiante, rango y fecha de generación: ~330
    // caracteres en una fila combinada de ~130 son tres líneas.
    const ficha = 'x'.repeat(330);
    expect(altoDeFilaExcel(ficha, 130, 10)).toBeGreaterThanOrEqual(3 * 13.5);
  });

  it('a mayor tamaño de letra caben menos caracteres por línea', () => {
    const titulo = 'Reporte académico completo · Asistencia';
    expect(altoDeFilaExcel(titulo, 30, 16)).toBeGreaterThan(altoDeFilaExcel(titulo, 30, 10));
  });
});

describe('imágenes del membrete', () => {
  // Cabecera PNG con IHDR de 2264 × 1351, las medidas del logo de la UTS.
  const png = Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
    0, 0, 0x08, 0xd8, 0, 0, 0x05, 0x47,
  ]);
  // JPEG mínimo: SOI, un APP0 de 4 bytes y un SOF0 de 640 × 480.
  const jpeg = Uint8Array.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x02, 0x80, 0x03,
  ]);
  const webp = new TextEncoder().encode('RIFF....WEBPVP8 ');

  it('reconoce PNG y JPEG por su firma', () => {
    expect(formatoDeImagen(png)).toBe('png');
    expect(formatoDeImagen(jpeg)).toBe('jpeg');
  });

  it('un WebP no se ofrece a pdfkit, que no sabe leerlo', () => {
    expect(formatoDeImagen(webp)).toBeNull();
  });

  it('lee las medidas para no estirar el logo', () => {
    expect(dimensionesDeImagen(png)).toEqual({ ancho: 2264, alto: 1351 });
    expect(dimensionesDeImagen(jpeg)).toEqual({ ancho: 640, alto: 480 });
    expect(dimensionesDeImagen(webp)).toBeNull();
  });
});
