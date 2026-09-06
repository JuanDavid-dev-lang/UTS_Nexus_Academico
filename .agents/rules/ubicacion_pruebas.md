# Regla de ubicación de las pruebas

Una prueba va donde vive el código que cubre:

- `backend/tests/` → `backend/src/domains/` y módulos puros de `shared/`
- `desktop/tests/unit/` → `desktop/src/domain/` y utilidades de `core/`
- `flutter_app/test/` → `flutter_app/lib/`

Las tres carpetas son planas a propósito (15–30 archivos cada una). **El nombre
es la ubicación**: `professor-scope.test.ts` prueba
`domains/scope/professor-scope.ts`.

Una prueba que cruza dos módulos va con el que posee el comportamiento que se
afirma, no con el que solo lee.

Prefiere extender un archivo existente con un `describe`/`group` nuevo antes que
crear otro para el mismo tipo de afirmación.

Merecen prueba: lógica de dominio, lo que puede corromper o perder datos, los
fallos que de verdad ocurrieron, y las garantías que se rompen en silencio
(alcance de un docente, mapa de `sync:update`, orden de las ramas del enrutador,
escape de fórmulas de los exportables).

No la merecen: las que solo repiten una constante.

Ver `CLAUDE.md` § «Regla de ubicación de las pruebas».
