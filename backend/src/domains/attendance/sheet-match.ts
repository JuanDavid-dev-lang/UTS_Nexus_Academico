/**
 * Cruce entre lo que se leyó en una planilla fotografiada y la matrícula real.
 *
 * Lógica pura: sin I/O, sin Mongo, sin Express. Recibe filas reconocidas y el
 * listado de matriculados, y decide a quién corresponde cada fila y cuánto se
 * puede confiar en esa correspondencia.
 *
 * Principio: **nada se da por bueno en silencio**. Una fila que no se puede
 * atribuir con seguridad se devuelve marcada para que la revise una persona, no
 * se descarta ni se adivina. El coste de equivocarse aquí lo paga un estudiante
 * en su porcentaje de asistencia semanas después, cuando ya nadie recuerda de
 * dónde salió el dato.
 */

export type FilaLeida = {
  indice: number;
  cedula: string;
  cedulaConfianza: number;
  nombre: string;
  nombreConfianza: number;
  celdas: { columna: number; presente: boolean; dudosa: boolean }[];
};

export type Matriculado = {
  id: string;
  code: string;
  fullName: string;
};

/** Qué tan seguros estamos de a quién pertenece una fila. */
export type NivelCoincidencia = 'exacta' | 'probable' | 'dudosa' | 'sin-coincidencia';

export type FilaCruzada = {
  indice: number;
  cedulaLeida: string;
  nombreLeido: string;
  studentId: string | null;
  code: string | null;
  fullName: string | null;
  nivel: NivelCoincidencia;
  avisos: string[];
  celdas: { columna: number; presente: boolean; dudosa: boolean }[];
};

export type ResultadoCruce = {
  filas: FilaCruzada[];
  /** Matriculados que no aparecieron en la foto. Sin esto, se pierden en silencio. */
  ausentesDeLaFoto: Matriculado[];
  avisos: string[];
};

/** Partículas que acompañan a un apellido y no son el apellido. */
const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'van', 'von', 'da', 'do', 'di', 'san', 'santa']);

/** Quita tildes y pasa a minúsculas para poder comparar sin depender del acento. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Primer apellido, con la convención colombiana «Nombres Apellido1 Apellido2».
 *
 * Es una heurística, no una certeza: `fullName` es un único campo de texto y no
 * hay forma de saber con seguridad dónde terminan los nombres y empiezan los
 * apellidos —«Juan Carlos Pérez» y «Juan Carlos Pérez Soto» se parsean distinto
 * y ambos son plausibles—. Por eso el resultado se usa SOLO para ordenar y para
 * avisar de posibles desórdenes, nunca para decidir de quién es una asistencia.
 * Para eso está la cédula.
 */
export function primerApellido(fullName: string): string {
  const limpio = normalizar(fullName);
  if (!limpio) return '';

  // Formato «Apellidos, Nombres»: lo que va antes de la coma ya son apellidos.
  if (fullName.includes(',')) {
    const antes = normalizar(fullName.split(',')[0] ?? '');
    const partes = antes.split(' ').filter(Boolean);
    return unirParticulas(partes, 0);
  }

  const partes = limpio.split(' ').filter(Boolean);
  if (partes.length <= 1) return partes[0] ?? '';
  if (partes.length === 2) return unirParticulas(partes, 1);
  // Con tres piezas se asume un nombre y dos apellidos; con cuatro o más, dos
  // nombres y dos apellidos.
  if (partes.length === 3) return unirParticulas(partes, 1);
  return unirParticulas(partes, 2);
}

/** Une la partícula con la palabra siguiente: «de la cruz» es un solo apellido. */
function unirParticulas(partes: string[], desde: number): string {
  // Si el corte cayó en mitad de una cadena de partículas, se retrocede hasta el
  // principio: en «Maria de la Cruz Peña» el índice calculado apunta a «la», y
  // quedarse ahí produciría «la cruz» en vez de «de la cruz».
  let inicio = desde;
  while (inicio > 0 && PARTICULAS.has(partes[inicio - 1] ?? '')) inicio--;

  let indice = inicio;
  const acumulado: string[] = [];
  while (indice < partes.length && PARTICULAS.has(partes[indice] ?? '')) {
    acumulado.push(partes[indice] as string);
    indice++;
  }
  if (indice < partes.length) acumulado.push(partes[indice] as string);
  return acumulado.join(' ');
}

/** Ordena la matrícula como está impresa la planilla: por primer apellido. */
export function ordenarPorApellido(matriculados: Matriculado[]): Matriculado[] {
  return [...matriculados].sort((a, b) => {
    const porApellido = primerApellido(a.fullName).localeCompare(primerApellido(b.fullName), 'es');
    if (porApellido !== 0) return porApellido;
    return normalizar(a.fullName).localeCompare(normalizar(b.fullName), 'es');
  });
}

/** Distancia de edición, acotada: si supera el techo se corta y devuelve el techo. */
export function distancia(a: string, b: string, techo = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > techo) return techo + 1;

  let previa = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const actual = [i];
    let minimoFila = i;
    for (let j = 1; j <= b.length; j++) {
      const coste = a[i - 1] === b[j - 1] ? 0 : 1;
      const valor = Math.min(
        (previa[j] ?? 0) + 1,
        (actual[j - 1] ?? 0) + 1,
        (previa[j - 1] ?? 0) + coste,
      );
      actual.push(valor);
      if (valor < minimoFila) minimoFila = valor;
    }
    // Toda la fila ya supera el techo: no hay forma de bajar de ahí.
    if (minimoFila > techo) return techo + 1;
    previa = actual;
  }
  return previa[b.length] ?? techo + 1;
}

/** Parecido entre dos nombres, de 0 a 1, comparando el conjunto de palabras. */
export function parecidoNombre(a: string, b: string): number {
  const palabrasA = new Set(normalizar(a).split(' ').filter(p => p.length > 1));
  const palabrasB = new Set(normalizar(b).split(' ').filter(p => p.length > 1));
  if (palabrasA.size === 0 || palabrasB.size === 0) return 0;

  let comunes = 0;
  for (const palabra of palabrasA) if (palabrasB.has(palabra)) comunes++;
  return comunes / Math.max(palabrasA.size, palabrasB.size);
}

/**
 * Cruza las filas leídas con los matriculados.
 *
 * Orden de preferencia:
 *  1. Cédula idéntica. Es la señal más fuerte y se acepta sin más.
 *  2. Cédula con uno o dos dígitos distintos Y nombre parecido. Dos señales
 *     débiles que coinciden valen más que una fuerte a medias.
 *  3. Solo el nombre coincide bien. Se acepta como dudosa y se marca.
 *  4. Nada. Se devuelve sin asignar para que el docente elija.
 *
 * Un mismo estudiante nunca se asigna a dos filas: la planilla tiene una fila
 * por persona, así que un duplicado significa que algo se leyó mal.
 */
export function cruzarConMatricula(
  filas: FilaLeida[],
  matriculados: Matriculado[],
): ResultadoCruce {
  const porCodigo = new Map(matriculados.map(m => [m.code, m]));
  const usados = new Set<string>();
  const avisos: string[] = [];

  const cruzadas: FilaCruzada[] = filas.map(fila => {
    const base = {
      indice: fila.indice,
      cedulaLeida: fila.cedula,
      nombreLeido: fila.nombre,
      celdas: fila.celdas,
    };
    const filaAvisos: string[] = [];

    const asignar = (m: Matriculado, nivel: NivelCoincidencia): FilaCruzada => {
      if (usados.has(m.id)) {
        filaAvisos.push(`${m.fullName} ya se asignó a otra fila. Revisa cuál es la correcta.`);
        return { ...base, studentId: null, code: null, fullName: null, nivel: 'dudosa', avisos: filaAvisos };
      }
      usados.add(m.id);
      return { ...base, studentId: m.id, code: m.code, fullName: m.fullName, nivel, avisos: filaAvisos };
    };

    // 1. Cédula exacta.
    const exacto = fila.cedula ? porCodigo.get(fila.cedula) : undefined;
    if (exacto) {
      const parecido = fila.nombre ? parecidoNombre(fila.nombre, exacto.fullName) : 1;
      if (fila.nombre && parecido < 0.34) {
        // La cédula dice una persona y el nombre otra. Esto es exactamente lo que
        // la segunda columna existe para detectar.
        filaAvisos.push(
          `La cédula corresponde a ${exacto.fullName}, pero en la hoja se leyó «${fila.nombre}».`,
        );
        return asignar(exacto, 'dudosa');
      }
      return asignar(exacto, 'exacta');
    }

    // 2. Cédula parecida respaldada por el nombre.
    if (fila.cedula.length >= 5) {
      let mejor: { m: Matriculado; d: number; parecido: number } | null = null;
      for (const m of matriculados) {
        const d = distancia(fila.cedula, m.code, 2);
        if (d > 2) continue;
        const parecido = fila.nombre ? parecidoNombre(fila.nombre, m.fullName) : 0;
        if (!mejor || d < mejor.d || (d === mejor.d && parecido > mejor.parecido)) {
          mejor = { m, d, parecido };
        }
      }
      if (mejor && (mejor.parecido >= 0.5 || (mejor.d === 1 && !fila.nombre))) {
        filaAvisos.push(
          `La cédula leída (${fila.cedula}) no existe; se propone ${mejor.m.code} por parecido.`,
        );
        return asignar(mejor.m, 'probable');
      }
    }

    // 3. Solo por nombre.
    if (fila.nombre) {
      let mejor: { m: Matriculado; parecido: number } | null = null;
      for (const m of matriculados) {
        const parecido = parecidoNombre(fila.nombre, m.fullName);
        if (!mejor || parecido > mejor.parecido) mejor = { m, parecido };
      }
      if (mejor && mejor.parecido >= 0.67) {
        filaAvisos.push('No se pudo leer la cédula; se propone por el nombre.');
        return asignar(mejor.m, 'dudosa');
      }
    }

    filaAvisos.push('No se pudo identificar a esta persona. Selecciónala a mano.');
    return { ...base, studentId: null, code: null, fullName: null, nivel: 'sin-coincidencia', avisos: filaAvisos };
  });

  const ausentesDeLaFoto = matriculados.filter(m => !usados.has(m.id));
  if (ausentesDeLaFoto.length > 0) {
    avisos.push(
      `${ausentesDeLaFoto.length} matriculado(s) no aparecen en la foto. ` +
        'No se les va a registrar nada; verifica si la hoja está completa.',
    );
  }

  // El orden alfabético es una comprobación, no una regla: si las filas
  // reconocidas no van por apellido, probablemente se saltó o se duplicó alguna.
  const asignadas = cruzadas.filter(f => f.fullName).map(f => primerApellido(f.fullName as string));
  const desordenadas = asignadas.filter((apellido, i) => i > 0 && apellido.localeCompare(asignadas[i - 1] as string, 'es') < 0).length;
  if (asignadas.length > 3 && desordenadas > asignadas.length * 0.2) {
    avisos.push(
      'Las filas reconocidas no quedaron en orden alfabético por primer apellido. ' +
        'Puede que se haya saltado una fila o que la hoja no sea la de este grupo.',
    );
  }

  return { filas: cruzadas, ausentesDeLaFoto, avisos };
}
