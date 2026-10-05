/**
 * Servicio de la cola de envíos.
 *
 * Es la parte con efectos del buzón de salida: guarda la cola, la sube en
 * orden, de una en una, y avisa de lo que pasa. Todas las decisiones (cómo se
 * funden dos escrituras, qué hacer con cada fallo) están en `domain/offline/` y
 * se prueban allí; esto solo las ejecuta. Las dependencias entran por
 * parámetro para poder probar el envío completo sin red ni disco.
 *
 * Reglas que no se negocian:
 *  - **De una en una y en orden.** Un corte no admite notas hasta que el
 *    anterior esté completo, así que el orden en que el docente las escribió es
 *    parte del significado.
 *  - **Nada se descarta solo.** Un rechazo del servidor deja la entrada
 *    `fallida`, a la vista, con su motivo.
 *  - **Reenviar es seguro.** El servidor escribe por clave natural; una entrada
 *    que quedó «enviando» al cerrar la aplicación simplemente se repite.
 */
import { AppError, toAppError } from '@/core/api/errors';
import {
  clasificarFallo,
  type ErrorDeEnvio,
  type Veredicto,
} from '@/domain/offline/clasificacion';
import {
  crearEntradaDeBorrado,
  crearEntradaDeClase,
  crearEntradaDeNota,
  descartarNotaPendiente,
  encolar,
  esNotaPendiente,
  marcarEnviando,
  marcarFallida,
  marcarPendiente,
  marcarReintento,
  proximaEspera,
  quitarEntrada,
  recuperarTrasReinicio,
  reiniciarEntrada,
  siguienteEnviable,
  type ClaseAsistencia,
  type OutboxEntry,
  type RegistroAsistencia,
} from '@/domain/offline/outbox';
import type { GradeInput } from '@/domain/schemas/grades';
import type { AlmacenDeCola } from '@/infrastructure/offline/almacenes';
import { useOutbox } from '@/state/outbox.store';

export type ResultadoEnvio = {
  /** Verdadero si quedó en la cola (sin conexión, o el servidor aún no lo recibió). */
  enCola: boolean;
};

export type DependenciasDeOutbox = {
  almacen: AlmacenDeCola;
  /** Sube UNA entrada. Lanza si el servidor la rechaza o no contesta. */
  enviar: (entrada: OutboxEntry) => Promise<void>;
  enLinea: () => boolean;
  ahora: () => number;
  nuevoId: () => string;
  /** Antes de cada tanda: renovar el token una sola vez en vez de dejar que falle la primera. */
  antesDeEnviar: () => Promise<void>;
  /** Tras subir algo: refrescar lo que se ve. */
  alTerminar: () => Promise<void>;
  /** Un envío no encontró servidor. */
  alFallarLaRed: () => void;
  avisar: {
    exito: (titulo: string, descripcion?: string) => void;
    error: (titulo: string, descripcion?: string) => void;
  };
};

/** Cuánto espera quien guardó algo estando en línea antes de darlo por «en cola». */
export const ESPERA_DE_CONFIRMACION_MS = 10_000;
/** Aunque nada lo pida, no se deja pasar tanto sin mirar si hay algo que subir. */
const MIN_ESPERA_PROGRAMADA_MS = 1_000;

/** Un fallo cualquiera, con la forma que entiende el clasificador. */
export function aErrorDeEnvio(error: unknown): ErrorDeEnvio {
  const app = toAppError(error);
  return {
    kind: app.kind,
    ...(app.status !== undefined ? { status: app.status } : {}),
    ...(app.codigo ? { codigo: app.codigo } : {}),
    mensaje: app.message,
    ...(app.retryAfterMs !== undefined ? { retryAfterMs: app.retryAfterMs } : {}),
  };
}

export function crearServicioDeOutbox(deps: DependenciasDeOutbox) {
  let userId: string | null = null;
  let drenando: Promise<void> | null = null;
  let repetir = false;
  let guardado: Promise<void> = Promise.resolve();
  let temporizador: ReturnType<typeof setTimeout> | null = null;
  /** Entradas que alguien está esperando: ellas ya reciben el error por su propia vía. */
  const esperadas = new Set<string>();

  const leer = () => useOutbox.getState().entradas;

  function escribir(siguiente: OutboxEntry[]): void {
    useOutbox.setState({ entradas: siguiente });
    const dueno = userId;
    if (!dueno) return;
    guardado = guardado
      .then(() => deps.almacen.guardar(dueno, siguiente))
      .catch(() => undefined);
  }

  function exigirSesion(): string {
    if (!userId) throw new AppError('unauthorized', 'Inicia sesión para guardar cambios.');
    return userId;
  }

  // ── Carga y descarga ──────────────────────────────────────────────────────

  async function cargarUsuario(id: string): Promise<void> {
    userId = id;
    const { entradas, descartadas } = await deps.almacen
      .cargar(id)
      .catch(() => ({ entradas: [] as OutboxEntry[], descartadas: 0 }));
    if (userId !== id) return;
    // Lo que se escribió antes de que terminara la carga no se pierde.
    const previas = leer().filter((e) => e.userId === id);
    useOutbox.setState({ entradas: [...recuperarTrasReinicio(entradas), ...previas], recientes: [] });
    if (descartadas > 0) {
      deps.avisar.error(
        'Algunos cambios guardados no se pudieron leer',
        `${descartadas} no se recuperaron. Revisa que las notas y la asistencia recientes estén completas.`,
      );
    }
    void drenar();
  }

  /** Suelta al usuario (cerrar o perder la sesión). La cola queda en disco. */
  function descargar(): void {
    userId = null;
    if (temporizador) clearTimeout(temporizador);
    temporizador = null;
    useOutbox.setState({ entradas: [], recientes: [], drenando: false });
  }

  // ── Escribir ──────────────────────────────────────────────────────────────

  function esperar(id: string, intentosBase: number): Promise<ResultadoEnvio> {
    return new Promise((resolver, rechazar) => {
      esperadas.add(id);
      let desuscribir: () => void = () => undefined;
      const limite = setTimeout(() => terminar(() => resolver({ enCola: true })), ESPERA_DE_CONFIRMACION_MS);

      function terminar(accion: () => void): void {
        esperadas.delete(id);
        clearTimeout(limite);
        desuscribir();
        accion();
      }

      function revisar(entradas: OutboxEntry[]): void {
        const entrada = entradas.find((e) => e.id === id);
        // Ya no está en la cola: subió.
        if (!entrada) return terminar(() => resolver({ enCola: false }));
        if (entrada.estado === 'fallida') {
          const motivo = entrada.ultimoError ?? 'El servidor rechazó el cambio.';
          return terminar(() => rechazar(new AppError('validation', motivo)));
        }
        // Se intentó, no hubo respuesta y espera su turno: queda en cola.
        if (entrada.estado === 'pendiente' && entrada.intentos > intentosBase) {
          return terminar(() => resolver({ enCola: true }));
        }
      }

      desuscribir = useOutbox.subscribe((estado) => revisar(estado.entradas));
      revisar(leer());
    });
  }

  async function guardarEntrada(nueva: OutboxEntry): Promise<ResultadoEnvio> {
    const { entradas, entrada } = encolar(leer(), nueva);
    escribir(entradas);
    if (!entrada) return { enCola: false };
    if (!deps.enLinea()) return { enCola: true };
    const esperando = esperar(entrada.id, entrada.intentos);
    void drenar();
    return esperando;
  }

  const contexto = (dueno: string) => ({ userId: dueno, id: deps.nuevoId(), ahora: deps.ahora() });

  async function guardarNota(input: GradeInput): Promise<ResultadoEnvio> {
    return guardarEntrada(crearEntradaDeNota(input, contexto(exigirSesion())));
  }

  /**
   * Borra una nota. Si solo existe en la cola, se quita de la cola y no viaja
   * nada; si ya está en el servidor, se encola el borrado.
   */
  async function borrarNota(id: string, etiqueta: string): Promise<ResultadoEnvio> {
    const dueno = exigirSesion();
    if (esNotaPendiente(id)) {
      const { entradas, quitada } = descartarNotaPendiente(leer(), id);
      if (!quitada) {
        throw new AppError(
          'conflict',
          'Esa nota se está enviando en este momento. Espera un instante y bórrala de nuevo.',
        );
      }
      escribir(entradas);
      return { enCola: false };
    }
    return guardarEntrada(crearEntradaDeBorrado(id, etiqueta, contexto(dueno)));
  }

  async function guardarClase(
    clase: ClaseAsistencia,
    registros: RegistroAsistencia[],
  ): Promise<ResultadoEnvio> {
    return guardarEntrada(crearEntradaDeClase(clase, registros, contexto(exigirSesion())));
  }

  // ── Gestión desde la lista ────────────────────────────────────────────────

  function reintentar(id: string): void {
    escribir(reiniciarEntrada(leer(), id));
    void drenar();
  }

  function reintentarFallidas(): void {
    let entradas = leer();
    for (const entrada of entradas) {
      if (entrada.estado === 'fallida') entradas = reiniciarEntrada(entradas, entrada.id);
    }
    escribir(entradas);
    void drenar();
  }

  /** Descarta una entrada. Una que va de camino no se puede descartar. */
  function descartar(id: string): boolean {
    const entrada = leer().find((e) => e.id === id);
    if (!entrada || entrada.estado === 'enviando') return false;
    escribir(quitarEntrada(leer(), id));
    return true;
  }

  // ── Envío ─────────────────────────────────────────────────────────────────

  function drenar(): Promise<void> {
    if (!userId) return Promise.resolve();
    if (drenando) {
      repetir = true;
      return drenando;
    }
    // `drenando` se suelta en el MISMO paso en que el bucle decide no repetir:
    // soltarlo en un `.finally` dejaba una rendija en la que un `drenar()` nuevo
    // veía una tanda «en curso» que ya no iba a mirar su aviso, y la entrada
    // recién guardada se quedaba sin enviar.
    drenando = (async () => {
      try {
        do {
          repetir = false;
          await pasada();
        } while (repetir);
      } finally {
        drenando = null;
        programar();
      }
    })();
    return drenando;
  }

  function entregada(entrada: OutboxEntry): void {
    escribir(quitarEntrada(leer(), entrada.id));
    useOutbox.setState((estado) => ({ recientes: [...estado.recientes, entrada] }));
  }

  /** Aplica el veredicto. Devuelve `true` si hay que dejar de enviar por ahora. */
  function aplicar(
    entrada: OutboxEntry,
    veredicto: Veredicto,
    aplazadas: Set<string>,
  ): { detener: boolean; avanzo: boolean } {
    switch (veredicto.tipo) {
      case 'exito':
        entregada(entrada);
        return { detener: false, avanzo: true };
      case 'reintentar':
        escribir(
          marcarReintento(leer(), entrada.id, veredicto.mensaje, deps.ahora() + veredicto.esperaMs),
        );
        if (veredicto.red) deps.alFallarLaRed();
        return { detener: veredicto.detener, avanzo: false };
      case 'pausar':
        escribir(marcarPendiente(leer(), entrada.id, null));
        return { detener: true, avanzo: false };
      case 'aplazar':
        aplazadas.add(entrada.id);
        escribir(marcarPendiente(leer(), entrada.id, veredicto.mensaje));
        return { detener: false, avanzo: false };
      case 'fallida':
        fallar(entrada, veredicto.mensaje);
        return { detener: false, avanzo: false };
    }
  }

  function fallar(entrada: OutboxEntry, mensaje: string): void {
    escribir(marcarFallida(leer(), entrada.id, mensaje));
    // Quien esperaba este guardado ya recibe el error en su propio aviso.
    if (!esperadas.has(entrada.id)) deps.avisar.error(`No se pudo enviar: ${entrada.resumen}`, mensaje);
  }

  async function pasada(): Promise<void> {
    if (!deps.enLinea() || !siguienteEnviable(leer(), deps.ahora())) return;

    const dueno = userId;
    let entregadas = 0;
    let entregadasSinEsperar = 0;
    useOutbox.setState({ drenando: true });

    try {
      await deps.antesDeEnviar().catch(() => undefined);

      // Cada vuelta recorre la cola en orden. Una entrada que choca con un corte
      // aún bloqueado se deja para la vuelta siguiente, pero solo si en esta
      // algo SE ENVIÓ: sin progreso, lo que la bloquea no va a cambiar.
      for (;;) {
        const aplazadas = new Set<string>();
        let progreso = 0;
        let detener = false;

        for (;;) {
          if (userId !== dueno || !deps.enLinea()) {
            detener = true;
            break;
          }
          const entrada = siguienteEnviable(leer(), deps.ahora(), aplazadas);
          if (!entrada) break;

          escribir(marcarEnviando(leer(), entrada.id));
          const esperada = esperadas.has(entrada.id);
          try {
            await deps.enviar(entrada);
            entregada(entrada);
            progreso += 1;
            entregadas += 1;
            if (!esperada) entregadasSinEsperar += 1;
          } catch (error) {
            const veredicto = clasificarFallo(aErrorDeEnvio(error), {
              kind: entrada.kind,
              intentos: entrada.intentos,
            });
            const resultado = aplicar(entrada, veredicto, aplazadas);
            if (resultado.avanzo) {
              progreso += 1;
              entregadas += 1;
              if (!esperada) entregadasSinEsperar += 1;
            }
            if (resultado.detener) {
              detener = true;
              break;
            }
          }
        }

        if (detener || aplazadas.size === 0) break;
        if (progreso === 0) {
          for (const id of aplazadas) {
            const entrada = leer().find((e) => e.id === id);
            if (entrada) fallar(entrada, entrada.ultimoError ?? 'El corte anterior aún no está completo.');
          }
          break;
        }
      }
    } finally {
      useOutbox.setState({ drenando: false });
    }

    if (entregadas > 0) {
      await deps.alTerminar().catch(() => undefined);
      useOutbox.setState({ recientes: [] });
      if (entregadasSinEsperar > 0) {
        deps.avisar.exito(
          entregadasSinEsperar === 1
            ? 'Se envió 1 cambio guardado sin conexión'
            : `Se enviaron ${entregadasSinEsperar} cambios guardados sin conexión`,
        );
      }
    }
  }

  /** Despierta al drenaje cuando venza la espera de la próxima entrada. */
  function programar(): void {
    if (temporizador) clearTimeout(temporizador);
    temporizador = null;
    if (!userId) return;
    const cuando = proximaEspera(leer());
    if (cuando === null) return;
    temporizador = setTimeout(
      () => void drenar(),
      Math.max(MIN_ESPERA_PROGRAMADA_MS, cuando - deps.ahora()),
    );
  }

  return {
    cargarUsuario,
    descargar,
    guardarNota,
    borrarNota,
    guardarClase,
    reintentar,
    reintentarFallidas,
    descartar,
    drenar,
  };
}

export type ServicioDeOutbox = ReturnType<typeof crearServicioDeOutbox>;
