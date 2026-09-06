# Regla de carga de la base de datos

Atlas cobra por operación y por transferencia, y las dos se multiplican por
accidente.

1. **Una escritura por lote, no un viaje por fila.** `bulkWrite()` +
   `auditBatch()`. La auditoría también es una escritura por registro: agrupar
   solo el upsert deja el bucle donde estaba.
2. **`bulkWrite` no castea los ids.** Un `studentId` en texto no casa con el
   ObjectId guardado: el upsert crea un duplicado en vez de actualizar.
3. **Un filtro de lote se resuelve en una consulta**, no en una por fila
   (`estudiantesPorCodigo()`).
4. **Todo listado se pagina** con `paginacionCon(porDefecto)`, y el defecto es
   el tope que ese endpoint ya devolvía.
5. **El conteo va en paralelo con la página**, no encadenado.

En los clientes: el estado de servidor ya está cacheado (TanStack Query con
`staleTime` 30 s; providers de Riverpod **no** `autoDispose` a propósito), así
que cambiar de pantalla no debe volver a consultar.

Ver `CLAUDE.md` § «Regla de carga de la base de datos».
