# UTS Nexus Académico — Cliente de escritorio

Aplicación de escritorio nativa construida con **Tauri 2 + React 19 + TypeScript**.
Es *la* aplicación de escritorio: reemplazó a `desktop_python/` (PySide6), que
ya no tiene lanzador y solo queda como referencia histórica.

La decisión técnica que le dio origen está en
[`../docs/ARQUITECTURA_V2.md`](../docs/ARQUITECTURA_V2.md) (documento histórico).

---

## 1. Requisitos

| Requisito | Para qué | Estado |
|---|---|---|
| **Node.js ≥ 20** | Frontend y backend | ✅ v24.18 |
| **MongoDB Atlas** | Base de datos (sin cambios) | ✅ Configurado |
| **Rust + rustup** | Compilar el binario nativo | ✅ 1.97.1 (`x86_64-pc-windows-msvc`) |
| **VS Build Tools (C++)** | Enlazador `link.exe` + Windows SDK | ✅ 2022 · MSVC 14.44 · SDK 10.0.26100 |
| Ollama | Asistente de IA local | Opcional |

Para reproducir el entorno en otro equipo Windows:

```powershell
winget install Rustlang.Rustup
winget install --id Microsoft.VisualStudio.2022.BuildTools -e --override `
  "--wait --passive --norestart --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.VC.Tools.x86.x64 --add Microsoft.VisualStudio.Component.Windows11SDK.22621 --includeRecommended"
```

> **Cuidado con winget y Visual Studio.** winget consulta el registro de
> programas de Windows, no lo que Visual Studio tiene realmente instalado. Si
> existe la entrada del *Visual Studio Installer* sin ningún producto detrás,
> winget responde «already installed» y no instala nada. La comprobación
> confiable es `vswhere`:
>
> ```powershell
> & "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe" `
>   -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
> ```
>
> Si no devuelve una ruta, el toolset de C++ no está, por más que winget diga lo
> contrario. En ese caso hay que reinstalar con `--force`.

Sin Rust **solo** se pierde el empaquetado nativo. Todo lo demás —desarrollo,
pruebas, compilación del frontend— funciona igual.

---

## 2. Puesta en marcha

```bash
# 1. Backend (una sola vez, o cuando cambie)
cd backend
npm install
npm run build

# 2. Cliente de escritorio
cd ../desktop
npm install
```

### Desarrollo en navegador (no requiere Rust)

```bash
npm run dev          # http://localhost:5183
```

La app detecta que no está dentro de Tauri y degrada con elegancia: los tokens
van a `sessionStorage` en lugar del llavero del sistema, y las descargas usan el
mecanismo del navegador. Todo lo demás es idéntico.

### Aplicación de escritorio (requiere Rust)

```bash
npm run desktop:dev      # ventana nativa con recarga en caliente
npm run desktop:build    # instalador en src-tauri/target/release/bundle/
```

`desktop:build` empaqueta para el sistema donde se ejecuta —Tauri no compila
cruzado—: NSIS y MSI en Windows, AppImage + `.deb` + `.rpm` en Linux, `.dmg` en
macOS. Lo específico de Linux vive en `src-tauri/tauri.linux.conf.json`, que
Tauri fusiona sobre `tauri.conf.json` cuando el objetivo es Linux; las
dependencias de compilación por distribución están en el README de la raíz.

**`desktop:build` encadena `scripts/sanear-appimage.mjs`, y por eso no se usa
`tauri build` a secas.** Ese script quita de la AppImage `libwayland-client.so.0`
y la vuelve a empaquetar. Sin él la AppImage se construye, se firma y se publica
sin un solo error, y **abre con la ventana en blanco** en cualquier equipo cuyo
wayland sea más nuevo que el de la máquina de compilación: la librería
empaquetada tapa a la del sistema, el EGL de Mesa no puede inicializar la
plataforma wayland contra una versión más vieja y `WebKitWebProcess` aborta. En
Windows y macOS el script no hace nada. El porqué completo está en `CLAUDE.md`.

> **Compilando en local sin la clave de firma**, `tauri build` termina en error
> («A public key has been found, but no private key»), así que el `&&` corta y
> **el saneado no llega a ejecutarse**: la AppImage que queda en `bundle/appimage/`
> abre con la ventana en blanco. No es un fallo nuevo, es esa AppImage sin sanear.
> Se arregla con `node scripts/sanear-appimage.mjs`, que es idempotente. En la
> publicación no pasa: allí la clave está y el saneado corre.


---

## 3. Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo en el navegador |
| `npm run desktop:dev` | Ventana nativa de Tauri con recarga en caliente |
| `npm run build` | Verifica tipos y compila el frontend a `dist/` |
| `npm run desktop:build` | Genera el instalador nativo |
| `npm run typecheck` | Verificación de tipos, sin emitir |
| `npm test` | Pruebas unitarias (Vitest) |
| `npm run test:watch` | Pruebas en modo observador |

---

## 4. Configuración

Todas las variables son opcionales; cada una tiene un valor por defecto
funcional. Para personalizarlas, crea un archivo `.env` en `desktop/`:

```ini
# Raíz del servidor API, SIN el sufijo /api/v1
VITE_SERVER_URL=http://127.0.0.1:4000

# Milisegundos antes de abortar una petición normal
VITE_REQUEST_TIMEOUT_MS=20000

# Presupuesto para operaciones lentas: reportes y respuestas de IA local
VITE_LONG_REQUEST_TIMEOUT_MS=120000

# Versión mostrada en Configuración. La rellena el build desde
# `src-tauri/tauri.conf.json`; solo hace falta ponerla a mano en `npm run dev`,
# que corre en el navegador y no tiene el shell nativo que la aporta.
VITE_APP_VERSION=2.6.0
```

La dirección del servidor también se puede cambiar desde la propia app, en
**Configuración → Servidor**, y queda guardada en el llavero del sistema.

---

## 5. Estructura

```
src/
├── app/              Composición raíz: router, providers, error boundary
├── core/             Núcleo sin UI
│   ├── api/          Cliente HTTP, errores tipados, claves de caché
│   ├── auth/         Tokens (llavero del SO) y permisos por rol
│   ├── config/       Configuración tipada y validada
│   ├── platform/     Puente con el shell nativo
│   └── realtime/     socket.io → invalidación de caché
├── domain/           Modelos, esquemas zod y puertos (sin React)
├── infrastructure/   Adaptadores HTTP de los puertos
├── features/         Un módulo por capacidad del negocio (11 pantallas)
├── shared/           Sistema de diseño, layouts, hooks, utilidades
├── state/            Estado de cliente (sesión, tema, toasts, sync)
└── styles/           Tokens de diseño y estilos globales

src-tauri/            Shell nativo en Rust
├── src/commands/     secure_store · backend · files
└── capabilities/     Permisos nativos (lista blanca mínima)
```

**Regla de dependencia:** `features → domain ← infrastructure`.
El dominio no importa React, ni `fetch`, ni Tauri.

---

## 6. Decisiones que conviene conocer

**El cliente no calcula notas.** El motor canónico (30% trabajos, 60% parciales,
10% autoevaluación; cortes 33/33/34) vive en
`backend/src/domains/grading/grading.service.ts`. El escritorio captura
componentes y muestra lo que el backend consolida. Dos implementaciones de la
misma rúbrica terminan discrepando, y la nota que ve el estudiante debe ser una
sola.

**Los tokens nunca tocan el disco en texto plano.** Se guardan en DPAPI
(Windows), Keychain (macOS) o Secret Service (Linux), accesibles solo mediante
comandos con lista blanca de claves.

En Linux hay un caso que Windows y macOS no tienen: el Secret Service
(gnome-keyring, KWallet) es un paquete que **puede no estar instalado** —XFCE
mínimo, i3, varios Debian de escritorio—, y sin respaldo eso significa que no se
puede guardar la sesión, es decir, que la aplicación no sirve. `almacen_linux`
es ese respaldo: archivo en `~/.local/state`, modo `0600`, cifrado con
XChaCha20-Poly1305. Se intenta **siempre el llavero primero** y la lectura mira
los dos sitios, así que instalar o quitar gnome-keyring no cierra la sesión de
nadie. Configuración dice cuál de los dos está en uso, porque el respaldo
protege menos —su clave se deriva de la máquina, así que la defensa real es el
`0600`— y esa pantalla existe para no afirmar cosas que no se han comprobado.

**La renovación de sesión es de un solo vuelo.** Diez peticiones que reciben 401
simultáneamente disparan **una** renovación, no diez. Está cubierto por pruebas
en `tests/unit/http-client.test.ts`.

**Toda respuesta se valida con zod.** Un cambio de contrato en el backend
aparece como un error `contract` claro, no como `undefined is not an object`
tres componentes más abajo.

**El color nunca comunica solo.** Los indicadores de riesgo llevan icono y texto
además del color. Esa insignia decide si un docente interviene con un estudiante.

---

## 7. Atajos de teclado

| Atajo | Acción |
|---|---|
| `Ctrl K` | Búsqueda global (estudiantes, materias, acciones) |
| `Ctrl B` | Contraer / expandir el menú lateral |
| `Ctrl ⇧ L` | Cambiar tema (claro → oscuro → automático) |
| `Ctrl 1…7` | Saltar a una sección |

---

## 8. Estado

| Fase | Estado |
|---|---|
| 1 · Auditoría | ✅ |
| 2 · Arquitectura | ✅ `docs/ARQUITECTURA_V2.md` |
| 3 · Andamiaje + sistema de diseño | ✅ |
| 4 · Núcleo (auth, HTTP, llavero, socket) | ✅ |
| 5 · Migración de los 11 módulos | ✅ |
| 6 · Rendimiento (lazy, virtualización, caché) | ✅ |
| 7 · Servicio ML + RAG | ⏳ Pendiente |
| 8 · Pruebas E2E | ⏳ Pendiente (29 unitarias ✅) |
| 9 · Documentación ampliada | ⏳ Parcial |

### Artefactos generados

| Artefacto | Sistema | Tamaño |
|---|---|---|
| `uts-nexus-desktop.exe` | Windows | 4,7 MB |
| Instalador NSIS (`*_x64-setup.exe`) | Windows | 2,1 MB |
| Instalador MSI (`*_x64_en-US.msi`) | Windows | 2,7 MB |
| `*.deb` | Linux | unos pocos MB |
| `*.rpm` | Linux | unos pocos MB |
| `*.AppImage` | Linux | bastante más |

Se generan en `src-tauri/target/release/bundle/`. La compilación completa en
frío toma ~9 minutos (LTO activado); las siguientes son incrementales.

La diferencia de tamaño en Linux no es descuido: el `.deb` y el `.rpm` usan el
WebKit del sistema y la AppImage lo lleva dentro, que es justamente lo que la
hace funcionar en cualquier distribución.
