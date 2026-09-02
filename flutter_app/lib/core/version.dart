/// Etapa de desarrollo del producto.
///
/// El número de versión (`2.3.6`) responde a «cuánto ha cambiado desde la
/// anterior» y lo consume el actualizador, que compara versiones y no entiende
/// de adjetivos. La etapa responde a otra pregunta —«¿en qué punto está
/// esto?»— y va dirigida a quien lo usa.
///
/// Por eso se muestran juntos y se guardan separados: «Alfa 2.3.6».
///
/// Gemelo de `desktop/src/core/version.ts`. Los dos y la etiqueta del workflow
/// de publicación tienen que decir lo mismo; el procedimiento para cambiar de
/// etapa está en `docs/PUBLICAR_VERSION.md`.
const String etapa = 'estable';

/// Cómo se escribe delante del número. Vacía en la etapa estable.
const Map<String, String> etiquetaEtapa = {
  'pre-release': 'Pre-release',
  'alfa': 'Alfa',
  'beta': 'Beta',
  'estable': '',
};

/// El nombre completo que ve una persona: «Alfa 2.3.6».
///
/// Con la versión todavía sin cargar devuelve solo la etapa, que ya dice algo,
/// en vez de un hueco.
String nombreVersion(String version) {
  final etiqueta = etiquetaEtapa[etapa] ?? '';
  if (version.isEmpty) return etiqueta.isEmpty ? '…' : etiqueta;
  return etiqueta.isEmpty ? version : '$etiqueta $version';
}
