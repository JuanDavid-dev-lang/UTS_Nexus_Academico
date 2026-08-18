# Publicar una versión

Los dos clientes se actualizan solos desde **GitHub Releases**. El escritorio verifica
la firma antes de instalar; el móvil descarga el APK y se lo entrega al instalador de
Android. Esta guía cubre lo que hay que configurar una vez y lo que hay que hacer en
cada publicación.

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
espejo se copia tal cual del repositorio de instaladores: apunta a sus assets y conserva
su firma, así que no se firma nada dos veces ni se abre una segunda cadena de confianza.

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

La página de descargas (`utsnexus.github.io`) no manda a la gente al Release: sus dos
botones llevan escrito un archivo concreto de Dropbox. Un enlace de Dropbox apunta a un
archivo, no a «la última versión», así que el workflow escribe el instalador recién
compilado **encima** de ese mismo archivo. El enlace no cambia y lo que entrega es lo
nuevo.

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

## 2. Etapas: alfa, beta, estable

El número de versión y la etapa contestan preguntas distintas y por eso se
guardan separados.

El **número** (`2.3.6`) dice cuánto ha cambiado desde la anterior. Lo consume el
actualizador, que compara versiones y no entiende de adjetivos: tiene que seguir
siendo semver limpio o deja de ofrecer nada.

La **etapa** dice en qué punto está el producto, y va dirigida a quien lo
instala. No es lo mismo la 2.3.6 de algo terminado que la 2.3.6 de algo que
todavía se está armando. Se muestran juntos —«Alfa 2.3.6»— y se guardan aparte.

**Hoy estamos en `alfa`.**

| Etapa | Qué significa |
|---|---|
| `alfa` | Se usa de verdad, pero puede cambiar de forma entre versiones. Cosas que faltan y cosas que se rompen. |
| `beta` | Completa en funciones. Se arreglan fallos, no se añaden capacidades. |
| `estable` | La etiqueta desaparece del nombre: se ve solo el número. |

Para cambiar de etapa hay que tocar **tres sitios**, y los tres tienen que
coincidir:

| Dónde | Qué |
|---|---|
| `desktop/src/core/version.ts` | `export const ETAPA` |
| `flutter_app/lib/core/version.dart` | `const String etapa` |
| `.github/workflows/release.yml` | `releaseName:` del trabajo de escritorio |

En `estable` la etiqueta queda vacía y el nombre vuelve a ser solo el número, sin
tocar ningún otro sitio.

Lo que **no** hay que hacer es meter la etapa dentro del número (`2.3.6-alfa`).
El actualizador de Tauri y el `versionCode` de Android comparan versiones, y un
sufijo ahí cambia el orden de una forma que ninguno de los dos promete respetar.

---

## 3. Publicar una versión

### 3.1 Subir el número de versión

El actualizador compara la versión publicada con la que lleva el binario instalado. Si
no se sube, no se ofrece nada.

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

Para comprobar que no se ha quedado ninguno atrás:

```bash
grep -rn '"version"' desktop/package.json desktop/src-tauri/tauri.conf.json
grep -n '^version' desktop/src-tauri/Cargo.toml flutter_app/pubspec.yaml
```

### 3.2 Etiquetar y empujar

```bash
git commit -am "chore: version X.Y.Z"
git tag vX.Y.Z
git push origin main --tags
```

El workflow `.github/workflows/release.yml` se dispara con cualquier etiqueta `v*` y:

1. Compila el escritorio en Windows, lo firma y crea el Release con `latest.json`.
2. Escribe ese `.exe` encima del archivo de Dropbox del botón de Windows.
3. Compila el APK de release firmado y lo adjunta al mismo Release.
4. Escribe ese `.apk` encima del archivo de Dropbox del botón de Android.

Antes de compilar corre `typecheck`, los tests del escritorio, `flutter analyze` y
`flutter test`: una versión que no pasa sus pruebas no llega a publicarse.

Los pasos de Dropbox **fallan en rojo** si algo va mal en vez de avisar y seguir. Un
release publicado con Dropbox sin actualizar deja la página repartiendo la versión
anterior en silencio, que es peor que un workflow en rojo.

### 3.3 Comprobar

- El Release tiene `latest.json`, el `.msi`/`.exe` con su `.sig`, y el `.apk`.
- El workflow terminó en verde, incluidos los dos pasos de Dropbox.
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

**Móvil.** `Ajustes → Actualizaciones` hace lo mismo, pero la instalación la ejecuta
Android: la primera vez pedirá permiso para instalar apps desde esta aplicación. Sin
esa autorización explícita del usuario no se instala nada — es una decisión del sistema
operativo, no un fallo.

Ninguno de los dos actualiza en segundo plano ni interrumpe el trabajo: la comprobación
falla en silencio dentro de la tarjeta si no hay red.

---

## 5. iOS

**No hay versión de iOS y no se puede construir desde este equipo.** Tres motivos, en
orden de dureza:

1. `flutter_app/` no tiene carpeta `ios/`; habría que generarla con
   `flutter create --platforms=ios .`.
2. Compilar y firmar un `.ipa` exige **macOS con Xcode**. No hay forma soportada de
   hacerlo desde Windows.
3. Distribuirlo exige el **Apple Developer Program** (99 USD/año), incluso para reparto
   interno.

El código Dart es portable: si algún día hay un Mac, el trabajo es de configuración y
firma, no de reescritura. El sistema de actualización sí habría que rehacerlo, porque
iOS no permite instalar paquetes fuera de la App Store — allí las actualizaciones las
gestiona la tienda.
