# Publicar una versión

Los dos clientes se actualizan solos desde **GitHub Releases**. El escritorio verifica
la firma antes de instalar; el móvil descarga el APK y se lo entrega al instalador de
Android. Esta guía cubre lo que hay que configurar una vez y lo que hay que hacer en
cada publicación.

## Dos repositorios, y por qué

| Repositorio | Visibilidad | Contenido |
|---|---|---|
| `UTS_Nexus_Academico` | privado | el código |
| `UTS_Nexus_Releases` | público | solo los instaladores |

Un actualizador tiene que poder leer el manifiesto **sin credenciales**. La tentación
es meter un token en la app para que lea el repositorio privado, y no funciona: ese
token viaja dentro del `.exe` y del `.apk`, y sacarlo es un `strings` o descompilar el
APK. Sería entregarle la llave del repositorio a todo el que instale la app.

Separarlos resuelve las dos cosas a la vez: el código queda privado y los instaladores
siguen siendo descargables, que es exactamente para lo que existe un instalador.

Quien publica en el repositorio público es el workflow, con `RELEASES_TOKEN`. Ese
secreto vive en el runner de Actions y no entra en ningún binario.

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

El keystore de Android tiene la misma propiedad que la clave de Tauri: **Android no
deja instalar una actualización firmada con un keystore distinto al de la versión
instalada**. Si se pierde, los usuarios tienen que desinstalar y reinstalar.

---

## 2. Publicar una versión

### 2.1 Subir el número de versión

El actualizador compara la versión publicada con la que lleva el binario instalado. Si
no se sube, no se ofrece nada. Hay que tocar **los dos** archivos:

| Cliente | Archivo | Campo |
|---------|---------|-------|
| Escritorio | `desktop/src-tauri/tauri.conf.json` | `"version"` |
| Móvil | `flutter_app/pubspec.yaml` | `version: X.Y.Z+N` |

En el móvil hay que subir también el `+N` (el `versionCode`): Android rechaza instalar
un APK cuyo `versionCode` no sea mayor que el instalado.

### 2.2 Etiquetar y empujar

```bash
git commit -am "chore: version X.Y.Z"
git tag vX.Y.Z
git push origin main --tags
```

El workflow `.github/workflows/release.yml` se dispara con cualquier etiqueta `v*` y:

1. Compila el escritorio en Windows, lo firma y crea el Release con `latest.json`.
2. Compila el APK de release firmado y lo adjunta al mismo Release.

Antes de compilar corre `typecheck`, los tests del escritorio, `flutter analyze` y
`flutter test`: una versión que no pasa sus pruebas no llega a publicarse.

### 2.3 Comprobar

- El Release tiene `latest.json`, el `.msi`/`.exe` con su `.sig`, y el `.apk`.
- Abrir el escritorio → **Configuración → Actualizaciones** → debe ofrecer la nueva.
- Abrir el móvil → **Ajustes → Actualizaciones** → ídem.

---

## 3. Cómo lo ve el usuario

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

## 4. iOS

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
