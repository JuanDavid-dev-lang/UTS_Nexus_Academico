# Refactor UTS Académico — Arquitectura unificada

> Estado: la plataforma **ya** está separada en 3 soluciones (backend Node, escritorio
> PySide6, móvil Flutter) sobre MongoDB Atlas. Este documento describe la arquitectura
> objetivo, el modelo de datos corregido, el backlog priorizado y el plan de migración.

## 1. Principio rector

**El backend es la única fuente de verdad.** Ningún cliente (móvil o escritorio) recalcula
notas, asistencia ni riesgo: consumen endpoints. Esto elimina la duplicación de lógica que
existía (el cálculo 30/60/10 vivía solo en el escritorio Python).

## 2. Arquitectura por capas

```
plataforma-uts/
├── backend/                 # Node + Express + TS + Mongoose (ÚNICA lógica de negocio)
│   └── src/
│       ├── domains/         # ← NUEVO: lógica pura, testeable, sin I/O
│       │   ├── grading/     #   motor 30/60/10 + cortes 33/33/34
│       │   ├── attendance/  #   ponderación por minutos reales
│       │   └── risk/        #   riesgo académico (nota + asistencia)
│       ├── models/          # esquemas Mongoose (relaciones normalizadas)
│       ├── modules/         # capa HTTP por dominio (auth, grades, enrollments, ...)
│       ├── shared/          # jwt, socket (auth + salas), professor-scope, audit
│       └── scripts/         # seed, migrate-enrollments
├── desktop_python/          # SOLO UI (admin/docente) — consume el backend
└── flutter_app/             # SOLO UI (docente/estudiante) — consume el backend
```

## 3. Modelo de datos corregido

Relación de propiedad real (requisito 15):

```
Usuario(rol) ─1:1─ Profesor
Profesor ─1:N─ Materia ─1:N─ Grupo ─1:N─ Matrícula ─N:1─ Estudiante(cédula global)
                                              └── Nota / Asistencia
```

- **Estudiante**: identidad global por `code` (cédula). No se duplica entre semestres.
- **Matrícula** (`matriculas`) *NUEVO*: ata estudiante ↔ grupo/materia/periodo. Reemplaza
  los arreglos `studentIds[]`. El scoping por profesor deriva de aquí ⇒ sin fugas.
- **Nota** (`notas`) *REDISEÑADA*: cada documento es un componente atómico
  (`corte` ∈ {1,2,3}, `componentType` ∈ {TRABAJOS, PARCIALES, AUTOEVALUACION}, `score`).
  La nota del corte y la final **no se almacenan**: las calcula `domains/grading`.
- **Usuario**: rol ampliado a `STUDENT`; campo `studentId` vincula el login del alumno con
  su registro de estudiante (self-service en Android).

## 4. Reglas académicas (centralizadas en `domains/grading`)

- Corte = `30% Trabajos + 60% Parciales + 10% Autoevaluación`.
- Final = `Corte1×0.33 + Corte2×0.33 + Corte3×0.34`.
- Aprueba con `3.0`. Escala `0.0–5.0`.
- Asistencia = `minutos presentes / minutos totales × 100` (clases de 1:30 y 3:00 pesan
  distinto). En `domains/attendance`.

## 5. Endpoints nuevos / cambiados

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/grades/consolidado?period&groupId&subjectId&studentId` | Nota final por estudiante (motor canónico) |
| POST | `/grades` | Captura por `corte` + `componentType` (ya no `weight`) |
| GET/POST | `/enrollments` | Matrículas del grupo (scoped) |
| POST | `/enrollments/bulk` | Importar lista (cédula, nombres) y matricular |
| DELETE | `/enrollments/:id` | Retiro (soft) |
| POST | `/ai/predict` | Riesgo vía `domains/risk` (sin fórmula paralela) |

Realtime: el WebSocket ahora **exige JWT** en el handshake y emite por **salas**
(`user:<id>`), no en broadcast global. `emitToUser` / `emitToUsers` reemplazan a `emitSync`
para datos sensibles.

## 6. Backlog priorizado

### Hecho en esta fase (backend núcleo) ✅
1. Motor de notas canónico (30/60/10 + 33/33/34) — `domains/grading`.
2. Dominios de asistencia y riesgo puros y testeables.
3. Modelo Matrícula + scoping sin fugas.
4. Rol ESTUDIANTE + vínculo `studentId` + notas visibles para el alumno.
5. Realtime con auth + salas por usuario.
6. **Fix PDF**: paginación con repetición de encabezado + reset de color (bug de
   "letra ilegible" era falta de salto de página, no texto blanco).
7. Seed y migración actualizados.

### Hecho en la fase 2 (clientes) ✅
1. **Escritorio** (`grades_widget.py`): selecciona grupo, carga estudiantes **matriculados**
   (`/enrollments`), guarda cada componente con `corte`+`componentType` y muestra la nota
   **consolidada del backend** (ya no calcula la nota "oficial" localmente).
2. **Escritorio** (`students_widget.py`): importar CSV ahora puede **matricular en un grupo**
   vía `/enrollments/bulk`.
3. **Realtime con token en ambos clientes**: `sync_worker.py` y `realtime_service.dart`
   envían el JWT en el handshake (antes se rompía con la nueva auth de sockets).
4. **Móvil** (`features/grades/grades_page.dart`): nueva pantalla "Notas" que consume
   `/grades/consolidado`; el backend la scopea por rol (estudiante ve las suyas, docente
   las de sus grupos). Ruta y navegación añadidas.

### Hecho en la fase 3 (analítica, alertas y self-service) ✅
1. **Servicio académico compartido** (`shared/academic.service.ts`): agrega notas +
   asistencia y aplica los dominios (grading + risk). Única ruta de agregación; la usan
   dashboard, `/analytics/risks`, generador de notificaciones y reportes consolidados.
2. **Dashboard con datos reales**: `analytics/dashboard` ya no estima (adiós 78%/22% y
   `missed×0.4`); calcula aprobados/reprobados/riesgo/promedio/materias críticas con el
   motor. Usa el **promedio parcial** (solo cortes calificados) para no marcar a todos
   como reprobados a mitad de semestre.
3. **Notificaciones de riesgo automáticas**: `risk-notifier.service.ts` crea/actualiza
   `Notification` tipo RISK (dedupe por estudiante+materia+periodo) para docente y
   estudiante. Disparo manual `POST /notifications/risks/scan` y scheduler en proceso
   (`RISK_SCAN_INTERVAL_MIN`).
4. **Self-service estudiante**: `/attendance`, `/attendance/summary`, `/grades`,
   `/grades/consolidado`, `/notifications` y `/analytics/dashboard` aceptan rol STUDENT
   con scope a su propio `studentId`.
5. **Reportes consolidados** con nota final por corte + estado + asistencia
   (`/reports/pdf/consolidado`, `/reports/excel/consolidado`).
6. **Clientes**: dashboard y notificaciones del escritorio conectados a datos reales
   (con botón "Escanear riesgo"); reporte "Consolidado" añadido al escritorio.

**Refinamiento clave**: el riesgo y el promedio del dashboard usan el promedio PARCIAL
(cortes ya calificados, renormalizado), no la nota final con ceros — evita falsos
positivos de "todos reprobados" a mitad de semestre. La nota final (con ceros en lo no
calificado) se conserva solo para el reporte consolidado.

### Backlog abierto (mejoras futuras) 🔭
- Notificaciones push reales (FCM) además de IN_APP.
- Reglas de riesgo configurables por materia (umbrales).
- Provisionamiento masivo de usuarios STUDENT desde admin.
- Tests automatizados de los dominios `grading` / `attendance` / `risk`.

## 7. Plan de migración

1. `cd backend && npm install && npm run build`.
2. **Respaldo** de la base (`mongodump`) antes de tocar datos.
3. `npm run migrate:enrollments` → backfill de `matriculas` desde `studentIds[]`.
4. Notas legadas (`component`/`weight`): quedan legibles pero **no** entran al motor
   (les falta `corte`/`componentType`). Opciones: (a) recapturar en la nueva UI, o
   (b) script de mapeo si el `component` legado codifica el corte. Recomendado: recaptura,
   porque el esquema viejo no distinguía trabajos/parciales/autoevaluación.
5. Provisionar usuarios STUDENT (script o alta desde admin) enlazando `studentId`.
6. Desplegar backend, luego actualizar clientes a los nuevos endpoints.

## 8. Credenciales de demo (tras `npm run seed`)

- admin@uts.edu.co / `(la que genere el seed)`
- coordinador@uts.edu.co / `(la que genere el seed)`
- docente@uts.edu.co / `(la que genere el seed)`
- estudiante@uts.edu.co / `(la que genere el seed)`
