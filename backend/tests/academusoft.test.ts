import { describe, expect, it } from 'vitest';
import {
  esReporteAcademusoft,
  interpretarReporteAcademusoft,
  type ElementoDeTexto,
} from '../src/domains/grading/academusoft.js';

/**
 * El reporte «Ver Calificaciones» de Academusoft, reconstruido con las
 * posiciones del PDF real (septiembre de 2026) y datos inventados.
 *
 * Lo que fijan estas pruebas es lo que en el archivo real no se ve leyendo el
 * texto en orden: la cédula de la última fila de una página aparece arriba de
 * la siguiente, la última fila no puede tragarse el pie, y las columnas se
 * reconocen por posición, no por cuántos guiones hay antes.
 */

const PESOS = ['10%', '60%', '30%'];
/** Borde izquierdo de los nueve encabezados de nota (3 cortes × 3 componentes). */
const X_ENCABEZADO = [374, 404, 434, 463, 493, 523, 553, 584, 614];
/** Las celdas van alineadas a la derecha de su encabezado (ancho 17). */
const DERECHA = X_ENCABEZADO.map(x => x + 17);

const t = (texto: string, x: number, y: number, pagina = 1, ancho = texto.length * 4): ElementoDeTexto => ({
  texto,
  x,
  y,
  ancho,
  pagina,
});

function cabecera(): ElementoDeTexto[] {
  return [
    t('Fecha del reporte 30-09-2026 22:22:09', 59, 1080),
    t('Académico - Academusoft 3.2', 648, 1080),
    t('Ver Calificaciones', 387, 1057),
    t('CC. 91000000', 136, 1028),
    t('DOCENTE DE PRUEBA', 451, 1028),
    t('TSI601-NUEVAS TECNOLOGIAS DE DESARROLLO', 177, 998, 1, 214),
    t('B191', 638, 998, 1, 16),
    t('PRIMER CORTE', 377, 983),
    t('(33%)', 401, 972),
    t('No.', 64, 957),
    t('Identificación', 85, 957),
    t('Nombre', 242, 957),
    ...X_ENCABEZADO.map((x, i) => t(PESOS[i % 3]!, x, 957, 1, 17)),
    t('Hab.', 676, 957),
    t('Def.', 709, 957),
  ];
}

/** Una fila: número, «CC -», documento debajo, nombre y nueve celdas. */
function fila(
  numero: number,
  y: number,
  nombre: string,
  celdas: string[],
  opciones: { documento?: string | null; pagina?: number } = {},
): ElementoDeTexto[] {
  const pagina = opciones.pagina ?? 1;
  const elementos = [
    t(String(numero), 63, y, pagina, 5),
    t('CC -', 83, y, pagina, 16),
    t(nombre, 152, y, pagina),
    ...celdas.map((celda, i) => {
      const ancho = celda === '-' ? 3 : 12;
      return t(celda, DERECHA[i]! - ancho, y, pagina, ancho);
    }),
    t('-', 696, y, pagina, 3),
    t('1.4', 721, y, pagina, 11),
    t('NO', 751, y, pagina, 10),
  ];
  if (opciones.documento !== null) {
    elementos.push(t(opciones.documento ?? `10000000${numero}`, 83, y - 12, pagina, 40));
  }
  return elementos;
}

const SOLO_CORTE_1 = (a: string, p: string, tr: string) => [a, p, tr, '-', '-', '-', '-', '-', '-'];

function reporteDeDosPaginas(): ElementoDeTexto[] {
  return [
    ...cabecera(),
    ...fila(1, 932, 'PEREZ GOMEZ ANA MARIA', SOLO_CORTE_1('5.0', '4.1', '4.5')),
    ...fila(2, 906, 'DIAZ CASTRO BRUNO', SOLO_CORTE_1('5.0', 'NP', '3.0')),
    // Última fila de la página: su documento se imprime arriba de la siguiente.
    ...fila(3, 880, 'RUIZ SOTO CARLA', SOLO_CORTE_1('4.5', '3.8', '4.8'), { documento: null }),
    t('1000000003', 83, 1082, 2, 40),
    ...fila(4, 1067, 'ROJAS LEON DANIEL', SOLO_CORTE_1('5.0', '45', '4.0'), { pagina: 2 }),
    // Pie de la última página, justo debajo de la última fila.
    t('SN: SIN NOTAS', 120, 1040, 2),
    t('PE: PENDIENTE', 300, 1040, 2),
    t('Firma Del Docente:', 150, 990, 2),
    t('NOTA : Favor no adicionar estudiantes a la lista.', 64, 960, 2),
  ];
}

describe('esReporteAcademusoft', () => {
  it('reconoce el reporte por su título, su sistema y las columnas de peso', () => {
    expect(esReporteAcademusoft(reporteDeDosPaginas())).toBe(true);
  });

  it('un PDF cualquiera con porcentajes no es el reporte', () => {
    expect(esReporteAcademusoft([t('Informe', 0, 0), t('10%', 0, 0), t('60%', 0, 0), t('30%', 0, 0)])).toBe(false);
  });
});

describe('interpretarReporteAcademusoft', () => {
  const reporte = interpretarReporteAcademusoft(reporteDeDosPaginas());

  it('lee materia y grupo del encabezado', () => {
    expect(reporte.encabezado).toEqual({
      codigoMateria: 'TSI601',
      nombreMateria: 'NUEVAS TECNOLOGIAS DE DESARROLLO',
      grupo: 'B191',
    });
  });

  it('cada columna va a su corte y componente por el peso del encabezado', () => {
    // Solo el corte 1 trae notas: los otros dos no se proponen.
    expect(reporte.columnas).toEqual([
      { corte: 1, componentType: 'AUTOEVALUACION' },
      { corte: 1, componentType: 'PARCIALES' },
      { corte: 1, componentType: 'TRABAJOS' },
    ]);
    expect(reporte.avisos.join(' ')).toContain('cortes 2 y 3');
    expect(reporte.filas[0]).toMatchObject({ cedula: '100000001', nombre: 'PEREZ GOMEZ ANA MARIA', notas: [5, 4.1, 4.5] });
  });

  it('la cédula que pasó a la página siguiente vuelve a su fila', () => {
    expect(reporte.filas.map(f => f.cedula)).toEqual(['100000001', '100000002', '1000000003', '100000004']);
    expect(reporte.filas[2]!.avisos).toEqual([]);
  });

  it('la última fila no se queda con el pie de página como nombre', () => {
    expect(reporte.filas[3]!.nombre).toBe('ROJAS LEON DANIEL');
    expect(reporte.filas).toHaveLength(4);
  });

  it('NP y una nota fuera de rango no se importan, se avisan', () => {
    expect(reporte.filas[1]!.notas).toEqual([5, null, 3]);
    expect(reporte.filas[1]!.avisos.join(' ')).toContain('no presentó');
    // Un «45» suele ser un 4.5 sin punto: no se recorta a 5.
    expect(reporte.filas[3]!.notas).toEqual([5, null, 4]);
    expect(reporte.filas[3]!.avisos.join(' ')).toContain('fuera del rango');
  });

  it('una celda vacía no corre las notas a la columna de al lado', () => {
    const elementos = [
      ...cabecera(),
      ...fila(1, 932, 'PEREZ GOMEZ ANA MARIA', SOLO_CORTE_1('5.0', '4.1', '4.5')).filter(e => e.texto !== '4.1'),
      ...fila(2, 906, 'DIAZ CASTRO BRUNO', SOLO_CORTE_1('5.0', '3.9', '3.0')),
    ];
    const leidas = interpretarReporteAcademusoft(elementos).filas;
    expect(leidas[0]!.notas).toEqual([5, null, 4.5]);
    expect(leidas[1]!.notas).toEqual([5, 3.9, 3]);
  });

  it('notas de los tres cortes van a sus nueve columnas', () => {
    const elementos = [
      ...cabecera(),
      ...fila(1, 932, 'PEREZ GOMEZ ANA MARIA', ['5.0', '4.0', '3.0', '4.5', '3.5', '2.5', '4.2', '3.2', '2.2']),
    ];
    const completo = interpretarReporteAcademusoft(elementos);
    expect(completo.columnas.map(c => `${c.corte}${c.componentType[0]}`)).toEqual([
      '1A', '1P', '1T', '2A', '2P', '2T', '3A', '3P', '3T',
    ]);
    expect(completo.filas[0]!.notas).toEqual([5, 4, 3, 4.5, 3.5, 2.5, 4.2, 3.2, 2.2]);
    expect(completo.avisos).toEqual([]);
  });

  it('un reporte sin notas todavía lo dice en vez de proponer columnas vacías', () => {
    const vacio = interpretarReporteAcademusoft([
      ...cabecera(),
      ...fila(1, 932, 'PEREZ GOMEZ ANA MARIA', Array(9).fill('-')),
    ]);
    expect(vacio.columnas).toEqual([]);
    expect(vacio.avisos).toContain('El reporte no trae ninguna nota todavía.');
  });
});
