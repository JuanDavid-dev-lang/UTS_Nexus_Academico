# UTS Nexus Académico — App móvil

Cliente Android para docentes. Muestra notas, asistencia, riesgo académico y
agenda; **no calcula nada**: todo lo resuelve el backend y aquí solo se
presenta. Si una pantalla parece necesitar una fórmula, el cambio va en
`backend/src/domains/`.

```bash
flutter pub get
flutter run       # en emulador la API se resuelve en http://10.0.2.2:4000
flutter test
flutter analyze
```

En un teléfono físico la dirección del servidor se configura desde la pantalla
de login (`http://IP_DE_TU_PC:4000`), o se detecta sola por descubrimiento en
la red local.

## Cómo está organizado

```
lib/
├── core/              # transversal: una carpeta por tema, no un cajón
│   ├── network/         cliente HTTP, socket, descubrimiento de servidor
│   ├── auth/            sesión, credenciales, usuario
│   ├── notifications/   alarmas locales del teléfono y push del servidor
│   ├── storage/         caché para trabajar sin red
│   ├── data/            modelos, repositorio académico e índice de providers
│   ├── theme/           tokens de color y tipografía (ver DESIGN.md)
│   └── widgets/         piezas compartidas entre pantallas
└── features/          # una carpeta por capacidad
    └── <capacidad>/
        ├── <capacidad>_page.dart        la pantalla
        ├── <capacidad>_providers.dart   sus providers de Riverpod
        └── data/                        su repositorio, si tiene uno propio
```

**Dónde va algo nuevo**: si solo lo usa una pantalla, en su carpeta de
`features/`. Si lo usan tres, en `core/`. La regla existe porque antes había
tres sitios donde podía ir un modelo y dos donde podía ir un repositorio.

## Tres cosas que es fácil deshacer sin querer

**`MediaQuery.sizeOf` / `viewInsetsOf`, nunca `MediaQuery.of`.** `of` suscribe
al `MediaQueryData` entero, y el teclado anima `viewInsets` fotograma a
fotograma: leer un ancho con `of` reconstruye ese widget sesenta veces por
segundo mientras el teclado sube.

**Las pestañas no se rehacen al cambiar.** La navegación usa
`StatefulShellRoute.indexedStack` (`app.dart`), con una rama por destino.
`rutasDeRama` en `core/widgets/app_scaffold.dart` es el contrato —la rama N
atiende a `rutasDeRama[N]`— y `test/router_test.dart` lo fija, porque
descuadrar el orden compila igual y manda cada pestaña a la pantalla
equivocada. Entre pestañas se navega con `goBranch`, no con `context.go`.

**Un `setState` de página por pulsación de tecla es un error.** Reconstruye
cabecera, filtros y lista, y además refiltra la lista completa. Los buscadores
usan `DebouncedSearchField`; lo que solo habilita un botón usa
`ValueListenableBuilder` sobre el controlador. Las listas largas van con
`ListView.builder` o `SliverList.builder`.

## Tema

Tres modos: claro, oscuro y seguir al sistema. La preferencia se lee en
`main()` **antes** de `runApp` — leerla después deja el primer fotograma con el
tema del sistema y lo cambia a continuación, que es un fogonazo visible para
quien eligió claro con el teléfono en oscuro.

La aplicación es solo en español; no hay internacionalización.

## Publicar

Subir `version:` en `pubspec.yaml` (incluido el `+versionCode`) y empujar una
etiqueta `v*`. Detalle completo en [`docs/PUBLICAR_VERSION.md`](../docs/PUBLICAR_VERSION.md).
