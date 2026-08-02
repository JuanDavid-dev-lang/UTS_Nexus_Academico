<div align="center">

# UTS Nexus Académico

**Plataforma académica unificada · Unidades Tecnologicas de Santander (UTS)**

[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tauri](https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Flutter](https://img.shields.io/badge/Flutter-3-02569B?logo=flutter&logoColor=white)](https://flutter.dev/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com/atlas)
[![Socket.io](https://img.shields.io/badge/Socket.io-4-010101?logo=socket.io&logoColor=white)](https://socket.io/)
[![License](https://img.shields.io/badge/Licencia-MIT-blue)](LICENSE)

*Un backend. Una base de datos. Tres interfaces. Todo sincronizado en tiempo real.*

</div>

---

## Índice

- [Licencia](#licencia)
- [Visión general](#visión-general)
- [Arquitectura](#arquitectura)
- [Stack tecnológico](#stack-tecnológico)
- [Modelo académico](#modelo-académico)
- [Motor de calificaciones](#motor-de-calificaciones)
- [Estructura del repositorio](#estructura-del-repositorio)
- [Arranque rápido](#arranque-rápido)
- [Variables de entorno](#variables-de-entorno)
- [Credenciales de demo](#credenciales-de-demo)
- [API REST — referencia rápida](#api-rest--referencia-rápida)
- [WebSocket en tiempo real](#websocket-en-tiempo-real)
- [Reportes y exportaciones](#reportes-y-exportaciones)
- [Riesgo académico](#riesgo-académico)
- [Comandos útiles](#comandos-útiles)
- [Documentación](#documentación)

---

## Visión general

**UTS Nexus Académico** integra en una sola plataforma la gestión de notas, asistencia, riesgo académico y reportes de las Unidades Tecnológicas de Santander, con soporte para docentes, administradores y estudiantes desde tres aplicaciones independientes que comparten un backend central y una base de datos en la nube.

```
┌─────────────────────────────────────────────────────────────────┐
│                      UTS Nexus Académico                        │
│                                                                 │
│   📱 App Móvil (Flutter)     🖥️  App Escritorio (Tauri+React)   │
│   Docentes + Estudiantes     Administradores + Docentes         │
│           │                              │                      │
│           └──────────────┬───────────────┘                      │
│                          ▼                                      │
│            🔧 Backend Central (Node.js / TypeScript)            │
│               Motor de notas · Asistencia · Riesgo              │
│               JWT Auth · WebSocket · REST API                   │
│                          │                                      │
│                          ▼                                      │
│              🍃 MongoDB Atlas (nube central)                     │
└─────────────────────────────────────────────────────────────────┘
```

**Regla de oro:** ningún cliente recalcula notas, asistencia ni riesgo. Todo lo calcula el backend. Los clientes solo muestran los datos. Cero lógica duplicada.

---

## Arquitectura

El backend sigue **Clean Architecture / Domain-Driven Design**:

```
backend/src/
├── domains/                  # Lógica de negocio pura (sin I/O)
│   ├── grading/              # Motor canónico de calificaciones
│   ├── attendance/           # Asistencia ponderada por minutos
│   └── risk/                 # Evaluación de riesgo académico
│
├── modules/                  # Capa HTTP (Express)
│   ├── auth/                 # Login · JWT · Refresh tokens
│   ├── grades/               # CRUD de notas + consolidado
│   ├── attendance/           # Registro y resumen de asistencia
│   ├── enrollment/           # Matrículas (bulk import CSV)
│   ├── analytics/            # Dashboard + riesgos
│   ├── notifications/        # Alertas + escáner de riesgo
│   └── reports/              # PDF y Excel (notas, asistencia, consolidado)
│
└── shared/                   # Infraestructura transversal
    ├── academic.service.ts   # Agregación única (dashboard + riesgo + reportes)
    ├── professor-scope.ts    # Aislamiento por docente (matrículas + fallback)
    ├── socket.ts             # Socket.io con auth JWT + salas por usuario
    └── scheduler.ts          # Escaneo periódico de riesgo
```

### Principios aplicados

| Principio | Implementación |
|-----------|---------------|
| **Single Source of Truth** | `computeAcademicRecords()` — una sola pipeline usada por dashboard, riesgos, notificaciones y reportes |
| **Professor Scoping** | Toda query filtra por `EnrollmentModel.professorId`; un docente nunca ve datos de otro |
| **Partial vs. Final Grade** | El dashboard usa `calcularPromedioParcial()` (solo cortes calificados) para evitar falsos positivos a mitad de semestre |
| **Immutable Domain Functions** | `domains/` son funciones puras sin efectos secundarios, 100% testeables |
| **Secure WebSocket** | Handshake exige JWT; eventos emitidos solo a salas `user:<id>`, nunca broadcast global |

---

## Stack tecnológico

### Backend
| Tecnología | Uso |
|-----------|-----|
| Node.js 18+ / TypeScript (ESM) | Runtime y tipado estático |
| Express 4 | Router HTTP |
| Mongoose 8 | ODM para MongoDB |
| Socket.io 4 | WebSocket con auth y salas |
| Zod | Validación de esquemas en runtime |
| PDFKit | Generación de PDF paginados |
| ExcelJS | Exportación a Excel con estilos |
| bcryptjs + JWT | Autenticación segura |
| tsx | Ejecución directa de TypeScript (scripts) |

### App móvil
| Tecnología | Uso |
|-----------|-----|
| Flutter 3 | UI multiplataforma (Android/iOS) |
| Riverpod | Estado reactivo y caché de providers |
| GoRouter | Navegación declarativa |
| Dio | Cliente HTTP con renovación automática de token |
| socket_io_client | WebSocket con auth JWT |
| path_provider + share_plus | Guardar y compartir reportes exportados |

**Sin configuración manual del servidor.** La app descubre el backend sola: barre
la subred del dispositivo preguntando por `/health` y recuerda el que funcionó.
La entrada manual queda como último recurso, para redes con aislamiento de
clientes. Ver `flutter_app/lib/core/network/server_discovery.dart`.

**Navegación por materia.** Los estudiantes no son una lista plana: se llega a
ellos desde su materia (`Materias → Cálculo I → sus estudiantes`), que es como
los busca un docente. Dentro de cada materia la lista se ordena por riesgo, no
alfabéticamente.

| Identificador | `co.edu.uts.nexus.academico` |
|---|---|
| Nombre visible | UTS Nexus Académico |
| Firma | Clave de depuración — **falta un keystore propio para publicar** |

### App de escritorio (v2)
| Tecnología | Uso |
|-----------|-----|
| Tauri 2 (Rust) | Shell nativo — usa el WebView del sistema, no empaqueta Chromium |
| React 19 + TypeScript | Interfaz, con tipos compartidos con el backend |
| Vite 6 | Build y recarga en caliente |
| TailwindCSS 4 | Estilos desde los tokens de `DESIGN.md` |
| Radix UI | Primitivas accesibles (foco, teclado, ARIA) |
| TanStack Query | Estado de servidor: caché, reintentos, invalidación |
| TanStack Virtual | Virtualización de listas largas |
| Zustand | Estado de cliente (sesión, tema, toasts) |
| Zod | Validación de las respuestas del backend en runtime |
| ECharts | Gráficos en canvas (carga diferida) |
| Framer Motion | Microanimaciones y transiciones |
| `keyring` (Rust) | Tokens en DPAPI / Keychain / Secret Service |

> **Instalador: 2,1 MB.** El empaquetado anterior con PyInstaller pesaba ~120 MB.

<details>
<summary>Versión anterior (Python + PySide6) — en desuso</summary>

`desktop_python/` sigue en el repositorio y funciona, pero ya no recibe
funcionalidades nuevas. Se conserva únicamente como referencia hasta que la v2
esté validada en producción. Ver [`docs/ARQUITECTURA_V2.md`](docs/ARQUITECTURA_V2.md)
para la auditoría que motivó el reemplazo.

| Tecnología | Uso |
|-----------|-----|
| Python 3.10+ | Runtime |
| PySide6 | UI nativa multiplataforma (Qt6) |
| python-socketio | WebSocket para sincronización en tiempo real |
| requests | Cliente HTTP |

</details>

### Base de datos
| Colección | Propósito |
|----------|-----------|
| `usuarios` | Auth (todos los roles) |
| `estudiantes` | Identidad global por cédula |
| `matriculas` | Vincula estudiante ↔ grupo ↔ materia ↔ semestre |
| `materias` | Materias por docente |
| `grupos` | Grupos de una materia |
| `notas` | Nota atómica por (estudiante, materia, corte, componente) |
| `asistencias` | Registro por fecha y duración real en minutos |
| `notificaciones` | Alertas de riesgo con deduplicación |

---

## Modelo académico

```
Usuario ──► Docente
              │
              ├──► Materia (2026-1 / 2026-2)
              │         │
              │         └──► Grupo
              │                 │
              │                 └──► Matrícula ──► Estudiante (por cédula)
              │                          │
              │                          ├──► Notas (corte × componente)
              │                          └──► Asistencias (fecha × minutos)
              │
              └──► Dashboard · Reportes · Notificaciones de riesgo
```

- El **Estudiante** existe globalmente, identificado por su cédula.
- La **Matrícula** lo vincula a un grupo concreto de un semestre concreto.
- Un estudiante puede estar en varios grupos; cada grupo pertenece a un único docente.

---

## Motor de calificaciones

### Por corte (3 componentes)

| Componente | Peso |
|------------|------|
| Trabajos | 30% |
| Parciales | 60% |
| Autoevaluación | 10% |

```
Nota del corte = Trabajos × 0.30 + Parciales × 0.60 + Autoevaluación × 0.10
```

### Nota final (3 cortes)

| Corte | Peso |
|-------|------|
| Corte 1 | 33% |
| Corte 2 | 33% |
| Corte 3 | 34% |

```
Nota final = C1 × 0.33 + C2 × 0.33 + C3 × 0.34    →    aprobado ≥ 3.0  (escala 0–5)
```

### Asistencia (ponderada por minutos reales)

```
% Asistencia = minutos presentes ÷ minutos totales × 100
```

Soporta clases de duración variable (30–300 min). Una clase de 3h pesa el doble que una de 1:30h.

---

## Estructura del repositorio

```
UTS-Nexus-Academico/
│
├── backend/                       # API central (Node.js / TypeScript)
│   ├── src/
│   │   ├── domains/               # Lógica pura: grades, attendance, risk
│   │   ├── modules/               # Endpoints HTTP por módulo
│   │   ├── models/                # Esquemas Mongoose
│   │   ├── shared/                # Servicios transversales
│   │   └── scripts/               # seed · smoke · migrate-enrollments
│   ├── .env.example               # Variables de entorno (plantilla)
│   └── package.json
│
├── desktop/                       # App de escritorio v2 (Tauri 2 + React 19)
│   ├── src/
│   │   ├── app/                   # Router, providers, error boundary
│   │   ├── core/                  # HTTP, auth, config, realtime, plataforma
│   │   ├── domain/                # Esquemas zod + puertos (sin React)
│   │   ├── infrastructure/        # Adaptadores HTTP de los puertos
│   │   ├── features/              # 11 pantallas, una por capacidad
│   │   ├── shared/                # Design system, layouts, hooks
│   │   ├── state/                 # Sesión, tema, toasts, sincronización
│   │   └── styles/                # Tokens de diseño
│   ├── src-tauri/                 # Shell nativo (Rust)
│   │   ├── src/commands/          # secure_store · backend · files
│   │   └── capabilities/          # Permisos nativos (lista blanca)
│   ├── tests/                     # Pruebas unitarias (Vitest)
│   └── README.md                  # Guía completa del cliente de escritorio
│
├── desktop_python/                # App de escritorio v1 (PySide6) — en desuso
│   ├── ui/                        # Widgets: notas, asistencia, dashboard…
│   ├── services/                  # API client + SyncWorker (WebSocket)
│   └── main.py
│
├── flutter_app/                   # App móvil (Flutter)
│   ├── lib/
│   │   ├── core/                  # HTTP client, WebSocket, widgets base
│   │   └── features/              # auth, grades, attendance, notifications…
│   └── pubspec.yaml
│
├── docs/
│   ├── COMO_ABRIR.md              # Cómo abrir cada aplicación, paso a paso
│   ├── ARQUITECTURA_V2.md         # Auditoría, arquitectura y plan del escritorio v2
│   ├── FUNCIONAMIENTO.md          # Guía de uso completa
│   └── REFACTOR.md                # Arquitectura, modelo de datos y migración
│
├── abrir_escritorio.bat           # Lanzador de la app de escritorio v2
├── abrir_pc.bat                   # Lanzador de la app v1 en Python (en desuso)
├── abrir_android.bat              # Lanzador de la app móvil
├── iniciar.ps1                    # Arranque automático — Windows
├── iniciar.sh                     # Arranque automático — Linux / macOS
├── docker-compose.yml             # Despliegue con Docker
└── README.txt                     # Guía de arranque en texto plano
```

---

## Arranque rápido

### 1. Configurar la base de datos

```bash
cp backend/.env.example backend/.env
# Editar backend/.env y definir MONGODB_URI con tu cadena de Atlas
```

### 2. Ejecutar el script de arranque

**Windows (PowerShell):**
```powershell
powershell -ExecutionPolicy Bypass -File .\iniciar.ps1
```

**Linux / macOS / Git Bash:**
```bash
chmod +x iniciar.sh && ./iniciar.sh
```

El script realiza automáticamente:
1. Verifica Node.js instalado
2. Instala dependencias (`npm install`)
3. Compila TypeScript (`npm run build`)
4. Siembra datos de demo (`npm run seed`)
5. Levanta el servidor en segundo plano
6. Ejecuta el smoke test de endpoints

### 3. Acceder

| Servicio | URL |
|---------|-----|
| API REST | `http://localhost:4000` |
| Documentación Swagger | `http://localhost:4000/docs` |

### App de escritorio (Windows)

**Doble clic en `abrir_escritorio.bat`.** Compila el backend si hace falta, abre
el ejecutable si ya existe, y si no lo compila por ti.

```bash
# Alternativa manual
cd desktop
npm install
npm run desktop:build    # genera el .exe y los instaladores
```

Una vez compilado, el ejecutable queda en:

```
desktop/src-tauri/target/release/uts-nexus-desktop.exe
```

Y los instaladores en `desktop/src-tauri/target/release/bundle/`:

| Artefacto | Tamaño | Para qué |
|-----------|--------|----------|
| `nsis/UTS Nexus Académico_2.0.0_x64-setup.exe` | 2,1 MB | Instalación normal (recomendado) |
| `msi/UTS Nexus Académico_2.0.0_x64_en-US.msi` | 2,7 MB | Despliegue por política de dominio |
| `uts-nexus-desktop.exe` | 4,7 MB | Ejecutar sin instalar (portable) |

**Requisitos para compilar** (solo la primera vez):

```powershell
winget install Rustlang.Rustup
winget install --id Microsoft.VisualStudio.2022.BuildTools -e --override `
  "--wait --passive --norestart --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.VC.Tools.x86.x64 --add Microsoft.VisualStudio.Component.Windows11SDK.22621 --includeRecommended"
```

Para desarrollar la interfaz sin compilar Rust: `cd desktop && npm run dev`
(abre en el navegador, con degradación automática de las funciones nativas).

> Guía completa del cliente de escritorio: [`desktop/README.md`](desktop/README.md)

<details>
<summary>App de escritorio v1 (Python) — en desuso</summary>

Sigue funcionando con **doble clic en `abrir_pc.bat`**, o manualmente:

```bash
cd desktop_python
pip install -r requirements.txt
python main.py
```

</details>

### App móvil (Flutter / Android Studio)

**Doble clic en `abrir_android.bat`** — descarga dependencias y ofrece un menú:
abrir en Android Studio, ejecutar en emulador/teléfono o generar el APK.

```bash
# Alternativa manual
cd flutter_app
flutter pub get
flutter run
# En emulador Android la API se resuelve en http://10.0.2.2:4000
# En teléfono físico, configura http://IP_DE_TU_PC:4000 en la pantalla de login
```

> Guía visual paso a paso: [`docs/COMO_ABRIR.md`](docs/COMO_ABRIR.md)

---

## Variables de entorno

Nombres exactos leídos por `backend/src/shared/env.ts`. Un nombre mal escrito no
da error: el backend cae silenciosamente al valor por defecto.

```env
# backend/.env

# Obligatoria. Sin ella el backend arranca pero no conecta a la base.
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/uts_nexus

# Secretos JWT. OJO: la variable es JWT_ACCESS_SECRET, no JWT_SECRET.
JWT_ACCESS_SECRET=tu_secreto_super_seguro
JWT_REFRESH_SECRET=otro_secreto_diferente
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=30d

PORT=4000

# Origen permitido por CORS. Para uso local con la app de escritorio, usa *
# (ver la nota de abajo).
CLIENT_ORIGIN=*

# Escaneo automático de riesgo (0 = desactivado)
RISK_SCAN_INTERVAL_MIN=30

# Asistente de IA local (Ollama)
AI_ENABLED=1
AI_BASE_URL=http://localhost:11434
AI_MODEL=llama3.1:8b
```

| Variable | Por defecto si falta | Consecuencia de omitirla |
|----------|---------------------|--------------------------|
| `MONGODB_URI` | `''` | **El backend no conecta a la base de datos** |
| `JWT_ACCESS_SECRET` | `dev-access` | Tokens firmados con un secreto público conocido |
| `JWT_REFRESH_SECRET` | `dev-refresh` | Ídem para los refresh tokens |
| `CLIENT_ORIGIN` | `*` | Ninguna en local; restringir solo en despliegue público |
| `RISK_SCAN_INTERVAL_MIN` | `0` | Sin escaneo automático de riesgo |
| `AI_ENABLED` | `1` | — |

> ### CORS y la app de escritorio
>
> `CLIENT_ORIGIN` controla qué origen acepta el backend. La app empaquetada **no
> se sirve desde `localhost`**: en Windows su origen es `http://tauri.localhost`,
> y el servidor de desarrollo usa `http://localhost:5183`.
>
> Si `CLIENT_ORIGIN` apunta a un puerto concreto (por ejemplo `5173`), el login
> desde el escritorio fallará con un error de red que **no** dice «CORS» — dirá
> simplemente que no hay conexión.
>
> Para uso local, deja `CLIENT_ORIGIN=*`.
>
> ### El backend SÍ es visible en tu red local
>
> `server.listen(PORT)` sin host hace que Node escuche en **todas** las
> interfaces (`0.0.0.0` y `[::]`), no solo en `127.0.0.1`. Compruébalo con
> `netstat -ano | findstr :4000`.
>
> Eso es justo lo que permite que la app móvil se conecte desde el teléfono. Pero
> también significa que cualquiera en la misma red Wi-Fi puede alcanzar la API.
>
> No es tan grave como suena —todos los endpoints exigen JWT y `/health` no
> revela nada—, pero conviene saberlo: no lo uses en una red pública sin un
> cortafuegos delante, y `CLIENT_ORIGIN=*` no es aceptable si algún día publicas
> el backend en internet.
>
> CORS, además, solo lo aplican los navegadores: no protege frente a un cliente
> nativo ni frente a `curl`. La autenticación es lo que protege la API; CORS
> únicamente decide qué páginas web pueden llamarla.

---

## Credenciales de demo

> Disponibles tras ejecutar `npm run seed`

| Rol | Email | Contraseña |
|-----|-------|------------|
| Administrador | `admin@uts.edu.co` | `(la que genere el seed)` |
| Coordinación | `coordinador@uts.edu.co` | `(la que genere el seed)` |
| Docente | `docente@uts.edu.co` | `(la que genere el seed)` |
| Estudiante | `estudiante@uts.edu.co` | `(la que genere el seed)` |

---

## API REST — referencia rápida

Todos los endpoints requieren `Authorization: Bearer <token>` excepto `/auth/login`.

### Autenticación
| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/auth/login` | Login → devuelve `accessToken` + `refreshToken` |
| `POST` | `/auth/refresh` | Renueva el access token |

### Notas
| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/grades` | Notas del docente (o propias si STUDENT) |
| `POST` | `/grades` | Crear nota `{corte, componentType, label, score}` |
| `PATCH` | `/grades/:id` | Actualizar nota |
| `DELETE` | `/grades/:id` | Eliminar nota |
| `GET` | `/grades/consolidado` | Nota final calculada por el backend (requiere `period`) |

### Asistencia
| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/attendance` | Registros del docente (o propios si STUDENT) |
| `POST` | `/attendance` | Registrar clase `{date, duration, present, studentId, …}` |
| `GET` | `/attendance/summary/:studentId` | Resumen con % ponderado por minutos |

### Matrículas
| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/enrollments` | Estudiantes matriculados del docente |
| `POST` | `/enrollments` | Matricular un estudiante en un grupo |
| `POST` | `/enrollments/bulk` | Importar lista CSV (cédula, nombres) y matricular |
| `DELETE` | `/enrollments/:id` | Baja suave (estado WITHDRAWN) |

### Analítica
| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/analytics/dashboard` | Métricas globales calculadas en tiempo real |
| `GET` | `/analytics/risks` | Top-50 estudiantes en riesgo con motivos |

### Notificaciones
| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/notifications` | Notificaciones del usuario autenticado |
| `POST` | `/notifications/risks/scan` | Disparar escaneo de riesgo manual |
| `PATCH` | `/notifications/:id/read` | Marcar como leída |

### Reportes
| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/reports/summary` | Resumen agregado para el panel de reportes |
| `GET` | `/reports/pdf/consolidado` | PDF con nota final, estado y % asistencia |
| `GET` | `/reports/pdf/grades` | PDF de notas por corte y componente |
| `GET` | `/reports/pdf/attendance` | PDF de registros de asistencia |
| `GET` | `/reports/pdf/combined` | PDF notas + asistencia |
| `GET` | `/reports/excel/consolidado` | Excel consolidado (Cédula, Estudiante, C1, C2, C3, Nota final, Estado, Asistencia, Semestre) |
| `GET` | `/reports/excel/grades` | Excel de notas |
| `GET` | `/reports/excel/attendance` | Excel de asistencia |
| `GET` | `/reports/excel/combined` | Excel notas + asistencia |

### Asistente de IA
| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/ai/status` | Estado de Ollama: activo, modelo cargado, URL |
| `POST` | `/ai/chat` | Consulta en lenguaje natural con contexto académico real |
| `POST` | `/ai/predict` | Nota necesaria para aprobar + escenarios por estudiante |

---

## WebSocket en tiempo real

El servidor emite eventos a **salas privadas por usuario** (`user:<id>`), nunca en broadcast global.

**Conexión (requiere JWT en el handshake):**
```javascript
// Escritorio v2 / Flutter / JS
const socket = io("http://localhost:4000", {
  transports: ["websocket"],
  auth: { token: accessToken },
});
```

Al conectar, el servidor une al cliente a dos salas: `user:<id>` y `role:<ROL>`.
Los roles `ADMIN` y `COORDINATOR` además reciben los eventos dirigidos a otros
usuarios.

**Eventos emitidos:**

| Evento | Payload | Cuándo |
|--------|---------|--------|
| `sync:ready` | `{ ok: true }` | Al completar el handshake |
| `sync:update` | `{ entity, action, id }` | Ante cualquier cambio de datos |
| `sync:pong` | `{ ts }` | Respuesta a `sync:ping` |

`sync:update` es un **evento único** con el detalle en el payload, no una familia
de eventos por entidad:

| Campo | Valores |
|-------|---------|
| `entity` | `student` · `subject` · `group` · `grade` · `attendance` · `enrollment` · `notification` · `schedule` · `activity` · `professor` |
| `action` | `create` · `update` · `delete` · `bulk` · `read` · `risk` · `reorder` |
| `id` | Identificador del registro afectado |

El cliente de escritorio v2 mapea cada `entity` a las claves de caché que
invalida, así que solo se refresca la pantalla afectada
(`desktop/src/core/realtime/socket.ts`).

---

## Reportes y exportaciones

- **PDF paginados**: encabezado repetido en cada página nueva, texto legible (color de relleno siempre reseteado), márgenes correctos.
- **Excel**: encabezado con fila fija (`freeze`), filtros automáticos, anchos de columna ajustados.
- Todos los reportes soportan filtros por `period`, `subjectId`, `groupId`, `studentId`.

---

## Riesgo académico

El backend evalúa riesgo combinando **rendimiento parcial + asistencia**:

| Nivel | Condición |
|-------|-----------|
| 🔴 **ALTO** | Puntaje ≥ 60 · ó · asistencia < 60% · ó · promedio < 2.0 |
| 🟡 **MEDIO** | Puntaje ≥ 30 · ó · asistencia < 70% · ó · promedio < 3.0 |
| 🟢 **BAJO** | Ninguna de las anteriores |

> El riesgo usa `calcularPromedioParcial()` — solo los cortes ya calificados, con pesos renormalizados — para evitar que un buen estudiante aparezca en riesgo a mitad de semestre por cortes aún no dictados.

**Activación automática:** `RISK_SCAN_INTERVAL_MIN=30` en `.env`
**Activación manual:** botón «Escanear riesgo» en la app de escritorio (pantallas
*Riesgo* y *Notificaciones*) o `POST /notifications/risks/scan`

En la app de escritorio v2, cada alerta muestra siempre el **motivo** junto al
nivel —nunca solo un color—, porque de esa insignia depende que un docente
decida intervenir con un estudiante.

Las notificaciones son **idempotentes** (sin duplicados) y se envían al docente y al propio estudiante por WebSocket.

---

## Comandos útiles

```bash
# Desde /backend
npm run check:env        # Verifica el .env sin imprimir secretos
npm run dev              # Servidor con recarga automática (desarrollo)
npm run build            # Compilar TypeScript
npm start                # Servidor compilado (producción)
npm run seed             # Sembrar / resetear datos de demo
npm run smoke            # Smoke test end-to-end (servidor debe estar arriba)
npm run migrate:enrollments  # Migrar studentIds[] a colección Matrículas

# Desde /desktop
npm run dev              # Interfaz en el navegador (no requiere Rust)
npm run desktop:dev      # Ventana nativa con recarga en caliente
npm run desktop:build    # Ejecutable + instaladores NSIS y MSI
npm run typecheck        # Verificación de tipos
npm test                 # Pruebas unitarias (Vitest)

# Docker
docker compose up --build   # Levantar backend en contenedor
```

---

## Documentación

| Documento | Contenido |
|-----------|-----------|
| [`docs/COMO_ABRIR.md`](docs/COMO_ABRIR.md) | Cómo abrir la app de PC y la de Android (Android Studio) paso a paso |
| [`desktop/README.md`](desktop/README.md) | Cliente de escritorio v2: requisitos, comandos, estructura y decisiones |
| [`docs/ARQUITECTURA_V2.md`](docs/ARQUITECTURA_V2.md) | Auditoría de la v1, arquitectura de la v2 y plan de fases |
| [`DESIGN.md`](DESIGN.md) | Sistema de diseño: paleta, tipografía, componentes y accesibilidad |
| [`docs/FUNCIONAMIENTO.md`](docs/FUNCIONAMIENTO.md) | Guía de uso completa: roles, flujos, cálculos, FAQ |
| [`docs/REFACTOR.md`](docs/REFACTOR.md) | Arquitectura, modelo de datos, decisiones de diseño y plan de migración |
| [`README.txt`](README.txt) | Guía de arranque en texto plano (sin dependencias de Markdown) |
| `http://localhost:4000/docs` | Swagger interactivo (servidor debe estar arriba) |

---

## Estado del proyecto

| Componente | Estado |
|-----------|--------|
| Backend (Node.js / TypeScript) | ✅ Operativo |
| App móvil (Flutter) | ✅ Operativa · 7 pruebas · APK firmado |
| **App de escritorio v2 (Tauri + React)** | ✅ **Operativa · 31 pruebas · instalador 2,1 MB** |
| App de escritorio v1 (PySide6) | 🗄️ En desuso, se conserva como referencia |
| **Servicio de ML** (`ml_service/`) | ✅ **Operativo · 13 pruebas** — ver [`ml_service/README.md`](ml_service/README.md) |
| Pruebas E2E | ⏳ Planificadas |

### Predicción de riesgo con aprendizaje

`ml_service/` sustituye los umbrales fijos de `domains/risk` (promedio < 3.0,
asistencia < 70%) por un modelo entrenado. Python + FastAPI + scikit-learn, con
explicación SHAP obligatoria: **ninguna predicción sale sin decir qué la causó**.

Arranca con un modelo derivado de las reglas actuales —porque una institución
nueva no tiene casos cerrados con los que entrenar— y aprende de verdad cuando
el docente valora las alertas y se cierran los semestres. Un modelo nuevo solo
reemplaza al vigente **si le gana en validación**; se compara por recall, porque
dejar de detectar a un estudiante en riesgo es peor que revisar a uno que estaba
bien.

Si el servicio se cae, el backend usa el motor de reglas y lo declara en el
campo `source` (`model` o `rules`). El docente siempre sabe de dónde salió la
alerta.

```ini
# backend/.env
ML_BASE_URL=http://127.0.0.1:8100
ML_ENABLED=1
```

---

## Licencia

Publicado bajo licencia **MIT** — ver [`LICENSE`](LICENSE).

Los derechos son de las **Unidades Tecnológicas de Santander**, y el desarrollo
es del **Grupo CIAI**. La licencia MIT permite usar, copiar, modificar y
redistribuir el proyecto, con o sin fines comerciales, con una sola condición:
conservar el aviso de copyright y el texto de la licencia en las copias.

El software se entrega **sin garantía**. Los cálculos académicos —notas,
asistencia y riesgo— siguen el reglamento de las UTS, pero la responsabilidad
sobre las notas reportadas es de cada docente y de la institución.

---

<div align="center">

**Unidades Tecnológicas de Santander · Bucaramanga, Colombia**

Desarrollado con Clean Architecture · DDD · Single Source of Truth

</div>
