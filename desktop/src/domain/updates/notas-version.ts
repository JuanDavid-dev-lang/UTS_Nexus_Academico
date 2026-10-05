/**
 * Las notas de una versión llegan en Markdown: el mensaje de la etiqueta, que
 * es lo que GitHub pinta en la página de la release (títulos con `#`, `**`,
 * viñetas, separadores `---`) y con las líneas cortadas a unos 78 caracteres.
 * Pintado tal cual, el diálogo de actualización enseñaba los símbolos y los
 * saltos a media frase. Esto lo convierte en bloques que la pantalla sabe
 * dibujar. El móvil tiene el mismo lector (`notas_version.dart`) y las dos
 * pruebas fijan las mismas salidas.
 */
export type BloqueNotas =
  | { tipo: 'titulo'; texto: string }
  | { tipo: 'parrafo'; texto: string }
  | { tipo: 'vineta'; texto: string };

const VINETA = /^\s*[-*+]\s+/;
const TITULO = /^\s*(#{1,6})\s+/;
const SEPARADOR = /^\s*([-*_])(\s*\1){2,}\s*$/;

/** Quita el marcado en línea: negrita, cursiva, código y enlaces. */
export function textoPlano(linea: string): string {
  return linea
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[^\w*])[*_]([^*_\s][^*_]*?)[*_](?=[^\w*]|$)/g, '$1$2')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function leerNotasVersion(markdown: string): BloqueNotas[] {
  const bloques: BloqueNotas[] = [];
  let actual: { tipo: 'parrafo' | 'vineta'; partes: string[] } | null = null;

  const cerrar = () => {
    if (!actual) return;
    const texto = textoPlano(actual.partes.join(' '));
    if (texto) bloques.push({ tipo: actual.tipo, texto });
    actual = null;
  };

  for (const linea of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    if (!linea.trim() || SEPARADOR.test(linea)) {
      cerrar();
      continue;
    }

    const titulo = TITULO.exec(linea);
    if (titulo) {
      cerrar();
      // El título de nivel 1 repite el nombre y el número de la versión, que
      // la pantalla ya enseña encima.
      if (titulo[1]!.length > 1) {
        const texto = textoPlano(linea.slice(titulo[0].length));
        if (texto) bloques.push({ tipo: 'titulo', texto });
      }
      continue;
    }

    if (VINETA.test(linea)) {
      cerrar();
      actual = { tipo: 'vineta', partes: [linea.replace(VINETA, '')] };
      continue;
    }

    // Una línea suelta continúa lo que haya abierto: así se deshace el corte
    // a 78 columnas, dentro de un párrafo o de una viñeta.
    if (actual) {
      actual.partes.push(linea.trim());
    } else {
      actual = { tipo: 'parrafo', partes: [linea.trim()] };
    }
  }
  cerrar();
  return bloques;
}
