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

`desktop:build` genera instalador NSIS y MSI en Windows, `.dmg` en macOS y
`.deb`/AppImage en Linux.

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
tres comandos con lista blanca de claves.

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

| Artefacto | Tamaño |
|---|---|
| `uts-nexus-desktop.exe` | 4,7 MB |
| Instalador NSIS (`*_x64-setup.exe`) | 2,1 MB |
| Instalador MSI (`*_x64_en-US.msi`) | 2,7 MB |

Se generan en `src-tauri/target/release/bundle/`. La compilación completa en
frío toma ~9 minutos (LTO activado); las siguientes son incrementales.
