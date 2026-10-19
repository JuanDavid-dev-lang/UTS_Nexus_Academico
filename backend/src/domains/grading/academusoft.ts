/**
 * Reporte «Ver Calificaciones» de Academusoft, leído de la capa de texto del PDF.
 *
 * Es lo que el docente ya tiene: el sistema institucional lo exporta con una
 * fila por estudiante y, por cada corte, tres columnas cuyo encabezado es el
 * peso del componente (10 % autoevaluación, 60 % parciales, 30 % trabajos).
 * Pasarlo por el reconocimiento de imágenes sería tirar la información exacta
 * que ya trae y cambiarla por una lectura con confianza: aquí se lee tal cual.
 *
 * Lógica pura sobre los elementos de texto con su posición. **Se lee por
 * columnas, no por el orden del texto**: el orden depende de cómo se dibujó
 * el PDF, y la posición no. Dos cosas del formato real lo obligan:
 *
 * - La celda de identificación ajusta en dos líneas («CC -» arriba y el
 *   número debajo), y cuando una fila cae al pie de página **el número pasa
 *   a la página siguiente**, encima de la primera fila.
 * - Las celdas sin nota traen un guion; si un día vinieran vacías, leer en
 *   orden desplazaría todas las notas siguientes a la columna equivocada.
 *
 * Nada se adivina: SN, PE, NP y AN no son notas y se devuelven sin valor con
 * su aviso, y «Def. Pond» no se lee — la nota definitiva la calcula Nexus.
 */
import type { ComponenteTipo, CorteNumero } from './grading.service.js';
import type { FilaNotasLeida } from './import-notas.js';

/** Un trozo de texto del PDF. `y` crece hacia arriba, como en PDF. */
export type ElementoDeTexto = {
  texto: string;
  x: number;
  y: number;
  ancho: number;
  pagina: number;
};

export type ColumnaDeNota = {
  corte: CorteNumero;
  componentType: ComponenteTipo;
};

export type ReporteAcademusoft = {
  encabezado: {
    /** `TSI601`, si se reconoció. */
    codigoMateria: string | null;
    nombreMateria: string | null;
    /** `B191`, si se reconoció. */
    grupo: string | null;
  };
  /** Solo las columnas con alguna nota; `filas[].notas` va alineado con ellas. */
  columnas: ColumnaDeNota[];
  filas: FilaNotasLeida[];
  avisos: string[];
};

/** El encabezado de cada columna es el peso del componente dentro del corte. */
const COMPONENTE_POR_PESO: Record<string, ComponenteTipo> = {
  '10%': 'AUTOEVALUACION',
  '60%': 'PARCIALES',
  '30%': 'TRABAJOS',
};

const CODIGOS: Record<string, string> = {
  SN: 'sin notas',
  PE: 'pendiente',
  NP: 'no presentó',
  AN: 'anulada',
};

/** Tipo de documento, solo o pegado al número: «CC -», «TI - 1095302990». */
const TIPO_DOCUMENTO = /^(?:CC|TI|CE|PA|PEP|PPT|RC|NUIP|NIT)\s*-?\s*(\d{4,15})?$/;
const DOCUMENTO = /^\d{4,15}$/;
const NUMERO_DE_FILA = /^\d{1,3}$/;
const NOTA = /^\d{1,3}(?:[.,]\d{1,2})?$/;
const MATERIA = /^([A-Z]{2,6}\d{2,4})\s*-\s*(.+)$/;
const GRUPO = /^[A-Z0-9]{2,8}$/;

/** Distancia máxima, en puntos, entre el borde derecho de una celda y el de su encabezado. */
const TOLERANCIA_COLUMNA = 12;
/** Cuánto por encima de su número puede quedar el texto de una fila (la línea base varía). */
const HOLGURA_FILA = 4;

const limpio = (texto: string) => texto.replace(/\s+/g, ' ').trim();

/** El número de documento de un elemento, si lo es (suelto o tras su tipo). */
function documentoDe(elemento: ElementoDeTexto): string | null {
  const texto = limpio(elemento.texto);
  if (DOCUMENTO.test(texto)) return texto;
  return texto.match(TIPO_DOCUMENTO)?.[1] ?? null;
}
const bordeDerecho = (elemento: ElementoDeTexto) => elemento.x + elemento.ancho;

/** ¿Estos elementos son un reporte de calificaciones de Academusoft? */
export function esReporteAcademusoft(elementos: ElementoDeTexto[]): boolean {
  const textos = elementos.map(e => limpio(e.texto));
  return (
    textos.some(t => /academusoft/i.test(t)) &&
    textos.some(t => /ver calificaciones/i.test(t)) &&
    textos.filter(t => t in COMPONENTE_POR_PESO).length >= 3
  );
}

type Encabezado = { x: number; derecha: number; columna: ColumnaDeNota };

/**
 * Las columnas de nota, de izquierda a derecha, a partir de la fila de
 * encabezados («10% 60% 30%» × 3). Cada trío es un corte, en orden.
 */
function leerEncabezados(elementos: ElementoDeTexto[]): { columnas: Encabezado[]; y: number; pagina: number } | null {
  const pesos = elementos.filter(e => limpio(e.texto) in COMPONENTE_POR_PESO);
  if (pesos.length < 3) return null;

  // La fila de encabezados es la línea con más pesos; un «(33%)» de los
  // cortes no casa con el patrón porque lleva paréntesis.
  const porLinea = new Map<string, ElementoDeTexto[]>();
  for (const peso of pesos) {
    const clave = `${peso.pagina}:${Math.round(peso.y)}`;
    porLinea.set(clave, [...(porLinea.get(clave) ?? []), peso]);
  }
  const linea = [...porLinea.values()].sort((a, b) => b.length - a.length)[0] ?? [];
  const ordenados = [...linea].sort((a, b) => a.x - b.x).slice(0, 9);
  const primero = ordenados[0];
  if (!primero) return null;

  return {
    y: primero.y,
    pagina: primero.pagina,
    columnas: ordenados.map((elemento, indice) => ({
      x: elemento.x,
      derecha: bordeDerecho(elemento),
      columna: {
        corte: (Math.floor(indice / 3) + 1) as CorteNumero,
        componentType: COMPONENTE_POR_PESO[limpio(elemento.texto)] as ComponenteTipo,
      },
    })),
  };
}

function leerMateriaYGrupo(elementos: ElementoDeTexto[]): ReporteAcademusoft['encabezado'] {
  const materia = elementos.find(e => MATERIA.test(limpio(e.texto)));
  if (!materia) return { codigoMateria: null, nombreMateria: null, grupo: null };

  const [, codigo, nombre] = limpio(materia.texto).match(MATERIA) ?? [];
  const grupo = elementos.find(
    e =>
      e.pagina === materia.pagina &&
      Math.abs(e.y - materia.y) < 3 &&
      e.x > bordeDerecho(materia) &&
      GRUPO.test(limpio(e.texto)),
  );
  return {
    codigoMateria: codigo ?? null,
    nombreMateria: nombre ? limpio(nombre) : null,
    grupo: grupo ? limpio(grupo.texto) : null,
  };
}

/** Índice de la columna de nota a la que pertenece una celda, o `-1`. */
function columnaDe(elemento: ElementoDeTexto, encabezados: Encabezado[]): number {
  let mejor = -1;
  let distancia = TOLERANCIA_COLUMNA;
  encabezados.forEach((encabezado, indice) => {
    const d = Math.abs(bordeDerecho(elemento) - encabezado.derecha);
    if (d <= distancia) {
      mejor = indice;
      distancia = d;
    }
  });
  return mejor;
}

export function interpretarReporteAcademusoft(elementos: ElementoDeTexto[]): ReporteAcademusoft {
  const encabezado = leerMateriaYGrupo(elementos);
  const cabecera = leerEncabezados(elementos);
  if (!cabecera) {
    return {
      encabezado,
      columnas: [],
      filas: [],
      avisos: ['No se encontraron las columnas de notas (10 % / 60 % / 30 %) del reporte.'],
    };
  }

  const encabezados = cabecera.columnas;
  const inicioNotas = Math.min(...encabezados.map(e => e.x));

  // Solo lo que está por debajo de los encabezados en su página.
  const cuerpo = elementos.filter(e => e.pagina !== cabecera.pagina || e.y < cabecera.y - 2);

  // Un número de fila es un entero corto, el elemento más a la izquierda.
  const candidatos = cuerpo.filter(e => NUMERO_DE_FILA.test(limpio(e.texto)) && e.x < inicioNotas);
  const xNumero = Math.min(...candidatos.map(e => e.x));
  const anclas = candidatos
    .filter(e => e.x < xNumero + 6)
    .sort((a, b) => a.pagina - b.pagina || b.y - a.y);
  // Alto de una fila: la separación habitual entre dos números seguidos. La
  // última fila de cada página no tiene «siguiente» que la cierre, y sin
  // este tope se quedaba con el pie («SN: SIN NOTAS», la firma) como nombre.
  const separaciones = anclas
    .slice(1)
    .map((ancla, i) => (ancla.pagina === anclas[i]!.pagina ? anclas[i]!.y - ancla.y : 0))
    .filter(d => d > 0)
    .sort((x, y) => x - y);
  const altoDeFila = separaciones[Math.floor(separaciones.length / 2)] ?? 30;
  const aLaIzquierdaDeLasNotas = (e: ElementoDeTexto) => e.x > xNumero + 6 && e.x < inicioNotas - TOLERANCIA_COLUMNA;

  const filas: FilaNotasLeida[] = [];
  const usados = new Set<ElementoDeTexto>();

  anclas.forEach((ancla, posicion) => {
    const siguiente = anclas[posicion + 1];
    const hasta =
      siguiente && siguiente.pagina === ancla.pagina
        ? siguiente.y + HOLGURA_FILA
        : ancla.y - altoDeFila + HOLGURA_FILA;
    const enFila = cuerpo.filter(
      e => e.pagina === ancla.pagina && e.y <= ancla.y + HOLGURA_FILA && e.y > hasta && e !== ancla,
    );

    const identidad = enFila.filter(aLaIzquierdaDeLasNotas);
    const documento = identidad.find(e => documentoDe(e) !== null);
    if (documento) usados.add(documento);

    // El nombre es lo que queda en esa franja y no es documento ni su tipo.
    const nombre = limpio(
      identidad
        .filter(e => e !== documento && !TIPO_DOCUMENTO.test(limpio(e.texto)) && /\p{L}/u.test(e.texto))
        .sort((a, b) => b.y - a.y || a.x - b.x)
        .map(e => e.texto)
        .join(' '),
    );

    const notas: (number | null)[] = encabezados.map(() => null);
    const avisos: string[] = [];
    for (const celda of enFila) {
      if (celda.x < inicioNotas - TOLERANCIA_COLUMNA) continue;
      const indice = columnaDe(celda, encabezados);
      if (indice < 0) continue;
      const texto = limpio(celda.texto).toUpperCase();
      const columna = encabezados[indice]!.columna;
      if (NOTA.test(texto)) {
        const valor = Number(texto.replace(',', '.'));
        // No se recorta: un «45» suele ser un 4.5 sin punto.
        if (valor <= 5) notas[indice] = valor;
        else avisos.push(`Corte ${columna.corte}: «${texto}» está fuera del rango 0–5; revísala.`);
      } else if (texto in CODIGOS) {
        avisos.push(`Corte ${columna.corte}: ${texto} (${CODIGOS[texto]}) no es una nota y no se importa.`);
      } else if (texto !== '-') {
        avisos.push(`Corte ${columna.corte}: «${texto}» no se reconoce como nota; revísala.`);
      }
    }

    filas.push({
      indice: Number(limpio(ancla.texto)),
      cedula: documento ? (documentoDe(documento) ?? '') : '',
      nombre,
      confianza: 1,
      notas,
      avisos,
    });
  });

  // El número que se fue a la página siguiente: un documento suelto encima de
  // la primera fila de su página es de la última fila de la página anterior,
  // y solo si a esa le falta.
  const sueltos = cuerpo.filter(e => !usados.has(e) && aLaIzquierdaDeLasNotas(e) && DOCUMENTO.test(limpio(e.texto)));
  for (const suelto of sueltos) {
    const primera = anclas.findIndex(a => a.pagina === suelto.pagina);
    if (primera <= 0 || suelto.y <= anclas[primera]!.y + HOLGURA_FILA) continue;
    const anterior = filas[primera - 1];
    if (anterior && !anterior.cedula) anterior.cedula = limpio(suelto.texto);
  }

  for (const fila of filas) {
    if (!fila.cedula) fila.avisos.push('No se encontró el documento en esta fila.');
  }

  // Solo las columnas con alguna nota: los cortes que aún no se califican
  // salen con guiones y no hay nada que importar de ellos.
  const conNotas = encabezados
    .map((_, indice) => indice)
    .filter(indice => filas.some(fila => fila.notas[indice] !== null));

  const avisos: string[] = [];
  if (!filas.length) avisos.push('No se reconoció ninguna fila de estudiante en el reporte.');
  else if (!conNotas.length) avisos.push('El reporte no trae ninguna nota todavía.');
  const cortesVacios = ([1, 2, 3] as CorteNumero[]).filter(
    corte => encabezados.some(e => e.columna.corte === corte) && !conNotas.some(i => encabezados[i]!.columna.corte === corte),
  );
  if (filas.length && conNotas.length && cortesVacios.length) {
    avisos.push(
      `${cortesVacios.length === 1 ? 'El corte' : 'Los cortes'} ${cortesVacios.join(' y ')} no ${
        cortesVacios.length === 1 ? 'trae' : 'traen'
      } notas en el reporte: no se toca nada de ${cortesVacios.length === 1 ? 'él' : 'ellos'}.`,
    );
  }

  return {
    encabezado,
    columnas: conNotas.map(indice => encabezados[indice]!.columna),
    filas: filas.map(fila => ({ ...fila, notas: conNotas.map(indice => fila.notas[indice] ?? null) })),
    avisos,
  };
}
