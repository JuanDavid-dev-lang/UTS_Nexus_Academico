/**
 * Etapa de desarrollo del producto.
 *
 * El número de versión (`2.3.6`) responde a «cuánto ha cambiado desde la
 * anterior» y lo consume el actualizador, que necesita comparar versiones y no
 * entiende de adjetivos. La etapa responde a otra pregunta —«¿en qué punto está
 * esto?»— y va dirigida a quien lo usa: no es lo mismo instalar la 2.3.6 de un
 * producto terminado que la 2.3.6 de algo que todavía se está armando.
 *
 * Por eso se muestran juntos y se guardan separados: «Alfa 2.3.6».
 *
 * Para pasar de etapa se cambia esta constante, su gemela en
 * `flutter_app/lib/core/version.dart` y la etiqueta del workflow de
 * publicación. Los tres tienen que decir lo mismo; el procedimiento está en
 * `docs/PUBLICAR_VERSION.md`.
 */
export const ETAPA = 'alfa' as const;

/** Cómo se escribe delante del número. Vacío en la etapa estable. */
export const ETIQUETA_ETAPA: Record<string, string> = {
  alfa: 'Alfa',
  beta: 'Beta',
  estable: '',
};

/**
 * El nombre completo que ve una persona: «Alfa 2.3.6».
 *
 * Si la versión aún no se conoce devuelve solo la etapa, que ya dice algo,
 * en vez de un hueco.
 */
export function nombreVersion(version: string): string {
  const etiqueta = ETIQUETA_ETAPA[ETAPA] ?? '';
  if (!version) return etiqueta || '…';
  return etiqueta ? `${etiqueta} ${version}` : version;
}
