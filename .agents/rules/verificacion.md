# Regla de verificación

Nada se da por terminado sin ejecutar lo que corresponda al código tocado.

| Tocaste | Ejecuta |
|---|---|
| `backend/` | `npm run lint` · `npx tsc -p tsconfig.json --noEmit` · `npm test` |
| `desktop/` | `npm run lint` · `npm run typecheck` · `npm test` |
| `flutter_app/` | `flutter analyze` · `flutter test` |
| `ml_service/` | `.venv/bin/python -m pytest tests/` |
| Variables de entorno | `npm run check:env` (desde `backend/`) |

Objetivo: **0 errores**. Los avisos preexistentes (`no-console`,
`no-explicit-any`) no se arreglan de paso; los nuevos, sí.

Si añades o cambias una variable de entorno, actualiza en el mismo commit
`backend/.env.example`, la lista `KNOWN` de `backend/check-env.mjs` y la tabla
de CLAUDE.md. Una clave fuera de `KNOWN` salta como errata, y un aviso que
siempre aparece deja de leerse.

Ver `CLAUDE.md` § «Regla de verificación».
