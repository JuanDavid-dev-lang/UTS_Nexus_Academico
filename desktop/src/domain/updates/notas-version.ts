/**
 * Las notas de una versión llegan en Markdown: el mensaje de la etiqueta, que
 * es lo que GitHub pinta en la página de la release (títulos con `#`, `**`,
 * viñetas, listas numeradas, citas, separadores `---`) y con las líneas
 * cortadas a unos 78 caracteres. Pintado tal cual, el diálogo de actualización
 * enseñaba los símbolos y los saltos a media frase. Esto lo convierte en
 * bloques —y cada bloque en tramos con su formato— que la pantalla sabe
 * dibujar. El móvil tiene el mismo lector (`notas_version.dart`) y las dos
 * pruebas fijan las mismas salidas: cambiar uno exige cambiar el otro.
 */
export interface Tramo {
  texto: string;
  negrita?: true;
  cursiva?: true;
  codigo?: true;
}

interface BloqueBase {
  /** El texto sin marcado, para lectores de pantalla y pruebas. */
  texto: string;
  tramos: Tramo[];
}

export type BloqueNotas =
  | (BloqueBase & { tipo: 'titulo'; nivel: 2 | 3 })
  | (BloqueBase & { tipo: 'parrafo' })
  | (BloqueBase & { tipo: 'vineta'; nivel: 0 | 1 })
  | (BloqueBase & { tipo: 'numerada'; numero: number })
  | (BloqueBase & { tipo: 'cita' });

const VINETA = /^(\s*)[-*+]\s+/;
const NUMERADA = /^\s*(\d{1,3})[.)]\s+/;
const CITA = /^\s*>\s?/;
const TITULO = /^\s*(#{1,6})\s+/;
const SEPARADOR = /^\s*([-*_])(\s*\1){2,}\s*$/;
const VALLA = /^\s*(```|~~~)/;

/**
 * Formato en línea: `código`, **negrita** (o __negrita__), *cursiva* (o
 * _cursiva_). Un enlace se queda en su texto: abrir una URL desde el aviso de
 * actualización no le sirve a nadie y sí puede llevar a otra parte. Un guion
 * bajo dentro de una palabra (`nombre_de_archivo`) no es cursiva.
 */
const EN_LINEA =
  /`([^`]+)`|\*\*(.+?)\*\*|__(.+?)__|(?<![\w*])\*(?!\s)([^*]+?)\*(?![\w*])|(?<![\w_])_(?!\s)([^_]+?)_(?![\w_])/g;

export function tramosEnLinea(linea: string): Tramo[] {
  const limpia = linea
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  const tramos: Tramo[] = [];
  const agregar = (tramo: Tramo) => {
    if (!tramo.texto) return;
    const previo = tramos[tramos.length - 1];
    const mismoFormato =
      previo &&
      previo.negrita === tramo.negrita &&
      previo.cursiva === tramo.cursiva &&
      previo.codigo === tramo.codigo;
    if (mismoFormato) previo.texto += tramo.texto;
    else tramos.push({ ...tramo });
  };

  let desde = 0;
  for (const m of limpia.matchAll(EN_LINEA)) {
    agregar({ texto: limpia.slice(desde, m.index) });
    if (m[1] !== undefined) agregar({ texto: m[1], codigo: true });
    else if (m[2] !== undefined || m[3] !== undefined) agregar({ texto: (m[2] ?? m[3])!, negrita: true });
    else agregar({ texto: (m[4] ?? m[5])!, cursiva: true });
    desde = m.index + m[0].length;
  }
  agregar({ texto: limpia.slice(desde) });
  return tramos;
}

/** El texto de una línea sin ningún marcado. */
export function textoPlano(linea: string): string {
  return tramosEnLinea(linea)
    .map((t) => t.texto)
    .join('');
}

type Abierto =
  | { tipo: 'parrafo' | 'cita'; partes: string[] }
  | { tipo: 'vineta'; nivel: 0 | 1; partes: string[] }
  | { tipo: 'numerada'; numero: number; partes: string[] };

export function leerNotasVersion(markdown: string): BloqueNotas[] {
  const bloques: BloqueNotas[] = [];
  let actual: Abierto | null = null;
  let enValla = false;

  const cerrar = () => {
    if (!actual) return;
    const tramos = tramosEnLinea(actual.partes.join(' '));
    const texto = tramos.map((t) => t.texto).join('');
    if (texto) {
      const { partes: _partes, ...resto } = actual;
      bloques.push({ ...resto, texto, tramos } as BloqueNotas);
    }
    actual = null;
  };

  for (const linea of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    // Un bloque de código se lee como texto corriente: en unas notas de
    // versión casi nunca lo hay, y si lo hay es un comando de una línea.
    if (VALLA.test(linea)) {
      cerrar();
      enValla = !enValla;
      continue;
    }
    if (!linea.trim() || (!enValla && SEPARADOR.test(linea))) {
      cerrar();
      continue;
    }
    if (enValla) {
      cerrar();
      const tramos: Tramo[] = [{ texto: linea.trim(), codigo: true }];
      bloques.push({ tipo: 'parrafo', texto: linea.trim(), tramos });
      continue;
    }

    const titulo = TITULO.exec(linea);
    if (titulo) {
      cerrar();
      // El título de nivel 1 repite el nombre y el número de la versión, que
      // la pantalla ya enseña encima.
      const nivel = titulo[1]!.length;
      if (nivel > 1) {
        const tramos = tramosEnLinea(linea.slice(titulo[0].length));
        const texto = tramos.map((t) => t.texto).join('');
        if (texto) bloques.push({ tipo: 'titulo', nivel: nivel === 2 ? 2 : 3, texto, tramos });
      }
      continue;
    }

    const vineta = VINETA.exec(linea);
    if (vineta) {
      cerrar();
      actual = {
        tipo: 'vineta',
        nivel: vineta[1]!.replace(/\t/g, '  ').length >= 2 ? 1 : 0,
        partes: [linea.slice(vineta[0].length)],
      };
      continue;
    }

    const numerada = NUMERADA.exec(linea);
    if (numerada) {
      cerrar();
      actual = { tipo: 'numerada', numero: Number(numerada[1]), partes: [linea.slice(numerada[0].length)] };
      continue;
    }

    if (CITA.test(linea)) {
      const contenido = linea.replace(CITA, '');
      if (actual?.tipo === 'cita') {
        actual.partes.push(contenido);
      } else {
        cerrar();
        actual = { tipo: 'cita', partes: [contenido] };
      }
      continue;
    }

    // Una línea suelta continúa lo que haya abierto: así se deshace el corte
    // a 78 columnas, dentro de un párrafo, una viñeta o una cita.
    if (actual) actual.partes.push(linea.trim());
    else actual = { tipo: 'parrafo', partes: [linea.trim()] };
  }
  cerrar();
  return bloques;
}
