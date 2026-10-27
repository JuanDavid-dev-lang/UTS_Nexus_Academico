/**
 * Varias pestañas de la web con la misma sesión.
 *
 * «Duplicar pestaña» copia el `sessionStorage`, así que las dos pestañas tienen
 * el mismo refresh token. El servidor rota el token en cada renovación y trata
 * el reuso de uno ya canjeado como robo: revoca **todas** las sesiones. Una
 * pestaña renovaba, la otra renovaba más de 30 s después con el token viejo, y
 * las dos acababan en el inicio de sesión sin motivo aparente.
 *
 * Tres piezas lo evitan:
 *   - **Candado** (`navigator.locks`): una renovación a la vez entre pestañas.
 *   - **Aviso de rotación**: la que renueva publica el par nuevo y las que
 *     tenían el token anterior lo adoptan.
 *   - **Consulta antes de renovar**: una pestaña congelada en segundo plano que
 *     se perdió el aviso pregunta si alguien ya rotó su token.
 *
 * Solo se acepta un par si el token anterior es el propio: una pestaña con otra
 * sesión no adopta nada.
 */

export type ParDeTokens = { accessToken: string; refreshToken: string };

type Mensaje =
  | { tipo: 'rotado'; anterior: string; par: ParDeTokens }
  | { tipo: 'consulta'; id: string; token: string }
  | { tipo: 'respuesta'; id: string; par: ParDeTokens };

/** Lo que se usa de `BroadcastChannel`; las pruebas lo sustituyen. */
export type Canal = {
  postMessage(mensaje: Mensaje): void;
  addEventListener(tipo: 'message', oyente: (evento: { data: unknown }) => void): void;
};

export const ESPERA_CONSULTA_MS = 250;
const MAX_HISTORIAL = 20;

type Dependencias = {
  canal: Canal | null;
  leerPar: () => ParDeTokens | null;
  adoptar: (par: ParDeTokens) => Promise<void>;
};

export function crearCoordinador({ canal, leerPar, adoptar }: Dependencias) {
  // Tokens que esta pestaña ya dejó atrás: con ellos responde a una consulta.
  const historial: string[] = [];
  const pendientes = new Map<string, (par: ParDeTokens) => void>();

  function anotar(anterior: string): void {
    if (historial.includes(anterior)) return;
    historial.push(anterior);
    if (historial.length > MAX_HISTORIAL) historial.shift();
  }

  canal?.addEventListener('message', ({ data }) => {
    const mensaje = data as Mensaje | null;
    if (!mensaje || typeof mensaje !== 'object') return;
    const actual = leerPar();

    if (mensaje.tipo === 'rotado') {
      if (actual?.refreshToken !== mensaje.anterior) return;
      anotar(mensaje.anterior);
      void adoptar(mensaje.par);
    } else if (mensaje.tipo === 'consulta') {
      if (!actual || !historial.includes(mensaje.token)) return;
      canal.postMessage({ tipo: 'respuesta', id: mensaje.id, par: actual });
    } else if (mensaje.tipo === 'respuesta') {
      pendientes.get(mensaje.id)?.(mensaje.par);
    }
  });

  return {
    anunciarRotacion(anterior: string, par: ParDeTokens): void {
      anotar(anterior);
      canal?.postMessage({ tipo: 'rotado', anterior, par });
    },

    /** ¿Otra pestaña ya rotó `token`? Devuelve el par vigente, o `null`. */
    consultar(token: string, esperaMs = ESPERA_CONSULTA_MS): Promise<ParDeTokens | null> {
      if (!canal) return Promise.resolve(null);
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      return new Promise((resolver) => {
        const fin = (par: ParDeTokens | null) => {
          pendientes.delete(id);
          clearTimeout(reloj);
          resolver(par);
        };
        const reloj = setTimeout(() => fin(null), esperaMs);
        pendientes.set(id, fin);
        canal.postMessage({ tipo: 'consulta', id, token });
      });
    },
  };
}

/** Una renovación a la vez entre pestañas; sin `navigator.locks`, sin candado. */
export function conCandado<T>(tarea: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!locks) return tarea();
  // `request` resuelve con lo que resuelva `tarea`; su tipo lo envuelve dos veces.
  return locks.request('nexus-renovar-sesion', tarea) as Promise<T>;
}

export function abrirCanal(): Canal | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  return new BroadcastChannel('nexus-sesion') as unknown as Canal;
}
