# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es este repositorio

Plataforma académica de las Unidades Tecnológicas de Santander (UTS): notas, asistencia, riesgo académico y reportes. Un backend central (Node/TypeScript), una base de datos (MongoDB Atlas) y tres clientes que solo muestran datos. Documentación y commits en español.

**Regla de oro: ningún cliente recalcula notas, asistencia ni riesgo. Todo lo calcula el backend.** Si un cambio parece requerir lógica de cálculo en un cliente, está mal planteado — la lógica va en `backend/src/domains/`.

## Comandos

### Backend (`backend/`)
```bash
npm run dev              # tsx watch, puerto 4000
npm run build            # tsc
npm start                # servidor compilado
npm run seed             # sembrar/resetear datos de demo (credenciales demo en README)
npm run smoke            # smoke test E2E — requiere el servidor arriba
npm run check:env        # valida .env sin imprimir secretos
npm test                 # Vitest — dominio puro (tests/)
npm run lint             # eslint
```
`npm test` cubre `src/domains/` (grading, attendance, risk): funciones puras, sin base de datos ni servidor. Fija las reglas académicas —30/60/10, 33/33/34, aprobación en 3.0, asistencia ponderada por minutos— así que un cambio de pesos rompe una prueba en vez de cambiar notas en silencio. `npm run smoke` sigue siendo la verificación end-to-end y necesita el servidor arriba.

### Escritorio v2 (`desktop/` — Tauri 2 + React 19)
```bash
npm run dev              # UI en navegador (puerto 5183), NO requiere Rust
npm run desktop:dev      # ventana nativa con HMR (requiere Rust + VS Build Tools)
npm run desktop:build    # .exe + instaladores NSIS/MSI
npm test                 # Vitest (tests en tests/unit/)
npx vitest run tests/unit/errors.test.ts   # un solo archivo de test
npm run typecheck        # tsc --noEmit
npm run lint
```

### Móvil (`flutter_app/`)
```bash
flutter pub get
flutter run              # emulador Android resuelve la API en http://10.0.2.2:4000
flutter test
```

### Servicio ML (`ml_service/` — FastAPI + scikit-learn)
```bash
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe -m uvicorn app.main:app --port 8100
.venv\Scripts\python.exe -m pytest tests/
```

### Arranque completo
`iniciar.ps1` (Windows) / `iniciar.sh` — instala, compila, siembra, levanta el backend y corre el smoke test. Lanzadores por app: `abrir_escritorio.bat`, `abrir_android.bat`.

## Arquitectura

### Backend — Clean Architecture
- `src/domains/` — lógica de negocio **pura, sin I/O** (grading, attendance, risk). Funciones inmutables y testeables.
- `src/modules/` — capa HTTP Express por capacidad (auth, grades, attendance, enrollment, analytics, notifications, reports).
- `src/models/` — esquemas Mongoose.
- `src/shared/` — infraestructura transversal:
  - `academic.service.ts` → `computeAcademicRecords()`: **única pipeline de agregación** usada por dashboard, riesgos, notificaciones y reportes. No duplicar cálculos fuera de ella.
  - `professor-scope.ts` → toda query se filtra por `EnrollmentModel.professorId`; un docente nunca ve datos de otro. Cualquier endpoint nuevo debe respetar este scoping.
  - `socket.ts` → Socket.io con JWT en el handshake; eventos solo a salas `user:<id>` y `role:<ROL>`, nunca broadcast global.
  - `scheduler.ts` → escaneo periódico de riesgo (`RISK_SCAN_INTERVAL_MIN`).
  - `error.ts` → **traduce el error a HTTP**. `ZodError` → 400 con el campo que falla, clave duplicada de Mongo → 409, `CastError` de ObjectId → 404. Los 5xx se registran pero nunca devuelven detalle interno. No lanzar un `Error` pelado esperando un 400: sin `statusCode` cae a 500, y los clientes reintentan solos los 5xx.

### Alcance de estudiantes
- `GET /students` acepta `subjectId`, `groupId`, `period` y `q`. Para un docente los filtros se **intersectan** con su alcance, no lo reemplazan: pedir una materia ajena devuelve lista vacía, nunca los datos de otro.
- `GET /students/search` es el directorio global (identidad mínima: cédula, nombre, programa) y existe para poder matricular a alguien que aún no es tuyo. Exige 3 caracteres y tope de 50. **No devuelve notas, asistencia ni riesgo** — si algún día hace falta más campo, revisa primero si no estás filtrando el expediente de un estudiante ajeno.
- Los endpoints por id (`GET /students/:id`, `PATCH /students/:id`) comprueban el alcance con `professorOwnsStudent()`. Filtrar solo el listado deja la ficha accesible a quien copie un id.

### Modelo de datos
`Estudiante` existe globalmente por cédula. `Matrícula` lo vincula a un grupo de una materia en un semestre (`2026-1`/`2026-2`). Nota atómica por (estudiante, materia, corte, componente). Asistencia registra minutos reales por clase.

### Motor de calificaciones (canónico, en `domains/grading`)
- Corte = Trabajos 30% + Parciales 60% + Autoevaluación 10%.
- Final = C1×0.33 + C2×0.33 + C3×0.34; aprobado ≥ 3.0 (escala 0–5).
- Asistencia ponderada por minutos: `minutos presentes ÷ minutos totales`.
- El dashboard y el riesgo usan `calcularPromedioParcial()` (solo cortes calificados, pesos renormalizados) para evitar falsos positivos a mitad de semestre.

### Sincronización en tiempo real
El backend emite un evento único `sync:update` con payload `{entity, action, id}` — no una familia de eventos por entidad. El escritorio v2 mapea cada `entity` a las claves de caché de TanStack Query que invalida (`desktop/src/core/realtime/socket.ts`). Al añadir una entidad o mutación nueva, emitir `sync:update` y registrar el mapeo de invalidación.

### Escritorio v2 — capas
`domain/` (esquemas Zod + puertos, sin React) → `infrastructure/` (adaptadores HTTP de los puertos) → `features/` (una pantalla por capacidad) → `shared/` (design system según `DESIGN.md`). Estado de servidor con TanStack Query, estado de cliente con Zustand. Tokens en `keyring` (Rust) vía `src-tauri/src/commands/`. `desktop_python/` (PySide6) está en desuso — no añadir funcionalidades ahí.

### Servicio ML
Sustituye los umbrales fijos de `domains/risk` por un modelo entrenado con explicación SHAP obligatoria. Arranca con modelo bootstrap derivado de las reglas; un candidato reentrenado solo se promueve **si gana en recall** (AUC desempata), salvo que sea el primer modelo con datos reales. Si el servicio cae, el backend usa el motor de reglas y lo declara en el campo `source` (`model` | `rules`). Config en `backend/.env`: `ML_BASE_URL=http://127.0.0.1:8100`, `ML_ENABLED=1`.

## Sistema de diseño

`DESIGN.md` es la fuente de verdad y los tres clientes la implementan con la misma estructura: un archivo de tokens y cero colores o tamaños en crudo en las pantallas. Antes de escribir un color o un `fontSize` literal, comprueba que no exista ya el token.

| Concepto | Escritorio v2 | Móvil | Escritorio v1 (Python) |
|----------|---------------|-------|------------------------|
| Tokens | `desktop/src/styles/tokens.css` | `AppColors` en `lib/core/theme/app_theme.dart` | `LIGHT`/`DARK` en `desktop_python/ui/theme.py` |
| Tipografía | utilidades `text-h1 … text-caption` | `AppType` | `Theme.FS_*` |
| Estado semántico | `--success`/`--success-soft`… | `SemanticKind` + `SemanticTone` | `Theme.SUCCESS`/`SUCCESS_SOFT`… |

- **Declara el significado, no el color.** `StatusPill`, `StatTile` y `RiskBadge` (móvil) reciben un `SemanticKind` y resuelven el par (texto, fondo) contra el tema activo. Pasarles colores sueltos rompe el modo oscuro.
- **La escala tipográfica tiene cinco pasos** (36/30/24/16/13). Un tamaño fuera de ese ramp es un error, no una variante.
- **En modo oscuro los semánticos van aclarados** (`#4ADE80`, `#FBBF24`, `#F87171`, `#38BDF8`), no con los hex canónicos de §4: esos están calibrados para texto sobre blanco y sobre `#33332A` caen a 2.4–4.0:1, por debajo del AA que exigen §4 regla 5 y §15.
- **El lima `#CAD225` nunca es color de texto ni fondo de superficie grande** — solo botones, badges, selección y foco (§4 reglas 2 y 4).
- Inter va empaquetada en los tres clientes (`@fontsource/inter` en escritorio, `.ttf` en `flutter_app/assets/fonts/` y `desktop_python/assets/fonts/`). No la sustituyas por una carga remota: el CSP de Tauri no tiene `font-src` y la app móvil se usa sin red fiable.
- Los gráficos de escritorio leen los tokens en vivo y se repintan al cambiar de tema; no les pases colores fijos.

## Variables de entorno — trampas conocidas

Leídas por `backend/src/shared/env.ts`. **Un nombre mal escrito no da error: cae en silencio al valor por defecto.** Verificar con `npm run check:env`.

- La variable es `JWT_ACCESS_SECRET`, **no** `JWT_SECRET`.
- `MONGODB_URI` es obligatoria; sin ella el backend arranca pero no conecta a la base.
- `CLIENT_ORIGIN=*` para uso local: la app empaquetada de escritorio se sirve desde `http://tauri.localhost` (dev: `http://localhost:5183`). Si `CLIENT_ORIGIN` apunta a otro puerto, el login desde escritorio falla con un error de red que **no** menciona CORS.
- El backend escucha en todas las interfaces (`0.0.0.0`) — necesario para que el móvil se conecte desde el teléfono.
- **Correo saliente y aviso de versiones están apagados por defecto.** Sin `SMTP_HOST` no se envía nada y queda anotado en el log; con `RELEASE_CHECK_INTERVAL_H=0` no se consulta GitHub. Las dos degradan en silencio a propósito: una instalación local no debería necesitar servidor de correo para arrancar. Para activarlos: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE` y `RELEASE_CHECK_INTERVAL_H` (horas), `RELEASES_REPO`.

## Actualizaciones automáticas

Los dos clientes se actualizan desde **GitHub Releases**; el proceso completo está en `docs/PUBLICAR_VERSION.md`.

- Escritorio: `tauri-plugin-updater` verifica la firma minisign contra `plugins.updater.pubkey` antes de instalar. La lógica vive en `desktop/src/core/platform/updater.ts` — como el resto de `core/platform`, es el único módulo que toca el plugin y degrada a "no hay nada" en el navegador.
- Móvil: `flutter_app/lib/core/services/update_service.dart` consulta la API de Releases, descarga el APK y se lo pasa al instalador de Android. Solo Android; en otras plataformas responde que no hay actualizaciones.
- **Publicar exige subir la versión en los dos archivos** (`tauri.conf.json` y `pubspec.yaml`, incluido el `+versionCode`) y empujar una etiqueta `v*`. Sin subir la versión el updater no ofrece nada.
- La clave privada de firma **no está en el repositorio** y no debe estarlo: quien la tenga puede publicar actualizaciones falsas que las apps instaladas aceptarían como oficiales.

**iOS no existe y no se puede compilar desde Windows** (hace falta macOS con Xcode, y el Apple Developer Program para distribuir). No empieces a añadir una carpeta `ios/`: el bloqueo es de herramientas, no de código.

## Documentación de referencia

- `docs/PUBLICAR_VERSION.md` — publicar una versión, secretos de CI y manejo de las claves de firma.
- `desktop/README.md` — guía completa del cliente de escritorio v2.
- `ml_service/README.md` — ciclo de entrenamiento, endpoints y variables del modelo.
- `docs/ARQUITECTURA_V2.md` — auditoría de la v1 y arquitectura de la v2.
- `DESIGN.md` — tokens de diseño, paleta, accesibilidad (fuente de los estilos del escritorio).
- Swagger interactivo en `http://localhost:4000/docs` con el servidor arriba.
