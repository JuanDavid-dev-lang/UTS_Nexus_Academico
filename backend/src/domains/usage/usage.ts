/**
 * Uso de la aplicación: cuánto se usa y quién la usa más. **Lógica pura, sin
 * I/O.** Es estadística interna para ADMIN; no se publica ni se enseña a nadie
 * más (ver `docs/USO_Y_PRIVACIDAD.md`).
 *
 * Tres decisiones viven aquí:
 *
 * 1. **Qué cliente es.** El canal del token (`app | web`) ya lo decidió el
 *    servidor al iniciar sesión por el `Origin`. Dentro de `app`, el escritorio
 *    llega con el `Origin` fijo de Tauri y el móvil no manda ninguno: su
 *    cliente HTTP es `dart:io`, cuyo `User-Agent` por defecto empieza por
 *    `Dart/`.
 * 2. **Qué es un minuto activo.** El día del campus se parte en franjas de 5
 *    minutos; una franja con al menos una petición cuenta 5 minutos. Se guarda
 *    el *número de franja*, no un contador, así que dos instancias del backend
 *    —o dos clientes de la misma persona a la vez— no cuentan dos veces el
 *    mismo rato: `$addToSet` es idempotente.
 * 3. **Cómo se ordena el ranking.** Por minutos, luego días, luego peticiones.
 *    Las peticiones solas premian a quien tiene más pantallas abiertas, no a
 *    quien más trabaja con la aplicación.
 */
import { diaDeCampus } from '../attendance/class-date.js';

export type ClienteDeUso = 'escritorio' | 'web' | 'movil';
export const CLIENTES_DE_USO: readonly ClienteDeUso[] = ['escritorio', 'web', 'movil'];

/** Minutos por franja. 288 franjas por día. */
export const MINUTOS_POR_FRANJA = 5;
export const FRANJAS_POR_DIA = (24 * 60) / MINUTOS_POR_FRANJA;

/** Días que se conservan los registros (TTL sobre `ultimaActividad`). */
export const DIAS_DE_RETENCION = 400;

/** Rango máximo que se puede pedir de una vez en el resumen. */
export const DIAS_MAXIMOS_DE_CONSULTA = 400;

const MS_MINUTO = 60_000;
const MS_DIA = 24 * 60 * MS_MINUTO;

export interface DatosDeCliente {
  canal?: 'app' | 'web';
  origen?: string;
  userAgent?: string;
}

/**
 * Qué cliente hizo la petición. Sin `Origin` y sin `Dart/` (un script, una
 * herramienta) se cuenta como móvil: es lo que llega sin navegador, y meterlo
 * en un cuarto cubo que nadie mira no aclara nada.
 */
export function clienteDePeticion({ canal, origen, userAgent }: DatosDeCliente): ClienteDeUso {
  if (canal === 'web') return 'web';
  if (userAgent && /^Dart\//i.test(userAgent)) return 'movil';
  return origen ? 'escritorio' : 'movil';
}

/** Franja (0..287) del día del campus en la que cae un instante. */
export function franjaDelDia(instante: Date, offsetMinutos: number): number {
  const local = instante.getTime() + offsetMinutos * MS_MINUTO;
  const minutoDelDia = Math.floor((((local % MS_DIA) + MS_DIA) % MS_DIA) / MS_MINUTO);
  return Math.floor(minutoDelDia / MINUTOS_POR_FRANJA);
}

export interface EventoDeUso {
  userId: string;
  rol: string;
  cliente: ClienteDeUso;
  instante: Date;
}

/** Lo acumulado en memoria para una persona en un día, listo para volcar. */
export interface EntradaDeUso {
  userId: string;
  dia: string;
  rol: string;
  peticiones: number;
  porCliente: Record<ClienteDeUso, number>;
  franjas: number[];
  primera: Date;
  ultima: Date;
}

interface EntradaMutable {
  userId: string;
  dia: string;
  rol: string;
  peticiones: number;
  porCliente: Record<ClienteDeUso, number>;
  franjas: Set<number>;
  primera: Date;
  ultima: Date;
}

/**
 * Acumulador en memoria. Una entrada por (persona, día): el tamaño lo acota el
 * número de personas activas entre dos volcados, no el número de peticiones.
 *
 * Es mutable a propósito —se llama en cada petición y copiar el mapa entero
 * cada vez sería absurdo—, pero no sale de aquí: `vaciar()` devuelve copias y
 * deja el acumulador limpio.
 */
export class AcumuladorDeUso {
  private entradas = new Map<string, EntradaMutable>();

  constructor(private readonly offsetMinutos: number) {}

  get tamano(): number {
    return this.entradas.size;
  }

  registrar(evento: EventoDeUso): void {
    const dia = diaDeCampus(evento.instante, this.offsetMinutos);
    const clave = `${evento.userId}|${dia}`;
    let entrada = this.entradas.get(clave);
    if (!entrada) {
      entrada = {
        userId: evento.userId,
        dia,
        rol: evento.rol,
        peticiones: 0,
        porCliente: { escritorio: 0, web: 0, movil: 0 },
        franjas: new Set(),
        primera: evento.instante,
        ultima: evento.instante,
      };
      this.entradas.set(clave, entrada);
    }
    entrada.rol = evento.rol;
    entrada.peticiones += 1;
    entrada.porCliente[evento.cliente] += 1;
    entrada.franjas.add(franjaDelDia(evento.instante, this.offsetMinutos));
    if (evento.instante < entrada.primera) entrada.primera = evento.instante;
    if (evento.instante > entrada.ultima) entrada.ultima = evento.instante;
  }

  /** Devuelve lo acumulado y vacía el acumulador. */
  vaciar(): EntradaDeUso[] {
    const salida = [...this.entradas.values()].map((e) => ({
      userId: e.userId,
      dia: e.dia,
      rol: e.rol,
      peticiones: e.peticiones,
      porCliente: { ...e.porCliente },
      franjas: [...e.franjas].sort((a, b) => a - b),
      primera: e.primera,
      ultima: e.ultima,
    }));
    this.entradas = new Map();
    return salida;
  }

  /** Vuelve a meter entradas que no se pudieron volcar (fallo de red). */
  devolver(entradas: readonly EntradaDeUso[]): void {
    for (const e of entradas) {
      const clave = `${e.userId}|${e.dia}`;
      const actual = this.entradas.get(clave);
      if (!actual) {
        this.entradas.set(clave, { ...e, porCliente: { ...e.porCliente }, franjas: new Set(e.franjas) });
        continue;
      }
      actual.peticiones += e.peticiones;
      for (const c of CLIENTES_DE_USO) actual.porCliente[c] += e.porCliente[c];
      e.franjas.forEach((f) => actual.franjas.add(f));
      if (e.primera < actual.primera) actual.primera = e.primera;
      if (e.ultima > actual.ultima) actual.ultima = e.ultima;
    }
  }
}

// ── Lectura ────────────────────────────────────────────────────────────────

/** Días `AAAA-MM-DD` de `desde` a `hasta`, ambos incluidos. */
export function diasDelRango(desde: string, hasta: string): string[] {
  const dias: string[] = [];
  const fin = Date.parse(`${hasta}T00:00:00Z`);
  for (let t = Date.parse(`${desde}T00:00:00Z`); t <= fin && dias.length <= DIAS_MAXIMOS_DE_CONSULTA; t += MS_DIA) {
    dias.push(new Date(t).toISOString().slice(0, 10));
  }
  return dias;
}

/** Suma (o resta) días a un `AAAA-MM-DD`. */
export function sumarDias(dia: string, n: number): string {
  return new Date(Date.parse(`${dia}T00:00:00Z`) + n * MS_DIA).toISOString().slice(0, 10);
}

/**
 * Activos por día con los días sin actividad en cero. Sin rellenar, el gráfico
 * une dos días con actividad por encima de un fin de semana vacío y la línea
 * dice algo que no pasó.
 */
export function rellenarDias(
  filas: readonly { dia: string; usuarios: number }[],
  desde: string,
  hasta: string,
): { dia: string; usuarios: number }[] {
  const porDia = new Map(filas.map((f) => [f.dia, f.usuarios]));
  return diasDelRango(desde, hasta).map((dia) => ({ dia, usuarios: porDia.get(dia) ?? 0 }));
}

/**
 * Activos hoy, en 7 y en 30 días a partir del último día activo de cada
 * persona. «7 días» incluye hoy: son los siete días que terminan hoy.
 */
export function activosRecientes(
  ultimosDias: readonly string[],
  hoy: string,
): { hoy: number; semana: number; mes: number } {
  const desdeSemana = sumarDias(hoy, -6);
  const desdeMes = sumarDias(hoy, -29);
  return {
    hoy: ultimosDias.filter((d) => d === hoy).length,
    semana: ultimosDias.filter((d) => d >= desdeSemana && d <= hoy).length,
    mes: ultimosDias.filter((d) => d >= desdeMes && d <= hoy).length,
  };
}

export interface FilaRankingBruta {
  userId: string;
  diasActivos: number;
  franjas: number;
  peticiones: number;
  ultimaActividad: Date;
}

export interface FilaRanking extends Omit<FilaRankingBruta, 'franjas'> {
  posicion: number;
  minutos: number;
}

/** Ordena el ranking y numera la posición. Desempata por `userId`: estable entre páginas. */
export function ordenarRanking(filas: readonly FilaRankingBruta[]): FilaRanking[] {
  return [...filas]
    .sort(
      (a, b) =>
        b.franjas - a.franjas ||
        b.diasActivos - a.diasActivos ||
        b.peticiones - a.peticiones ||
        a.userId.localeCompare(b.userId),
    )
    .map(({ franjas, ...resto }, i) => ({ ...resto, posicion: i + 1, minutos: franjas * MINUTOS_POR_FRANJA }));
}

/** ¿Es `AAAA-MM-DD` un día real y el rango tiene sentido? */
export function validarRango(desde: string, hasta: string): string | null {
  const d = Date.parse(`${desde}T00:00:00Z`);
  const h = Date.parse(`${hasta}T00:00:00Z`);
  if (Number.isNaN(d) || Number.isNaN(h)) return 'Fecha inválida.';
  if (new Date(d).toISOString().slice(0, 10) !== desde || new Date(h).toISOString().slice(0, 10) !== hasta) {
    return 'Fecha inválida.';
  }
  if (d > h) return 'La fecha inicial es posterior a la final.';
  if ((h - d) / MS_DIA + 1 > DIAS_MAXIMOS_DE_CONSULTA) {
    return `El rango no puede pasar de ${DIAS_MAXIMOS_DE_CONSULTA} días.`;
  }
  return null;
}
