# Publicar una versión

Los clientes se actualizan solos desde **GitHub Releases**. El escritorio —Windows y
Linux— verifica la firma antes de instalar; el móvil descarga el APK y se lo entrega al
instalador de Android. Esta guía cubre lo que hay que configurar una vez y lo que hay
que hacer en cada publicación.

## Qué plataformas hay

**El registro vive en [`.github/scripts/plataformas.mjs`](../.github/scripts/plataformas.mjs)
y es el único sitio donde se declara.** `node .github/scripts/plataformas.mjs` imprime
la matriz con la versión de cada una; CI la ejecuta en cada push.

| Plataforma | Estado | Formatos | Se actualiza con |
|---|---|---|---|
| Windows | soportada | NSIS, MSI | actualizador de Tauri |
| Linux | soportada | AppImage, `.deb`, `.rpm` | actualizador de Tauri |
| Android | soportada | APK | API de Releases + instalador del sistema |
| macOS | planificada | `.app`, `.dmg` | actualizador de Tauri |
| iOS | planificada | `.ipa` | App Store |

El registro es lo que leen `subir-version.mjs` (qué archivos reescribir),
`comprobar-version.mjs` (qué comprobar) y `componer-manifiesto.mjs` (qué claves exigir
en `latest.json`). Ninguno lleva lista propia, que es como estuvo hasta ahora: la misma
lista copiada en dos scripts que podían discrepar.

**Añadir macOS o iOS** es cambiar su `estado` a `soportada`, declarar sus archivos de
versión y sus claves de manifiesto, y añadir su trabajo a `release.yml`. Ningún script
se toca. Lo que las bloquea hoy está escrito en el propio registro, en el campo
`bloqueo`, y es de herramientas: un Mac con Xcode para compilar y firmar, y el Apple
Developer Program para distribuir en iOS.

## Dos repositorios, y por qué

| Repositorio | Visibilidad | Contenido |
|---|---|---|
| `UTS_Nexus_Academico` | público | el código, y un espejo de cada publicación |
| `UTS_Nexus_Releases` | público | solo los instaladores |

Un actualizador tiene que poder leer el manifiesto **sin credenciales**. La tentación
es meter un token en la app para que lea un repositorio privado, y no funciona: ese
token viaja dentro del `.exe` y del `.apk`, y sacarlo es un `strings` o descompilar el
APK. Sería entregarle la llave del repositorio a todo el que instale la app.

La separación nació de ahí, cuando el código era privado: los instaladores en un
repositorio aparte, descargables sin credenciales. Quien publica en él es el workflow,
con `RELEASES_TOKEN`, un secreto que vive en el runner y no entra en ningún binario.

### El espejo, y por qué hay que mantenerlo

Las versiones **2.3.3 y anteriores** llevan grabada dentro del binario la dirección de
`UTS_Nexus_Academico` como servidor de actualizaciones. Mientras fue privado eso era un
404, y esas instalaciones quedaron muertas: la dirección va compilada, no hay forma de
cambiársela a un `.exe` ya instalado. Solo se salía reinstalando a mano.

Por eso el workflow publica **la misma release en los dos sitios**. El `latest.json` del
espejo es el mismo archivo que se subió al repositorio de instaladores: apunta a sus
assets y conserva sus firmas, así que no se firma nada dos veces ni se abre una segunda
cadena de confianza.

### El manifiesto tiene un dueño, y no es `tauri-action`

`latest.json` lo compone el trabajo `manifiesto` con
[`.github/scripts/componer-manifiesto.mjs`](../.github/scripts/componer-manifiesto.mjs),
a partir de los assets **ya publicados** en la release.

Antes lo generaba `tauri-action` con `includeUpdaterJson`, y con una sola plataforma
funcionaba. Con dos deja de funcionar: **`tauri-action` no fusiona un manifiesto
existente**. Borra el asset y sube el suyo, armado solo con lo que compiló ese trabajo.
Windows y Linux compilan en trabajos distintos, así que el segundo en terminar dejaría
al primero sin actualizaciones.

Y ese fallo no se ve. El manifiesto existe, la release está completa, los instaladores
están ahí. Lo único que cambia es que a la mitad de los equipos el botón de actualizar
les responde «ya tienes la última versión», y lo seguirá haciendo en la publicación
siguiente. Nadie abre un `latest.json` a mirar qué claves trae.

El script empareja cada archivo con su `.sig`, deduce la clave por la extensión y
**falla si falta alguna**. Su `--autoprueba` corre en `verificar.yml`, en cada push.

Las claves que produce, y por qué son siete y no dos: el actualizador de Tauri busca
`{os}-{arch}-{formato}` y cae a `{os}-{arch}` cuando no logra averiguar en qué formato
está instalada la app.

| Clave | Apunta a |
|---|---|
| `windows-x86_64-nsis`, `windows-x86_64` | `…-setup.exe` |
| `windows-x86_64-msi` | `….msi` |
| `linux-x86_64-appimage`, `linux-x86_64` | `….AppImage` |
| `linux-x86_64-deb` | `….deb` |
| `linux-x86_64-rpm` | `….rpm` |

El alias corto de Linux apunta a la **AppImage** a propósito: si el actualizador no sabe
cómo está instalada la app, lo que se le ofrezca tiene que funcionar en el sitio donde
esté, y la AppImage es la única de las tres que corre en cualquier distribución.

El espejo se puede retirar el día que no quede nadie con una versión anterior a la 2.3.4
instalada. Antes, no: quitarlo vuelve a dejar sin salida a quien no se haya actualizado.

> **Si el código vuelve a ser privado**, el espejo deja de servir y esas versiones
> vuelven a quedarse sin actualizaciones. Volver atrás tampoco recupera la privacidad:
> los clones, los forks y las cachés de lo ya publicado siguen ahí.

Si algún día cambia el nombre del repositorio de instaladores hay que tocarlo en tres
sitios, y los tres tienen que coincidir:

- `.github/workflows/release.yml` → `REPO_RELEASES_OWNER` / `REPO_RELEASES_NAME`
- `desktop/src-tauri/tauri.conf.json` → `plugins.updater.endpoints`
- `flutter_app/lib/core/services/update_service.dart` → `_releasesApi`

---

## 1. Configuración inicial (una sola vez)

### 1.1 Clave de firma del actualizador de escritorio

El actualizador de Tauri solo instala paquetes firmados con la clave privada cuya
pública está incrustada en la app. **Si se pierde la privada, los equipos ya instalados
dejan de poder actualizarse**: hay que reinstalarlos a mano uno por uno.

La clave pública ya está en `desktop/src-tauri/tauri.conf.json`, campo `plugins.updater.pubkey`.

La **privada** se generó en un directorio temporal y hay que moverla a un sitio seguro
antes de que ese directorio se borre:

```
C:\Users\repollo\AppData\Local\Temp\claude\C--Users-repollo-UTS-Nexus-Academico\
  676d05cb-dd7c-46f7-912e-662c1429fd6b\scratchpad\uts-nexus-updater.key
```

Qué hacer con ella:

1. Guardarla en el gestor de contraseñas institucional (o en un USB bajo llave).
2. Copiar su contenido y crearlo como secreto de repositorio.
3. Borrar el archivo del disco.

No debe entrar nunca al repositorio. Se generó **sin contraseña**, así que el secreto
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` va vacío.

Para regenerarla (solo si se perdió y se asume el coste de reinstalar):

```bash
cd desktop
npx tauri signer generate -w ../uts-nexus-updater.key
# copiar el contenido de uts-nexus-updater.key.pub a tauri.conf.json -> plugins.updater.pubkey
```

### 1.2 Secretos del repositorio

En GitHub: **Settings → Secrets and variables → Actions → New repository secret**.

| Secreto | Valor |
|---------|-------|
| `RELEASES_TOKEN` | token con `contents: write` sobre `UTS_Nexus_Releases` |
| `TAURI_SIGNING_PRIVATE_KEY` | contenido íntegro de `uts-nexus-updater.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | vacío (la clave se generó sin contraseña) |
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 flutter_app/android/upload-keystore.jks` |
| `ANDROID_KEYSTORE_PASSWORD` | `storePassword` de `flutter_app/android/key.properties` |
| `ANDROID_KEY_ALIAS` | `keyAlias` de ese mismo archivo |
| `ANDROID_KEY_PASSWORD` | `keyPassword` de ese mismo archivo |
| `DROPBOX_APP_KEY` | *App key* de la app de Dropbox (ver 1.3) |
| `DROPBOX_APP_SECRET` | su *App secret* |
| `DROPBOX_REFRESH_TOKEN` | token de refresco de la cuenta dueña de los archivos |

El keystore de Android tiene la misma propiedad que la clave de Tauri: **Android no
deja instalar una actualización firmada con un keystore distinto al de la versión
instalada**. Si se pierde, los usuarios tienen que desinstalar y reinstalar.

### 1.3 Dropbox: dar acceso al workflow

La página de descargas (`utsnexus.github.io`) no manda a la gente al Release: sus
botones llevan escrito un archivo concreto de Dropbox. Un enlace de Dropbox apunta a un
archivo, no a «la última versión», así que el workflow escribe el instalador recién
compilado **encima** de ese mismo archivo. El enlace no cambia y lo que entrega es lo
nuevo.

Son tres: Windows (`.exe`), Linux (`.AppImage`) y Android (`.apk`). El de Linux es la
AppImage y no el `.deb` ni el `.rpm` porque un botón de una página no puede preguntar
qué distribución usa quien lo pulsa, y la AppImage es la única de las tres que corre en
todas. Quien prefiera el paquete nativo lo encuentra en la publicación de GitHub, que es
donde sí puede elegir con conocimiento.

El botón de Linux **ya está en la página**, con `data-descarga="linux"` como los otros
dos. Le falta una sola cosa: apunta a la publicación de GitHub y no a Dropbox, porque un
enlace compartido de Dropbox no existe hasta que el archivo se sube por primera vez. En
cuanto el trabajo `dropbox` publique la primera AppImage, su enlace sale en el resumen
del workflow («Enlaces de la página») y hay que pegarlo en el `href` de esa tarjeta en
`index.html`. Es la única vez: a partir de ahí el archivo se sobrescribe y el enlace ya
no cambia.

Mientras tanto la página funciona: el botón lleva a la publicación, donde además se
puede elegir entre AppImage, `.deb` y `.rpm`.

Consecuencia que conviene tener presente: el **nombre** del archivo se queda con el de
la primera subida (`…2.3.3…`) aunque dentro vaya una versión posterior. Quien lo
descargue verá ese nombre. Cambiarlo obliga a subir un archivo con otro nombre, sacar
su enlace y actualizarlo en dos sitios: `index.html` de la página y
`DROPBOX_ENLACE_*` en `.github/workflows/release.yml`.

Para crear las credenciales:

1. En <https://www.dropbox.com/developers/apps> → **Create app** → *Scoped access* →
   *Full Dropbox* (los archivos no están en una carpeta de app).
2. Pestaña **Permissions**: marcar `files.content.write`, `files.content.read` y
   `sharing.read`. Guardar. Si se marcan *después* de generar el token, hay que
   generarlo otra vez: los permisos quedan grabados en el token.
3. Pestaña **Settings**: copiar *App key* y *App secret*.
4. Conseguir el token de refresco. Abrir en el navegador, con la app key propia:

   ```
   https://www.dropbox.com/oauth2/authorize?client_id=APP_KEY&response_type=code&token_access_type=offline
   ```

   Autorizar, copiar el código que sale y canjearlo:

   ```bash
   curl -u APP_KEY:APP_SECRET \
     -d grant_type=authorization_code -d code=EL_CODIGO \
     https://api.dropbox.com/oauth2/token
   ```

   El `refresh_token` de la respuesta es el secreto. El `access_token` **no** sirve como
   secreto: caduca a las cuatro horas. El workflow pide uno nuevo en cada ejecución.

La ruta de los archivos dentro de Dropbox no se escribe en ningún sitio: el script
`.github/scripts/subir-a-dropbox.sh` se la pregunta a la API a partir del propio enlace.
Mover la carpeta en Dropbox no rompe nada; borrar los archivos y volver a subirlos, sí
—serían archivos nuevos, con enlaces nuevos.

---

## 2. Etapas: pre-release, alfa, beta, estable

El número de versión y la etapa contestan preguntas distintas y por eso se
guardan separados.

El **número** (`2.3.6`) dice cuánto ha cambiado desde la anterior. Lo consume el
actualizador, que compara versiones y no entiende de adjetivos: tiene que seguir
siendo semver limpio o deja de ofrecer nada.

La **etapa** dice en qué punto está el producto, y va dirigida a quien lo
instala. No es lo mismo la 2.3.6 de algo terminado que la 2.3.6 de algo que
todavía se está armando. Se muestran juntos —«Alfa 2.3.6»— y se guardan aparte.

**Hoy estamos en etapa `estable` (versión `1.0.0`).**

| Etapa | Qué significa |
|---|---|
| `pre-release` | Se entrega para probarlo. La numeración arranca de cero: lo publicado antes no es una versión anterior de esto. |
| `alfa` | Se usa de verdad, pero puede cambiar de forma entre versiones. Cosas que faltan y cosas que se rompen. |
| `beta` | Completa en funciones. Se arreglan fallos, no se añaden capacidades. |
| `estable` | La etiqueta desaparece del nombre: se ve solo el número (ej. `1.0.0`). |

Para cambiar de etapa hay que tocar **dos archivos**, y los dos tienen que
coincidir:

| Dónde | Qué |
|---|---|
| `desktop/src/core/version.ts` | `export const ETAPA` |
| `flutter_app/lib/core/version.dart` | `const String etapa` |

El nombre de la release **ya no se escribe en el workflow**: lo deriva
`.github/scripts/comprobar-version.mjs` a partir de `version.ts`, y el mismo
script falla la publicación si los dos archivos no dicen lo mismo. Mientras
estuvo escrito a mano en el YAML eran tres sitios que tenían que acordarse el
uno del otro, y el que se olvidaba publicaba una release con la etapa anterior.

En `estable` la etiqueta queda vacía y el nombre vuelve a ser solo el número.

Lo que **no** hay que hacer es meter la etapa dentro del número (`2.3.6-alfa`).
El actualizador de Tauri y el `versionCode` de Android comparan versiones, y un
sufijo ahí cambia el orden de una forma que ninguno de los dos promete respetar.

> ⚠️ **Bajar el número rompe la cadena de actualización, y es irreversible para
> lo ya instalado.** Los dos actualizadores solo ofrecen lo que sea **mayor**
> que lo instalado: `tauri-plugin-updater` no instala una versión inferior, y
> el móvil descarta la release en `compareVersions(latest, installed) <= 0`.
>
> El 26 de agosto de 2026 se pasó de `2.14.0` a `pre-release 0.1.0` y se
> comprobó en carne propia: las instalaciones existentes se quedaron sin
> ninguna actualización que aceptar, y ningún cambio en el servidor podía
> arreglarlo — la comparación va **dentro** del binario instalado.
>
> La salida fue publicar `2.15.0` y `2.16.0` como **puente**: números mayores,
> con soporte para `allowDowngrades` (escritorio) y comparación `== 0` en vez de
> `<= 0` (móvil). **Desde la 2.15.0 en adelante se instala lo que esté publicado,
> aunque el número baje**, lo cual hace posible renumerar a `1.0.0` sin dejar a
> nadie fuera.
>
> Lo que sigue valiendo: el `versionCode` de Android **tiene que crecer siempre**
> (36 → 37 → 38). Es independiente del número visible, y sin eso el sistema no
> deja instalar el APK encima.

### 2.1 Salto a versión definitiva (`1.0.0`)

El producto ha salido de `pre-release` y queda configurado en `estable` con
numeración canónica `1.0.0`:

1. La etapa está en `estable` en `version.ts` y `version.dart`. La etiqueta
   queda vacía: el producto se muestra limpiamente como «1.0.0».
2. El número base está en `1.0.0` en los cuatro archivos y el `versionCode` de
   Android se incrementó a `38`.
3. `node .github/scripts/comprobar-version.mjs v1.0.0` valida la coherencia
   de todos los archivos antes del etiquetado.
4. Para publicar la versión definitiva cuando corresponda, se crea y empuja
   el tag `v1.0.0`.

### Si la publicación falla

Los fallos se reparten en dos grupos, y la diferencia importa:

- **Antes de que exista la release** (token inválido, versión descuadrada, pruebas en
  rojo): no se publicó nada y `latest.json` sigue apuntando a la versión anterior.
  Nadie se entera y no hay nada que limpiar. Se corrige la causa y se vuelve a lanzar.
- **Con la release ya creada** (falla `linux`, `android` o `manifiesto`): la release
  existe y puede quedar sin `latest.json`, y entonces los clientes reciben un 404 al
  buscar actualizaciones. **La recuperación no obliga a republicar**: se vuelve a
  lanzar solo el trabajo que falló desde la pestaña Actions. `manifiesto` compone el
  manifiesto leyendo los assets ya publicados, así que es idempotente por diseño.

Un caso concreto que ya se dio: **`RELEASES_TOKEN` caducado**. El síntoma es
`Bad credentials` y el arreglo es renovarlo en *Settings → Secrets and variables →
Actions* con permiso de contenidos de escritura sobre el repositorio de instaladores.
Que funcionara en la publicación anterior no demuestra nada: un token caduca sin que
cambie una línea del repositorio.

> ⚠️ **Desde el puente, publicar una etiqueta vieja degrada a todo el mundo.**
> Los clientes instalan lo que esté publicado, así que empujar por error un `v*`
> antiguo —o rehacer una release anterior— reparte esa versión como si fuera la
> nueva. Antes esto era imposible por construcción; ahora lo que protege es no
> empujar etiquetas viejas. La comprobación de versión ayuda: falla si la
> etiqueta no coincide con los archivos del árbol.

---

## 3. Publicar una versión

### 3.1 Subir el número de versión

El actualizador compara la versión publicada con la que lleva el binario instalado. Si
no se sube, no se ofrece nada.

**No los edites a mano. Ejecuta el script:**

```bash
node .github/scripts/subir-version.mjs patch      # o: minor | major | 1.4.2
node .github/scripts/subir-version.mjs --check    # ¿está todo alineado ahora mismo?
```

Actualiza los cuatro archivos, sube el `versionCode` de Android y regenera
`package-lock.json` y `Cargo.lock`. Si `cargo` no está instalado en tu máquina
te lo dice en vez de fingir que lo hizo.

Existía solo el verificador —el de más abajo, que **detecta** el descuadre— y no
el que lo evita. La tabla de aviso de esta misma sección cuenta cómo acabó eso.
El script es la otra mitad.

Lo que sigue explica **qué** toca, para cuando haya que revisarlo a mano o
añadir un archivo nuevo a la lista.

**Los dos que deciden la publicación:**

| Cliente | Archivo | Campo |
|---------|---------|-------|
| Escritorio | `desktop/src-tauri/tauri.conf.json` | `"version"` |
| Móvil | `flutter_app/pubspec.yaml` | `version: X.Y.Z+N` |

En el móvil hay que subir también el `+N` (el `versionCode`): Android rechaza instalar
un APK cuyo `versionCode` no sea mayor que el instalado.

**Los que hay que subir con ellos**, aunque el actualizador no los mire:

| Archivo | Por qué |
|---------|---------|
| `desktop/package.json` (+ `package-lock.json`) | Es lo que se ve en `npm run build` y en los informes de dependencias |
| `desktop/src-tauri/Cargo.toml` (+ `Cargo.lock`) | Versión del binario nativo; aparece en las propiedades del `.exe` en Windows |

> ⚠️ **Esta segunda tabla no existía y se notó**: `Cargo.toml` se quedó en 2.3.5
> mientras el resto iba por 2.5.0 — dos publicaciones con el ejecutable
> declarando una versión que no era la suya. No rompe la actualización, pero
> convierte «¿qué versión tiene este equipo?» en una pregunta sin respuesta
> fiable, que es justo lo que uno necesita saber cuando algo falla en una sala
> de cómputo.

**¿Añades un archivo que nombre la versión?** Añádelo a `ARCHIVOS` en
`subir-version.mjs` **y** a `fuentes` en `comprobar-version.mjs`. En una sola de
las dos, o queda sin actualizar o hace fallar la publicación en CI después de
que ya hayas empujado la etiqueta.

Para comprobar que no se ha quedado ninguno atrás, y de paso que la etiqueta
que vas a empujar coincide con ellos:

```bash
node .github/scripts/comprobar-version.mjs v1.0.0
```

El mismo script corre en CI **antes** de compilar, así que una versión
descuadrada no llega a publicarse. Comprueba los cuatro archivos de versión, el
`versionCode` de Android, que las dos etapas coincidan, y que la etiqueta diga
lo mismo que los archivos.

### 3.2 Etiquetar y empujar

```bash
git commit -am "chore: version X.Y.Z"
git tag vX.Y.Z
git push origin main --tags
```

El workflow `.github/workflows/release.yml` se dispara con cualquier etiqueta `v*`:

```
desktop (Windows) ──┬── linux ────┐
                    └── android ──┴── manifiesto ── espejo ── dropbox
```

1. **`desktop`** compila el escritorio en Windows, lo firma y **crea** el Release en el
   repositorio de instaladores. No genera el manifiesto.
2. **`linux`** compila la AppImage, el `.deb` y el `.rpm`, firma lo que haga falta y los
   adjunta a esa misma Release.
3. **`android`** compila el APK firmado y lo adjunta también.
4. **`manifiesto`** compone `latest.json` con lo que hay publicado, lo sube, y publica el
   espejo en este repositorio.
5. **`dropbox`** sobrescribe los tres archivos de los botones de la página, en este
   orden: **Android, Windows y Linux**. El APK va primero porque es el más pesado
   (unos 65 MB frente a 4 del `.exe`), así que si algo falla por tamaño o por tiempo
   de espera se sabe antes de haber sobrescrito los otros dos.

**Lo primero que hace el trabajo de Windows es comprobar `RELEASES_TOKEN`**, antes de
instalar nada y antes de compilar. No es ceremonia: `tauri-action` no descubre que el
token no sirve hasta que va a crear la release, y para entonces ya se gastaron seis
minutos de compilación. La primera publicación de la 1.2.0 murió exactamente así, con
«Bad credentials». Se comprueba el permiso de **escritura**, no solo que el token abra:
uno de solo lectura pasaría una comprobación ingenua y fallaría igual de tarde.

Antes de compilar corre `typecheck`, los tests del escritorio, `flutter analyze` y
`flutter test`: una versión que no pasa sus pruebas no llega a publicarse.

**El trabajo de Linux usa `npm run desktop:build`, no `tauri build`.** El script encadena
`desktop/scripts/sanear-appimage.mjs`, que quita de la AppImage `libwayland-client.so.0`
y la vuelve a empaquetar. Sin ese paso la AppImage se compila, se firma y se publica sin
un solo error, y **abre con la ventana en blanco** en cualquier equipo cuyo wayland sea
más nuevo que el de la imagen de compilación. Por eso el contenedor instala
`squashfs-tools` y por eso el script falla si no lo encuentra, en vez de dejar pasar una
AppImage sin sanear. El diagnóstico completo está en `CLAUDE.md`.

**El trabajo de Linux compila dentro de un contenedor `ubuntu:22.04`, no en el runner.**
La versión de glibc con la que se enlaza decide en qué distribuciones arranca el binario,
y esa decisión no se puede deshacer después: con la 2.35 de 22.04 corre en Debian 12 y 13,
Ubuntu 22.04+, Mint 21+, Fedora 36+, RHEL y Rocky 9, openSUSE Leap 15.5+ y Arch. Con la de
un sistema más nuevo, en varias de ellas ni arranca, y el error no menciona glibc. El
contenedor además deja la publicación al margen de la retirada de la imagen `ubuntu-22.04`
de GitHub, que empezó el 17 de septiembre de 2026.

Los pasos de Dropbox **fallan en rojo** si algo va mal en vez de avisar y seguir. Un
release publicado con Dropbox sin actualizar deja la página repartiendo la versión
anterior en silencio, que es peor que un workflow en rojo.

### 3.3 Comprobar

- El Release tiene `latest.json`, el `.exe` y el `.msi` con sus `.sig`, la `.AppImage`,
  el `.deb` y el `.rpm` con los suyos, y el `.apk`.
- `latest.json` trae las **siete** claves de la tabla de arriba. El trabajo `manifiesto`
  falla si falta alguna, así que en verde ya está comprobado — pero es lo primero que hay
  que mirar si alguien reporta que su plataforma no se actualiza.
- El workflow terminó en verde, incluidos los tres pasos de Dropbox.
- **Abrir la AppImage descargada en un equipo con Linux** y comprobar que se ve la
  pantalla de acceso, no una ventana vacía. Es la única comprobación de esta lista que no
  puede hacer CI, y es la que se saltó una vez: la publicación sale verde igual.
- Entrar a la página de descargas y bajar el `.exe`: el instalador tiene que ofrecer la
  versión nueva (el nombre del archivo dirá la vieja, es lo esperado; ver 1.3).
- Abrir el escritorio → **Configuración → Actualizaciones** → debe ofrecer la nueva.
- Abrir el móvil → **Ajustes → Actualizaciones** → ídem.

Nada de esto obliga a tocar los enlaces de la página. El campo *Enlaces de descarga* de
**Configuración** en el escritorio existe solo para mandar un botón a otro archivo
distinto; vacío es lo normal y significa «usá el que trae escrito la página».

---

## 4. Cómo lo ve el usuario

**Escritorio.** `Configuración → Actualizaciones` comprueba al abrir la pantalla.
Si hay versión nueva, muestra el número y las notas; al pulsar *Instalar y reiniciar*
descarga, verifica la firma, instala y reinicia la app sola.

En Linux **no es lo mismo según el formato**, y la tarjeta lo avisa antes de pulsar: la
AppImage se reemplaza a sí misma sin pedir nada, mientras que el `.deb` y el `.rpm`
instalan en `/usr` y el sistema levanta un diálogo de administrador. Avisar después no
serviría: para entonces el diálogo ya está en pantalla y la pregunta es si esto es de
fiar. Quien lo cancela se queda sin actualizar convencido de que la actualización está
rota.

**Móvil.** `Ajustes → Actualizaciones` hace lo mismo, pero la instalación la ejecuta
Android: la primera vez pedirá permiso para instalar apps desde esta aplicación. Sin
esa autorización explícita del usuario no se instala nada — es una decisión del sistema
operativo, no un fallo.

Ninguno de los dos actualiza en segundo plano ni interrumpe el trabajo: la comprobación
falla en silencio dentro de la tarjeta si no hay red.

---

## 5. Las plataformas que faltan

Están declaradas como `planificada` en `.github/scripts/plataformas.mjs`, con lo que las
bloquea escrito en el propio registro. No es código: es que hace falta una máquina.

**macOS.** El escritorio ya está preparado —`bundle.targets` incluye `app` y `dmg`, y el
actualizador de Tauri funciona igual—, pero compilar y firmar un `.app` exige macOS con
Xcode. Sin un Mac no hay forma soportada de producirlo. El día que lo haya, el trabajo
nuevo en `release.yml` es casi copia del de Linux y las claves del manifiesto ya están
declaradas (`darwin-aarch64`).

**iOS.** Tres motivos, en orden de dureza:

1. `flutter_app/` no tiene carpeta `ios/`; habría que generarla con
   `flutter create --platforms=ios .`.
2. Compilar y firmar un `.ipa` exige **macOS con Xcode**.
3. Distribuirlo exige el **Apple Developer Program** (99 USD/año), incluso para reparto
   interno.

El código Dart es portable: el trabajo es de configuración y firma, no de reescritura.
Lo que sí habría que rehacer es el sistema de actualización, porque iOS no permite
instalar paquetes fuera de la App Store — allí las actualizaciones las gestiona la
tienda, y por eso el registro declara `App Store` como su mecanismo y no el propio.
