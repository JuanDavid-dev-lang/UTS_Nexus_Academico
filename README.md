<div align="center">

# UTS Nexus Académico

**Plataforma académica unificada · Universidad de Santander (UTS)**

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Flutter](https://img.shields.io/badge/Flutter-3-02569B?logo=flutter&logoColor=white)](https://flutter.dev/)
[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com/atlas)
[![Socket.io](https://img.shields.io/badge/Socket.io-4-010101?logo=socket.io&logoColor=white)](https://socket.io/)
[![License](https://img.shields.io/badge/Licencia-MIT-blue)](LICENSE)

*Un backend. Una base de datos. Tres interfaces. Todo sincronizado en tiempo real.*

</div>

---

## Índice

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

**UTS Nexus Académico** integra en una sola plataforma la gestión de notas, asistencia, riesgo académico y reportes de la Universidad de Santander, con soporte para docentes, administradores y estudiantes desde tres aplicaciones independientes que comparten un backend central y una base de datos en la nube.

```
┌─────────────────────────────────────────────────────────────────┐
│                      UTS Nexus Académico                        │
│                                                                 │
│   📱 App Móvil (Flutter)        🖥️  App Escritorio (Python)     │
│   Docentes + Estudiantes        Administradores + Docentes      │
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
| Dio | Cliente HTTP con interceptores |
| socket_io_client | WebSocket con auth JWT |

### App de escritorio
| Tecnología | Uso |
|-----------|-----|
| Python 3.10+ | Runtime |
| PySide6 | UI nativa multiplataforma (Qt6) |
| python-socketio | WebSocket para sincronización en tiempo real |
| requests | Cliente HTTP |

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
├── desktop_python/                # App de escritorio (PySide6)
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
│   ├── FUNCIONAMIENTO.md          # Guía de uso completa
│   └── REFACTOR.md                # Arquitectura, modelo de datos y migración
│
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

**Doble clic en `abrir_pc.bat`** — abre el ejecutable compilado, o crea el
entorno virtual y ejecuta desde código automáticamente.

```bash
# Alternativa manual
cd desktop_python
pip install -r requirements.txt
python main.py
```

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

```env
# backend/.env
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/uts_nexus
JWT_SECRET=tu_secreto_super_seguro
JWT_REFRESH_SECRET=otro_secreto_diferente
PORT=4000

# Escaneo automático de riesgo (0 = desactivado)
RISK_SCAN_INTERVAL_MIN=30
```

---

## Credenciales de demo

> Disponibles tras ejecutar `npm run seed`

| Rol | Email | Contraseña |
|-----|-------|------------|
| Administrador | `admin@uts.edu.co` | `Uts12345!` |
| Coordinación | `coordinador@uts.edu.co` | `Uts12345!` |
| Docente | `docente@uts.edu.co` | `Uts12345!` |
| Estudiante | `estudiante@uts.edu.co` | `Uts12345!` |

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
| `PUT` | `/grades/:id` | Actualizar nota |
| `DELETE` | `/grades/:id` | Eliminar nota |
| `GET` | `/grades/consolidado` | Nota final calculada por el backend |

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
| `GET` | `/reports/pdf/notas` | PDF de notas por corte y componente |
| `GET` | `/reports/pdf/asistencia` | PDF de registros de asistencia |
| `GET` | `/reports/pdf/completo` | PDF notas + asistencia |
| `GET` | `/reports/pdf/consolidado` | PDF con nota final, estado y % asistencia |
| `GET` | `/reports/excel/notas` | Excel de notas |
| `GET` | `/reports/excel/asistencia` | Excel de asistencia |
| `GET` | `/reports/excel/consolidado` | Excel consolidado (Cédula, Estudiante, C1, C2, C3, Nota final, Estado, Asistencia, Semestre) |

---

## WebSocket en tiempo real

El servidor emite eventos a **salas privadas por usuario** (`user:<id>`), nunca en broadcast global.

**Conexión (requiere JWT):**
```javascript
// Flutter / JS
const socket = io("http://localhost:4000", {
  auth: { token: accessToken }
});
```

```python
# Python (desktop)
sio.connect(url, auth={"token": access_token})
```

**Eventos emitidos:**

| Evento | Cuándo |
|--------|--------|
| `grade:created` | Al guardar una nota nueva |
| `grade:updated` | Al modificar una nota |
| `attendance:created` | Al registrar asistencia |
| `notification:new` | Al generar alerta de riesgo |

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
**Activación manual:** botón "Escanear riesgo" en la app de escritorio o `POST /notifications/risks/scan`

Las notificaciones son **idempotentes** (sin duplicados) y se envían al docente y al propio estudiante por WebSocket.

---

## Comandos útiles

```bash
# Desde /backend
npm run dev              # Servidor con recarga automática (desarrollo)
npm run build            # Compilar TypeScript
npm start                # Servidor compilado (producción)
npm run seed             # Sembrar / resetear datos de demo
npm run smoke            # Smoke test end-to-end (servidor debe estar arriba)
npm run migrate:enrollments  # Migrar studentIds[] a colección Matrículas

# Docker
docker compose up --build   # Levantar backend en contenedor
```

---

## Documentación

| Documento | Contenido |
|-----------|-----------|
| [`docs/COMO_ABRIR.md`](docs/COMO_ABRIR.md) | Cómo abrir la app de PC y la de Android (Android Studio) paso a paso |
| [`docs/FUNCIONAMIENTO.md`](docs/FUNCIONAMIENTO.md) | Guía de uso completa: roles, flujos, cálculos, FAQ |
| [`docs/REFACTOR.md`](docs/REFACTOR.md) | Arquitectura, modelo de datos, decisiones de diseño y plan de migración |
| [`README.txt`](README.txt) | Guía de arranque en texto plano (sin dependencias de Markdown) |
| `http://localhost:4000/docs` | Swagger interactivo (servidor debe estar arriba) |

---

<div align="center">

**Universidad de Santander (UTS) · Bucaramanga, Colombia**

Desarrollado con Clean Architecture · DDD · Single Source of Truth

</div>
