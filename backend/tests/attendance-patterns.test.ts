import { describe, expect, it } from 'vitest';
import {
  UMBRALES_PATRON,
  claveDePatron,
  detectarPatrones,
  type ClaseAsistida,
} from '../src/domains/attendance/patterns.js';

/**
 * El porcentaje de asistencia sirve para el riesgo de fin de semestre; no
 * sirve para detectar a tiempo. Un estudiante con 78 % que faltó a las tres
 * últimas clases seguidas está abandonando la materia, y el porcentaje —que
 * sigue por encima del umbral— no lo dice. Estas pruebas fijan que la FORMA de
 * las faltas se lea correctamente.
 */

const DIA = 86_400_000;
const BASE = new Date('2026-03-02T14:00:00.000Z').getTime();

/** Construye una serie a partir de una cadena: `P` presente, `A` ausente. */
function serie(patron: string, opciones: { tarde?: number[]; duracion?: number } = {}): ClaseAsistida[] {
  return [...patron].map((letra, indice) => ({
    date: new Date(BASE + indice * 7 * DIA),
    present: letra === 'P',
    durationMinutes: opciones.duracion ?? 90,
    lateMinutes: opciones.tarde?.[indice] ?? 0,
  }));
}

const patronesDe = (clases: ClaseAsistida[]) => detectarPatrones(clases).map(d => d.patron);

describe('ausencias consecutivas', () => {
  it('dos seguidas al final abren un caso medio', () => {
    const detecciones = detectarPatrones(serie('PPPAA'));
    expect(detecciones.map(d => d.patron)).toContain('AUSENCIAS_CONSECUTIVAS_2');
    expect(detecciones[0].severidad).toBe('MEDIA');
  });

  it('tres o más lo convierten en grave, y NO emiten también el de dos', () => {
    // Emitir los dos duplicaría el caso y la notificación del mismo hecho, con
    // dos claves distintas que el dedupe no relaciona.
    const detectados = patronesDe(serie('PPAAA'));
    expect(detectados).toContain('AUSENCIAS_CONSECUTIVAS_3');
    expect(detectados).not.toContain('AUSENCIAS_CONSECUTIVAS_2');
  });

  it('una racha antigua que ya terminó no abre caso', () => {
    // Abrir un caso en mayo por una racha de marzo que se resolvió enseñaría a
    // ignorar los casos.
    const detectados = patronesDe(serie('AAAPP'));
    expect(detectados).not.toContain('AUSENCIAS_CONSECUTIVAS_2');
    expect(detectados).not.toContain('AUSENCIAS_CONSECUTIVAS_3');
  });

  it('una sola falta no es un patrón', () => {
    expect(patronesDe(serie('PPPPA'))).toEqual([]);
  });
});

describe('llegadas tarde repetidas', () => {
  it('necesita el mínimo de tardanzas por encima del umbral de minutos', () => {
    const dosTardanzas = serie('PPPP', { tarde: [15, 15, 0, 0] });
    expect(patronesDe(dosTardanzas)).not.toContain('TARDANZAS_REPETIDAS');

    const tresTardanzas = serie('PPPP', { tarde: [15, 15, 20, 0] });
    expect(patronesDe(tresTardanzas)).toContain('TARDANZAS_REPETIDAS');
  });

  it('un retraso por debajo del umbral no cuenta', () => {
    const menores = serie('PPPP', {
      tarde: Array(4).fill(UMBRALES_PATRON.MINUTOS_TARDE - 1),
    });
    expect(patronesDe(menores)).not.toContain('TARDANZAS_REPETIDAS');
  });

  it('una ausencia con retraso registrado no cuenta como tardanza', () => {
    // Si no vino, no llegó tarde. Contarlo inflaría el patrón equivocado.
    const ausentes = serie('AAAA', { tarde: [30, 30, 30, 30] });
    expect(patronesDe(ausentes)).not.toContain('TARDANZAS_REPETIDAS');
  });
});

describe('caída reciente', () => {
  it('detecta el desplome de las últimas clases frente al historial', () => {
    const clases = serie('PPPPPPAAAA');
    const detecciones = detectarPatrones(clases);
    const caida = detecciones.find(d => d.patron === 'CAIDA_RECIENTE');
    expect(caida).toBeDefined();
    expect(Number(caida!.datos.antes)).toBeGreaterThan(Number(caida!.datos.ahora));
  });

  it('no compara sin historial suficiente', () => {
    // Dos clases no son una tendencia, y avisar por ellas llenaría la bandeja
    // la primera semana de cada semestre.
    expect(patronesDe(serie('PAA'))).not.toContain('CAIDA_RECIENTE');
  });

  it('una asistencia constante no dispara caída', () => {
    expect(patronesDe(serie('PPPPPPPPPP'))).not.toContain('CAIDA_RECIENTE');
  });
});

describe('asistencia parcial repetida', () => {
  it('cuenta solo lo que pierde al menos la fracción declarada de la clase', () => {
    // Diez minutos tarde en una clase de tres horas no es asistencia parcial;
    // cuarenta en una de noventa minutos, sí.
    const largas = serie('PPPP', { tarde: [30, 30, 30, 30], duracion: 180 });
    expect(patronesDe(largas)).not.toContain('ASISTENCIA_PARCIAL_REPETIDA');

    const cortas = serie('PPPP', { tarde: [30, 30, 30, 30], duracion: 90 });
    expect(patronesDe(cortas)).toContain('ASISTENCIA_PARCIAL_REPETIDA');
  });
});

describe('robustez de la entrada', () => {
  it('ordena las clases: no confía en el orden del llamador', () => {
    // Confiar en el orden funciona hasta que alguien cambia un `sort` en una
    // consulta y las rachas empiezan a contarse al revés sin que nada falle.
    const ordenadas = serie('PPAAA');
    const desordenadas = [...ordenadas].reverse();
    expect(patronesDe(desordenadas)).toEqual(patronesDe(ordenadas));
  });

  it('una serie vacía no detecta nada', () => {
    expect(detectarPatrones([])).toEqual([]);
  });

  it('un registro sin lateMinutes cuenta como puntual', () => {
    // Compatibilidad con la asistencia anterior a la captura del retraso.
    const antiguos: ClaseAsistida[] = [
      { date: new Date(BASE), present: true },
      { date: new Date(BASE + DIA), present: true },
      { date: new Date(BASE + 2 * DIA), present: true },
      { date: new Date(BASE + 3 * DIA), present: true },
    ];
    expect(detectarPatrones(antiguos)).toEqual([]);
  });
});

describe('clave de deduplicación', () => {
  it('identifica el hecho seguido y no la fecha de detección', () => {
    // Con la fecha dentro, cada pasada crearía un aviso nuevo del mismo caso.
    const a = claveDePatron('e1', 'm1', '2026-1', 'AUSENCIAS_CONSECUTIVAS_3');
    const b = claveDePatron('e1', 'm1', '2026-1', 'AUSENCIAS_CONSECUTIVAS_3');
    expect(a).toBe(b);
    expect(a).not.toBe(claveDePatron('e1', 'm2', '2026-1', 'AUSENCIAS_CONSECUTIVAS_3'));
  });
});
