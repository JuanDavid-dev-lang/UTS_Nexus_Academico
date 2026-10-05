import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/core/api/errors';
import { crearServicioDeOutbox, type DependenciasDeOutbox } from '@/core/offline/outbox.service';
import type { OutboxEntry } from '@/domain/offline/outbox';
import type { GradeInput } from '@/domain/schemas/grades';
import { useOutbox } from '@/state/outbox.store';

const nota = (corte: 1 | 2 | 3, label: string): GradeInput => ({
  studentId: 'est1',
  subjectId: 'mat1',
  teacherId: 'doc1',
  corte,
  componentType: 'TRABAJOS',
  label,
  score: 4,
  period: '2026-2',
});

function montar(cambios: Partial<DependenciasDeOutbox> = {}) {
  let contador = 0;
  let guardado: OutboxEntry[] = [];
  const enviados: string[] = [];
  const deps: DependenciasDeOutbox = {
    almacen: {
      cargar: async () => ({ entradas: guardado, descartadas: 0 }),
      guardar: async (_id, entradas) => {
        guardado = entradas;
      },
    },
    enviar: vi.fn(async (entrada: OutboxEntry) => {
      enviados.push(entrada.resumen);
    }),
    enLinea: () => true,
    ahora: () => 1_000_000,
    nuevoId: () => `id${++contador}`,
    antesDeEnviar: async () => undefined,
    alTerminar: async () => undefined,
    alFallarLaRed: vi.fn(),
    avisar: { exito: vi.fn(), error: vi.fn() },
    ...cambios,
  };
  return { servicio: crearServicioDeOutbox(deps), deps, enviados, disco: () => guardado };
}

beforeEach(() => {
  useOutbox.setState({ entradas: [], recientes: [], drenando: false });
});

describe('servicio de la cola de envíos', () => {
  it('sin conexión guarda y no envía; al volver sube en el orden en que se hicieron', async () => {
    let enLinea = false;
    const { servicio, enviados, disco } = montar({ enLinea: () => enLinea });
    await servicio.cargarUsuario('doc1');

    const r1 = await servicio.guardarNota(nota(1, 'A'));
    const r2 = await servicio.guardarNota(nota(1, 'B'));
    expect([r1.enCola, r2.enCola]).toEqual([true, true]);
    expect(enviados).toEqual([]);
    expect(disco()).toHaveLength(2);

    enLinea = true;
    await servicio.drenar();

    expect(enviados).toEqual(['Nota «A»: 4', 'Nota «B»: 4']);
    expect(useOutbox.getState().entradas).toEqual([]);
    // La escritura a disco va encadenada y es asíncrona.
    await new Promise((resolver) => setTimeout(resolver, 0));
    expect(disco()).toEqual([]);
  });

  it('con conexión, guardar espera a que el servidor confirme', async () => {
    const { servicio, enviados } = montar();
    await servicio.cargarUsuario('doc1');
    const resultado = await servicio.guardarNota(nota(1, 'A'));
    expect(resultado.enCola).toBe(false);
    expect(enviados).toHaveLength(1);
  });

  it('un fallo de red deja la entrada pendiente, avisa a la conectividad y detiene la tanda', async () => {
    const enviar = vi.fn(async () => {
      throw new AppError('network', 'sin red');
    });
    // Como en la aplicación: un fallo de red marca «sin conexión».
    let enLinea = true;
    const { servicio, deps } = montar({
      enviar,
      enLinea: () => enLinea,
      alFallarLaRed: vi.fn(() => {
        enLinea = false;
      }),
    });
    await servicio.cargarUsuario('doc1');

    const resultado = await servicio.guardarNota(nota(1, 'A'));
    await servicio.guardarNota(nota(1, 'B'));

    expect(resultado.enCola).toBe(true);
    expect(deps.alFallarLaRed).toHaveBeenCalled();
    const entradas = useOutbox.getState().entradas;
    expect(entradas).toHaveLength(2);
    expect(entradas.every((e) => e.estado === 'pendiente')).toBe(true);
    expect(entradas[0]!.proximoIntento).toBeGreaterThan(1_000_000);
    // La primera falló por red; la tanda se detuvo sin probar la segunda.
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it('un rechazo del servidor deja la entrada fallida, a la vista, y sigue con las demás', async () => {
    const enviar = vi.fn(async (entrada: OutboxEntry) => {
      if (entrada.resumen.includes('«A»')) {
        throw new AppError('conflict', 'El periodo está cerrado', 409, null, { codigo: 'PERIODO_BLOQUEADO' });
      }
    });
    let enLinea = false;
    const { servicio, deps } = montar({ enviar, enLinea: () => enLinea });
    await servicio.cargarUsuario('doc1');
    await servicio.guardarNota(nota(1, 'A'));
    await servicio.guardarNota(nota(1, 'B'));
    enLinea = true;
    await servicio.drenar();

    expect(deps.avisar.error).toHaveBeenCalledTimes(1);
    const entradas = useOutbox.getState().entradas;
    expect(entradas).toHaveLength(1);
    expect(entradas[0]).toMatchObject({ estado: 'fallida', ultimoError: 'El periodo está cerrado' });
  });

  it('CORTE_BLOQUEADO espera a que algo suba antes y entonces pasa', async () => {
    let corte1Subido = false;
    const enviar = vi.fn(async (entrada: OutboxEntry) => {
      const esCorte2 = entrada.body?.corte === 2;
      if (esCorte2 && !corte1Subido) {
        throw new AppError('conflict', 'Completa el corte 1', 409, null, { codigo: 'CORTE_BLOQUEADO' });
      }
      if (entrada.body?.corte === 1) corte1Subido = true;
    });
    let enLinea = false;
    const { servicio } = montar({ enviar, enLinea: () => enLinea });
    await servicio.cargarUsuario('doc1');
    // El docente capturó el corte 2 antes que el 1 (p. ej. en otro equipo).
    await servicio.guardarNota(nota(2, 'C2'));
    await servicio.guardarNota(nota(1, 'C1'));

    enLinea = true;
    await servicio.drenar();

    expect(useOutbox.getState().entradas).toEqual([]);
    expect(corte1Subido).toBe(true);
  });

  it('CORTE_BLOQUEADO sin progreso pasa a fallida con el motivo', async () => {
    const enviar = vi.fn(async () => {
      throw new AppError('conflict', 'Completa el corte 1', 409, null, { codigo: 'CORTE_BLOQUEADO' });
    });
    let enLinea = false;
    const { servicio } = montar({ enviar, enLinea: () => enLinea });
    await servicio.cargarUsuario('doc1');
    await servicio.guardarNota(nota(2, 'C2'));
    enLinea = true;
    await servicio.drenar();

    expect(useOutbox.getState().entradas[0]).toMatchObject({
      estado: 'fallida',
      ultimoError: 'Completa el corte 1',
    });
  });

  it('un 401 pausa el envío y conserva todo', async () => {
    const enviar = vi.fn(async () => {
      throw new AppError('unauthorized', 'sesión', 401);
    });
    let enLinea = false;
    const { servicio } = montar({ enviar, enLinea: () => enLinea });
    await servicio.cargarUsuario('doc1');
    await servicio.guardarNota(nota(1, 'A'));
    await servicio.guardarNota(nota(1, 'B'));
    enLinea = true;
    await servicio.drenar();

    expect(enviar).toHaveBeenCalledTimes(1);
    expect(useOutbox.getState().entradas.map((e) => e.estado)).toEqual(['pendiente', 'pendiente']);
  });

  it('una entrada que quedó «enviando» al cerrar la app se recupera como pendiente', async () => {
    const { servicio, enviados } = montar({ enLinea: () => false });
    await servicio.cargarUsuario('doc1');
    await servicio.guardarNota(nota(1, 'A'));
    const [entrada] = useOutbox.getState().entradas;

    const recarga = montar({ enLinea: () => false });
    recarga.deps.almacen.cargar = async () => ({
      entradas: [{ ...entrada!, estado: 'enviando' }],
      descartadas: 0,
    });
    useOutbox.setState({ entradas: [] });
    await recarga.servicio.cargarUsuario('doc1');

    expect(useOutbox.getState().entradas[0]!.estado).toBe('pendiente');
    expect(enviados).toEqual([]);
  });
});
