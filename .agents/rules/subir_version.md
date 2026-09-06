# Regla de subida de versión

**Nunca edites la versión a mano.**

```bash
node .github/scripts/subir-version.mjs patch      # o: minor | major | 1.4.2
node .github/scripts/subir-version.mjs --check    # ¿está todo alineado?
```

Actualiza los cuatro archivos que la declaran —`desktop/package.json`,
`desktop/src-tauri/tauri.conf.json`, `desktop/src-tauri/Cargo.toml`,
`flutter_app/pubspec.yaml`—, sube el `versionCode` de Android y regenera
`package-lock.json` y `Cargo.lock`. Después, `comprobar-version.mjs` verifica.

**El `versionCode` de Android siempre sube, aunque el número visible baje**: es
lo que compara el sistema para dejar instalar el APK encima.

¿Añades un archivo que nombre la versión? Añádelo a `ARCHIVOS` en
`subir-version.mjs` **y** a `fuentes` en `comprobar-version.mjs`.

La etapa (`alfa`/`beta`/`estable`) vive aparte en `desktop/src/core/version.ts` y
`flutter_app/lib/core/version.dart`, y las dos tienen que coincidir.

Ver `CLAUDE.md` § «Regla de subida de versión» y `docs/PUBLICAR_VERSION.md`.
