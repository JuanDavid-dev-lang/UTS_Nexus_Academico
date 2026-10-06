/// Cómo se nombra un grupo en una línea de texto.
///
/// Los grupos se llaman como los pone cada docente: «A194», o «Grupo A». Con
/// el prefijo fijo, el segundo salía «Grupo Grupo A» en la agenda, la
/// próxima clase, el widget y los recordatorios.
String etiquetaGrupo(String nombre) {
  final limpio = nombre.trim();
  if (limpio.toLowerCase().startsWith('grupo ')) return limpio;
  return 'Grupo $limpio';
}
