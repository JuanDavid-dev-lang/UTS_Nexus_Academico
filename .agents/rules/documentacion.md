# Regla de integridad de la documentación

La documentación se actualiza en el **mismo commit** que el cambio.

1. Al tocar lógica relevante, una pantalla, el modelo de datos, la paginación o
   el comportamiento de una plataforma, actualiza `CLAUDE.md`, `AGENTS.md`,
   `README.md`, `DESIGN.md` y lo que corresponda de `docs/`.
2. **No dejes una descripción obsoleta como si fuera verdad.** Una afirmación
   sobre un archivo borrado o un flujo que ya no existe es peor que no tener
   documentación: se lee con la misma confianza.
3. Mantén los conteos de pruebas al día donde estén escritos.

`AGENTS.md` y `CLAUDE.md` son el mismo documento para dos herramientas y solo se
diferencian en la primera línea. Editar uno y no el otro es la forma más fácil
de que las dos trabajen con reglas distintas sobre el mismo repositorio.

Ver `CLAUDE.md` § «Regla de integridad de la documentación».
