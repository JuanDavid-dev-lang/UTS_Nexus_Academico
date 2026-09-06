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
npm run smoke            # smoke test — requiere el servidor arriba y sembrado
npm run test:e2e         # suite E2E completa sobre una base aislada (mongod local)
npm run migrate:v3       # migración v3 — simula; con -- --aplicar escribe
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
.venv\Scripts\python.exe -m uvicorn app.main:app --port 8100   # 127.0.0.1 por defecto
.venv\Scripts\python.exe -m pytest tests/
```
Escuchar fuera de `127.0.0.1` exige `ML_SHARED_SECRET` (ver `.env.example`): el
servicio se niega a arrancar sin él, porque `/train` promueve el modelo de
riesgo y `/vision/*` acepta archivos.

### Versión
```bash
node .github/scripts/subir-version.mjs patch     # o: minor | major | 1.4.2
node .github/scripts/subir-version.mjs --check   # ¿los cuatro archivos coinciden?
node .github/scripts/comprobar-version.mjs v1.0.1
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

### El molde de un módulo del backend

Tres capas, no cuatro. `domains/` (puro, con tests) → `modules/<capacidad>/` → `shared/`. Dentro de un módulo, cada archivo tiene un papel fijo:

| Archivo | Hace |
|---|---|
| `X.routes.ts` | HTTP: validar, autorizar, delegar, responder |
| `X.service.ts` | orquestación y acceso a datos |
| `X.renderer.ts` | formato de salida cuando lo hay (PDF, Excel) |

**Regla: un `.routes.ts` no importa un Modelo.** Si necesita datos, se los pide a su servicio. Es verificable con un grep y no es orden por el orden: mientras HTTP, negocio y Mongoose viven en el mismo handler, la única forma de probar el alcance de un docente es levantar servidor y base — es decir, no se prueba. `reports/` es el ejemplo a copiar; los demás módulos se van migrando cuando toque tocarlos.

No se usa Clean Architecture completa a propósito. Lo que Clean protege —el dominio— ya está aislado en `domains/` y fijado por tests; añadir entidades, casos de uso y puertos por encima serían un centenar de archivos que no responden ninguna pregunta que hoy no se pueda responder.

### Quién ve qué (`domains/scope/`)

La garantía de que un docente no ve los estudiantes de otro es **lógica pura y probada**, no código repartido por las rutas. Dos funciones importan:

- `construirAlcance()` — materias, grupos y estudiantes de un docente. La matrícula manda; las listas `studentIds[]` legadas **suman**, nunca sustituyen.
- `filtroDeListado()` — **el ámbito del rol se aplica DESPUÉS de lo que pide la URL.** Escrito al revés, un estudiante recuperaba las notas de otro con `?studentId=` y la respuesta era un 200 con una lista impecable. Ese fallo estuvo vivo en `GET /grades` y no en `GET /attendance`, con el mismo código y dos líneas intercambiadas — por eso vive en una función y no copiado en cada ruta.

El mismo patrón en reportes: `filtrosDeConsulta()` fuerza el `teacherId` del docente **siempre**, no solo cuando la petición no trae uno.

### Alcance de estudiantes
- `GET /students` acepta `subjectId`, `groupId`, `period` y `q`. Para un docente los filtros se **intersectan** con su alcance, no lo reemplazan: pedir una materia ajena devuelve lista vacía, nunca los datos de otro.
- `GET /students/search` es el directorio global (identidad mínima: cédula, nombre, programa) y existe para poder matricular a alguien que aún no es tuyo. Exige 3 caracteres y tope de 50. **No devuelve notas, asistencia ni riesgo** — si algún día hace falta más campo, revisa primero si no estás filtrando el expediente de un estudiante ajeno.
- Los endpoints por id (`GET /students/:id`, `PATCH /students/:id`) comprueban el alcance con `professorOwnsStudent()`. Filtrar solo el listado deja la ficha accesible a quien copie un id.
- **`POST /students/bulk` también comprueba el alcance**, y no es redundante con lo anterior: su upsert casa por **cédula**, no por id, así que era la puerta de atrás del `PATCH`. Bastaba mandar la cédula de cualquiera —y las entrega `GET /students/search`, que es el directorio global— para reescribirle nombre, programa y correo. `particionarLotePorAlcance()` (`domains/scope/`, puro y con pruebas) separa lo que crea de lo que modifica: **crear a quien no existe se permite siempre** (es el trabajo de la ruta), modificar a quien ya existe solo dentro del alcance. Las filas rechazadas vuelven en la respuesta; descartarlas en silencio sería una pérdida de datos con buena presentación.

### Roles y alcance

Cinco roles: `ADMIN`, `COORDINATOR`, `SECRETARY`, `PROFESSOR`, `STUDENT`
(`shared/types.ts`). Un docente se acota por **matrícula**; coordinación y
secretaría por **programa académico**; ADMIN no se acota.

- **El alcance por programa vive en `domains/scope/program-scope.ts`** (puro, con
  pruebas) y se carga una vez por petición en `middlewares/scope.ts`, que deja
  `req.alcance`. Es global sobre `apiRouter`: una ruta que se olvidara de pedirlo
  consultaría sin acotar y devolvería datos de otra carrera con un 200.
- **Sin programas asignados el alcance es la institución entera.** Es lo que
  estas cuentas veían antes de que el alcance existiera; cerrarlo a «nada» habría
  dejado a las ya creadas mirando pantallas vacías tras actualizar. Se restringe
  asignando programas desde `PATCH /usuarios/:id`, que queda en la auditoría.
- **Coordinación se asigna por área, no por título.** Una carrera de las UTS es
  una cadena propedéutica —el ciclo tecnológico continúa en el profesional sobre
  la misma línea—, así que `AREAS` en `domains/catalog/uts.ts` agrupa los dos y
  la pantalla marca la carrera entera con una casilla. **Se guardan los ids de
  programa, no el área**: el área es cómo se elige, no cómo se guarda, así el
  motor de alcance no cambia y una adscripción a un solo ciclo sigue siendo
  representable (la interfaz la marca como «a medias»). Una prueba fija que
  ningún programa del catálogo se quede sin área: uno huérfano no daría error,
  sería una carrera que nadie puede coordinar.
- **El programa de una materia manda; el del docente es respaldo.**
  `Materia.programa` es el dato declarado; si falta —datos previos al campo— se
  deduce de `Profesor.programas`. La API marca lo deducido (`programaDeducido`) y
  el escritorio lo pinta con un asterisco: un dato aproximado que se lee como
  declarado acaba en un acta.
- **Secretaría = coordinación sin escritura.** No se implementa repitiendo el rol
  en las sesenta llamadas de `requireRole`: `domains/scope/role-access.ts` decide
  las dos cosas —`rolesEfectivos()` la hace valer como coordinación **solo en
  lectura**, y `bloquearSoloLectura` (global, en `routes/index.ts`) corta
  cualquier `POST`/`PATCH`/`PUT`/`DELETE` que no esté en una lista corta de
  excepciones (sesión, bandeja propia, telemetría, sugerencia propia). El corte
  es por método, no por ruta: marcar cuáles escriben deja fuera la que se añada
  mañana, y una ruta de escritura sin marcar no falla, concede.
- Exportar es **leer**: los exportables son `GET` a propósito, para que secretaría
  pueda descargarlos.

`GET /coordinacion/*` (materias con su docente, docentes, grupos, resumen y
`export.xlsx`) es una sola pipeline —`coordination.service.ts`— rebanada tres
veces: calcular cada corte por separado garantizaba que el promedio de una
materia acabara sin coincidir con el del docente que la dicta. Los números salen
de `computeAcademicRecords()`; aquí no se calcula ninguna nota.

`POST|GET|PATCH|DELETE /usuarios` es **solo ADMIN**: quien asigna programas decide
alcances, y un rol no puede mover su propio techo. Nadie se quita a sí mismo el
rol de administración —es lo que impide dejar la instalación sin nadie que pueda
deshacerlo. El alta va por `POST /usuarios` y **no** por `/auth/register`:
aquella ruta firma los tokens de la cuenta recién creada —nació para el primer
administrador—, así que crear personal desde ahí dejaba las credenciales de otra
persona en la sesión de quien la crea. El formulario vive en el escritorio, en
Configuración → «Cuentas del personal»; la gestión continua, en Personal.

### Cuentas, sesión y recuperación
- **`POST /auth/register` es solo para ADMIN.** Acepta `role: 'ADMIN'` y la ficha de docente nace `APROBADO`, así que abierto era un generador público de administradores que además saltaba entero el diseño de `/registro`. Quien se da de alta por su cuenta pasa por `/registro`: interruptor de la administración, estado `PENDIENTE` y revisión humana.
- **`POST /auth/refresh` rota el token** (RTR): cada canje quema el anterior sobre la misma sesión. Reutilizar uno ya rotado revoca **toda** la familia de sesiones del usuario, que es la única señal disponible de que alguien copió un token.
- **El código de recuperación se envía por correo, nunca en la respuesta.** Solo vuelve en `devCode` con `ALLOW_DEV_RECOVERY_CODE=1`, fuera de producción y sin `SMTP_HOST`: las tres condiciones a la vez. Devolverlo siempre convierte `/recovery/request` en una toma de cuenta de un solo paso, porque basta conocer un correo del directorio. Antes bastaban las dos últimas condiciones, es decir, **se deducía de dos ausencias**: un despliegue que olvidara `NODE_ENV` y no tuviera SMTP lo devolvía sin que nadie lo hubiera decidido. Deducir un permiso a partir de lo que falta es lo contrario de conceder un permiso.
- **`POST /auth/password` cambia la contraseña propia y lo puede hacer cualquier rol** (incluida secretaría: escribe sobre su cuenta y sobre nada más, por eso está en la lista blanca de `role-access.ts`). Exige la actual —con solo el token, un equipo desbloqueado sería una toma de cuenta en dos clics—, **revoca todas las sesiones** y devuelve un par nuevo: sin eso, cambiarse la contraseña echaba al propio usuario al inicio de sesión y se leía como una avería. Está en Configuración de los dos clientes.
- Las contraseñas van acotadas a 128 caracteres en todas las rutas: bcrypt solo mira 72 bytes, y sin tope `bcrypt.compare` con una cadena de megabytes ocupa el único hilo del proceso.

### Listados: paginación y campos acotados
`shared/validation.ts` es la fuente única de los topes de texto (`nombre`, `linea`, `nota`, `parrafo`, `correo`, `url`) y de la paginación. Un `z.string()` sin `.max()` es una puerta abierta: el cuerpo admite 2 MB y lo que entra **se guarda**, así que después viaja en cada listado que lo incluya.

`paginacionCon(porDefecto)` añade `page` y `limit` a un listado y devuelve `{items, total, page, limit, hasMore}`. Dos reglas:
- **`items` se queda en la raíz.** Los clientes que ya leían `data.items` siguen funcionando; cambiar la forma habría obligado a publicar los tres a la vez.
- **El valor por defecto de cada endpoint es el tope que ya devolvía** (1000 en estudiantes, notas y asistencia; 2000 en matrículas; 200 o 100 en el resto). Bajarlo a un número redondo habría dejado a los móviles ya instalados pidiendo la lista de siempre y recibiendo la décima parte, sin ningún error: la toma de asistencia perdería a medio salón y nadie sabría por qué. La paginación se pide; no se impone.

### Escrituras masivas
`POST` de `/grades/bulk`, `/attendance/scan/confirm`, `/students/bulk` y `/enrollments/bulk` usan `bulkWrite()` y `auditBatch()`. **No volver al bucle de `findOneAndUpdate`**: una planilla llena de notas (500 filas × 10 columnas) eran unas quince mil idas y vueltas encadenadas a Atlas, es decir minutos de petición colgada sobre una ventana que el docente ya había cerrado.

Dos trampas al escribir uno nuevo:
- **`bulkWrite` no castea los ids.** `find()` los convierte a partir del esquema; la agregación y `bulkWrite` no. Un `studentId` en texto no casa con el ObjectId guardado, así que el filtro no encuentra nada y el upsert **crea un duplicado** en vez de actualizar.
- **La auditoría también es una escritura por registro.** Agrupar solo el upsert deja el bucle donde estaba; `auditBatch()` la reduce a un `insertMany`.
- **El alcance se comprueba antes de escribir, y de una sola consulta.** Un lote cuyo filtro es un dato del cuerpo —la cédula, el código de materia— no hereda ninguna de las comprobaciones que hace la ruta unitaria equivalente. Resolverlo fila a fila devolvería el bucle que `bulkWrite` vino a quitar: `estudiantesPorCodigo()` lo hace en una consulta y la decisión la toma una función pura.

### Importación de listados
Un listado de estudiantes se puede pegar como texto, subir como CSV o **leer de un PDF o una foto**. Los dos últimos pasan por `POST /enrollments/import/scan`, que reenvía el archivo a `/vision/roster` del servicio ML y devuelve una **propuesta con confianza por fila** — nunca escribe. La escritura sigue siendo `POST /enrollments/bulk` con lo que el docente ya revisó, y en el escritorio la lectura cae en el mismo cuadro de texto que la lista pegada a mano para que pase por la misma revisión.

Un PDF con capa de texto se lee tal cual (confianza 1.0, sin reconocimiento que pueda fallar); uno escaneado pide que lo manden como foto en vez de adivinar. **Separar proponer de escribir no es ceremonia**: una cédula mal reconocida no da error, crea un estudiante que no existe y lo matricula, y eso se descubre semanas después cuando alguien no aparece en el consolidado.

**Un listado importado crea expedientes; no reescribe los que ya existen.** En `POST /enrollments/bulk` todo lo identitario —nombre, correo, programa— va en `$setOnInsert`, y la respuesta separa `creados` de `reutilizados`. El `$set` que había antes tenía dos problemas en uno: la cédula es la clave del upsert y el directorio global la entrega a cualquier docente, así que metiendo cédulas ajenas en el listado de un grupo propio se renombraba a estudiantes de otras carreras; y el caso honesto es peor, porque un nombre mal leído sobre una cédula correcta **no da error, renombra en silencio a una persona real** y eso aparece en un acta. Corregir el nombre de alguien que ya existe se hace por su ficha, que comprueba el alcance y queda en la auditoría.

Los tres escáneres (`/enrollments/import/scan`, `/grades/import/scan`, `/attendance/scan`) **filtran el tipo de archivo por firma real**, no por el `mimetype` ni por la extensión que manda el cliente: los tipos aceptados viven en `shared/uploads.ts` y lo que pasa el filtro va a `opencv`, `pypdf` y `rapidocr`, que son parsers nativos. También es de ahí de donde sale si el archivo es una hoja de cálculo (se interpreta en el backend) o una imagen (va al servicio de visión): antes esa decisión la tomaba el nombre del archivo.

### Importación de calificaciones
Mismo contrato de dos pasos que el listado y el escáner de asistencia: `POST /grades/import/scan` **propone** (Excel lo interpreta el backend con exceljs; PDF/foto van a `/vision/grades` del servicio ML) y `POST /grades/bulk` **escribe** tras la revisión en tabla del escritorio (`grades-import-dialog.tsx`). El corte y el componente se eligen una vez por lote; cada columna lleva su `label`, y como el `label` es parte de la clave única de Nota, repetirlo **sobrescribe** — por eso la respuesta separa `creadas` de `actualizadas` y el cliente lo avisa. La lógica pura (interpretar la matriz, cruzar con matrícula reutilizando el algoritmo de `sheet-match`) vive en `domains/grading/import-notas.ts`; el clamp 0–5 nunca recorta en silencio: una nota fuera de rango se marca para revisión (un «45» suele ser un 4.5 sin punto). Solo escritorio: el texto pegado y el CSV se parsean en cliente (`desktop/src/domain/grades/parse-grades.ts`).

### Reportes: catálogo de columnas, plantilla y vista previa
`modules/reports/report-columns.ts` es la **única fuente de filas** de PDF, Excel y vista previa (`GET /reports/preview/attendance`): los tres consumen el mismo catálogo, así que no pueden divergir. La plantilla (`report-template.ts`, clave `report_template` en `ConfigModel`) parametriza membrete, logo, colores del documento y columnas visibles por tipo; la edita ADMIN desde la página de reportes del escritorio y una selección sin la cédula cae al catálogo completo. Los colores de la plantilla son contenido del documento, no UI — no pasan por los tokens del design system.

**Toda celda de Excel sale por `agregarFila()`, nunca por `ws.addRow()` directamente.** Excel y LibreOffice ejecutan cualquier celda que empiece por `=`, `+`, `-`, `@`, tabulador o retorno de carro, y las columnas de estos informes son texto que escribe gente: el nombre de un estudiante llega por importación de listado o por OCR de una foto, y la observación de una asistencia son 500 caracteres libres. Quien abre el acta es coordinación o secretaría, así que **el que ejecuta no es el que escribió**. `celdaSegura()` antepone un apóstrofo —el escape que Excel entiende, invisible al abrir— y deja los números intactos, porque un `-2` numérico es una nota y convertirlo a texto rompería las sumas de la hoja. `shared/sanitize.ts` no cubría esto: sanea lo que se **guarda**, no lo que **sale** hacia un archivo.

### Buzón de sugerencias (`/feedback`)
El docente escribe (escritorio y móvil), ADMIN revisa y cambia el estado; al resolver/descartar se avisa al autor vía `crearNotificacion()` con `dedupeKey`. No confundir con `risk-feedback` (realimentación del modelo ML). Un docente solo ve lo suyo.

### Perfiles institucionales (`/instituciones`)

Las universidades **no están en el código**: son documentos de `instituciones`
(`models/institution.model.ts`) que ADMIN crea desde la pantalla «Perfiles
institucionales» (`/instituciones`) del escritorio, y el selector de `/registro` las lee de
`GET /registro/catalogo` (`instituciones`, solo las activas). Añadir una no
toca ningún cliente ni exige redesplegar.

- `domains/institutions/institution-profile.ts` es la lógica pura, con pruebas:
  `normalizarNombre()` (sin tildes, minúsculas, sin puntuación) decide qué es un
  duplicado; `buscarCoincidencias()` distingue `exacta` (nombre, sigla o alias
  ya usados: bloquea con 409) de `posible` (parecido: solo advierte);
  `validarConfiguracionAcademica()` exige pesos en (0,1] que sumen 1 y una
  escala coherente.
- `institutionId` es un slug estable e **inmutable** (`uts`, `uis`, `udes`…), **generado por el servidor** desde la sigla (`unab`, `unab-2`… si ya existe): es
  lo que usará UniPlanner. `_id` es el vínculo interno desde `Profesor.institutionId`.
- **Solo UTS nace con configuración**, y se deriva de `RUBRICA`
  (`configuracionDesdeRubrica()`), no se copia: una prueba fija que coinciden.
  UIS, UDES y las nuevas nacen con `configuracionAcademica: null` hasta que un
  administrador las configure. No inventar ponderados.
- `shared/institutions-bootstrap.ts` corre en cada arranque (y en el seed y la
  E2E): crea los tres perfiles **solo si faltan** —lo editado manda— y vincula
  a UTS a los docentes sin institución y sin solicitud (antes de los perfiles
  todas las cuentas eran UTS).
- El registro acepta `institutionId` (activa) **o** `institucionSolicitada`
  (texto libre). Si el texto coincide exactamente con nombre, sigla o alias de
  una activa se vincula solo; si no, queda en `GET /instituciones/solicitudes`
  y ADMIN la asocia a una existente o crea el perfil desde ahí. Sin ninguno de
  los dos se asume UTS: un móvil anterior a esta capacidad no manda el campo.
- Borrar es lógico y solo sin docentes vinculados (409 si los hay: lo que
  corresponde es desactivar). Una desactivada no se ofrece en el registro ni
  acepta `institutionId` a mano, pero conserva docentes e historial.
- **Toda cuenta que no sea ADMIN pertenece a una institución** (`Usuario.institutionId`,
  la misma que `Profesor.institutionId` para docentes; se escriben juntas). ADMIN va
  sin ella y ve todas. El alcance de coordinación y secretaría
  (`domains/scope/program-scope.ts`, `institutionId` en `AlcanceDePrograma`) solo
  deja entrar materias dictadas por docentes de su institución, tengan o no
  programas asignados; sin programas y con institución el alcance es «su
  institución entera», no total. Se asigna desde Personal (`POST|PATCH /usuarios`,
  obligatoria salvo ADMIN) y el arranque vincula a UTS a las cuentas anteriores.
- Un docente **nunca** edita su institución ni la configuración: `PATCH
  /professors/me` no acepta el campo y todo `/instituciones` de escritura es
  ADMIN. Coordinación y secretaría solo leen.
- El motor de calificación sigue aplicando `RUBRICA` para todos; la
  configuración por institución se guarda y valida, pero **todavía no
  parametriza `domains/grading`**. Hacerlo es un cambio aparte (tipos
  `CorteNumero = 1|2|3` y clientes que pintan tres cortes).

### Directores de trabajo de grado
`esDirectorTrabajoGrado` en `Profesor` lo activa ADMIN/COORDINATOR desde la pantalla Docentes del escritorio (`PATCH /professors/:id`; nunca editable por `/me`). El middleware `requireDirector` consulta la ficha —no el token—, así que activar el flag surte efecto sin cerrar sesión. Los formatos oficiales (`/trabajos-grado/formatos`) se guardan en `backend/formatos/`, **fuera** de `uploads/` que es estático y público: se descargan solo por la ruta autenticada. El gate del menú en los dos clientes lee el flag del perfil (`sidebar.tsx` / `esDirectorProvider`).

### Ciclo de vida del periodo académico

`AcademicPeriod` da estado a lo que antes era solo la cadena `'2026-1'`:
`OPEN` → `CLOSING` → `CLOSED`. Con `CLOSING` o `CLOSED`, **notas, asistencia y
matrículas responden 409** (`shared/period-guard.ts`, con caché de 10 s para no
consultar el estado 500 veces en una importación). Horarios, actividades y
avisos siguen editables: no forman parte del acta, así que bloquearlos
impediría corregir datos sin proteger nada. La lista está en
`domains/periods/period-lifecycle.ts` y la fijan pruebas.

`CLOSING` existe porque el cierre puede interrumpirse: marcarlo cerrado desde
el principio dejaría un periodo cerrado con la fotografía a medias, y no
bloquear nada dejaría notas fuera del acta sin que nadie lo notara. El cierre
es idempotente y reanudable; **nunca queda `CLOSED` con la fotografía
incompleta**.

La fotografía es **un documento por (estudiante, materia, periodo)**, no uno
por periodo: uno solo superaría los 16 MB de MongoDB el día del cierre. Lo que
guarda ya viene de `computeAcademicRecords()`; aquí no se recalcula nada.
Reabrir **no borra** la fotografía anterior: anota autor, fecha, motivo y
versión en `reopenings[]`.

### Estado de una actividad: `LATE` no se persiste

Lo guardado es `OPEN` o `CLOSED` —una decisión de una persona— y el `estado`
que devuelve la API lo deriva `domains/activities/activity-status.ts`
comparando `dueAt` con el reloj del servidor. Persistirlo obligaría a un
proceso que recorriera todas las actividades cada minuto, y cualquier fallo
suyo dejaría vencidas presentándose como abiertas sin que nada lo delatara. Los
clientes **no** comparan fechas: un equipo con la hora mal puesta mostraría
vencida una entrega que no lo está.

### Saneado de auditoría y telemetría

`shared/sanitize.ts` es el punto único, y se aplica **al escribir** dentro de
`auditChange`/`auditBatch`, no al leer: sanear solo al leer dejaría las
contraseñas guardadas en la colección. Elimina por nombre de campo y enmascara
por patrón (correos, JWT, cadenas de conexión, cédulas) dentro de cadenas
libres. `calcularDiff()` registra solo lo que cambió.

La lectura (`/audit`) es **solo ADMIN**: contiene los cambios de todo el mundo,
y abrirla a coordinación la convertiría en una forma de vigilar al personal.

### Patrones de inasistencia

`domains/attendance/patterns.ts` es puro y tiene pruebas. Los umbrales viven en
`UMBRALES_PATRON`, en un solo sitio: **no se replican en los clientes**, que
solo llevan el título legible. Dos reglas que las pruebas fijan: se mira la
racha **final** (una racha de marzo que terminó no es un problema en mayo) y
con 3 o más consecutivas no se emite además el patrón de 2.

`lateMinutes` en Asistencia es opcional con defecto 0 y **no se infiere**: un
listado escaneado no trae la hora de llegada, y un retraso inventado abriría
casos sobre estudiantes puntuales.

Un `CasoAsistencia` es único por (estudiante, materia, periodo, patrón), sin
fecha: el hecho seguido es el problema, no el día. Que el patrón desaparezca lo
pasa a `RESUELTO`; **no lo borra**.

### Centro de salud

`GET /system/health` (ADMIN/COORDINATOR) frente a `/health`, que sigue siendo
la sonda pública y mínima. Cuatro estados —desactivado, configurado, saludable,
con error— porque «rojo o verde» dejaría en rojo permanente lo que nadie quiso
activar. Las comprobaciones remotas van en paralelo y con tiempo de espera
corto: encadenadas, el panel tardaría más cuanto peor estuviera el sistema.

Las tareas se leen de `ejecuciones_tareas` (`shared/job-run.ts`), no de una
variable del proceso: con dos instancias, la que atiende la consulta no tiene
por qué ser la que ejecutó la tarea.

### Telemetría de clientes

Un documento **por firma**, no por ocurrencia. La firma la calcula el servidor;
si la calculara el cliente, dos versiones agruparían distinto el mismo defecto.
El usuario sale de la sesión, nunca del cuerpo. Los dos clientes deduplican
antes de enviar y **un fallo al reportar no se reporta**: reintentar convierte
un error en un bucle.

### Historial del estudiante

`GET /students/:id/historial` une seis colecciones **en el backend**. El cliente
no cruza nada: si lo hiciera, escritorio y móvil contarían dos historias
distintas del mismo estudiante. Distingue el hecho académico del evento técnico
—la auditoría vive en su panel— y el orden desempata por `id` para que la
paginación sea estable.

### Modelo de datos
`Estudiante` existe globalmente por cédula. `Matrícula` lo vincula a un grupo de una materia en un semestre (`2026-1`/`2026-2`). Nota atómica por (estudiante, materia, corte, componente). Asistencia registra minutos reales por clase.

### Motor de calificaciones (canónico, en `domains/grading`)
- Corte = Trabajos 30% + Parciales 60% + Autoevaluación 10%.
- Final = C1×0.33 + C2×0.33 + C3×0.34; aprobado ≥ 3.0 (escala 0–5).
- Asistencia ponderada por minutos: `minutos presentes ÷ minutos totales`.
- El dashboard y el riesgo usan `calcularPromedioParcial()` (solo cortes calificados, pesos renormalizados) para evitar falsos positivos a mitad de semestre.

### Sincronización en tiempo real
El backend emite un evento único `sync:update` con payload `{entity, action, id}` — no una familia de eventos por entidad. El escritorio v2 mapea cada `entity` a las claves de caché de TanStack Query que invalida (`desktop/src/core/realtime/socket.ts`) y el móvil a sus providers de Riverpod (`flutter_app/lib/app.dart`). Al añadir una entidad o mutación nueva, emitir `sync:update` y registrar el mapeo de invalidación **en los dos clientes**.

Hay un segundo evento, `notification:new`, con el documento de la notificación. Va aparte a propósito: `sync:update` dice «esta caché caducó» y este dice «avísale». Mezclarlos obligaría a cada oyente a distinguirlos, y el que solo quiere invalidar acabaría mostrando avisos.

Los eventos salen por `emitToUser` (sala `user:<id>` + ADMIN/COORDINATOR), no por el broadcast global.

### Agenda académica
`GET /agenda` expande el horario semanal (`ScheduleModel`) a ocurrencias con fecha y las une con `EventoCalendario` y `Actividad`. **Ningún cliente calcula a qué hora es una clase**: si PC y Android lo hicieran por su cuenta, un equipo con la zona horaria mal puesta mostraría otra hora y el docente no sabría cuál de los dos miente.

`"10:00"` en un horario es una hora de pared del campus, no del reloj del servidor. El desfase entra por `CAMPUS_UTC_OFFSET_MIN` (Colombia: `-300`, sin DST) y todo lo que sale son instantes UTC absolutos más `campusOffsetMinutes` para que el cliente formatee. El motor puro está en `domains/agenda/`.

Las clases **no se copiaron** a una colección nueva: `horarios` sigue siendo la única fuente y `/schedules` el único sitio donde se escribe una franja. `eventos_calendario` guarda solo lo que no se repite cada semana (parciales, entregas, tutorías, recordatorios).

`id` de una ocurrencia = `class:<horarioId>:<AAAA-MM-DD>`. Es estable, y es lo que permite deduplicar recordatorios y que una notificación abra exactamente esa clase.

### Notificaciones
`shared/notify.ts` → `crearNotificacion()` es el **punto único**: comprueba preferencias, deduplica por `dedupeKey` (índice único parcial sobre `(userId, dedupeKey)`), guarda, emite por socket y solo entonces empuja al teléfono. No crear notificaciones con `NotificationModel.create()` directamente: se salta las tres cosas.

La clave de dedupe identifica el **hecho**, no el documento (`class:<horario>:<fecha>:<antelación>`). Sin ella, el escáner crea un aviso idéntico en cada pasada, que es la forma más rápida de enseñar a ignorar la campana.

Reparto de responsabilidades entre los dos mecanismos de aviso en Android:
- **Recordatorios de clase → alarmas locales** (`flutter_local_notifications`). Se conocen con días de antelación, funcionan con la app cerrada y sin red — que es la situación de un salón con el wifi caído.
- **Alertas de riesgo y cambios → push del servidor** (FCM HTTP v1, `shared/push.ts`, sin dependencias nuevas). El teléfono no puede saberlas por adelantado.

El dispositivo se registra con `localClassReminders: true` y el servidor deja de mandarle push de tipo `CLASS`: sin eso el docente recibe el mismo aviso dos veces.

Detalle completo en `docs/AGENDA_Y_NOTIFICACIONES.md`.

### Sincronización — entidades de la v3

Además de las anteriores, el backend emite `period`, `attendanceCase` y
`clientError`, y `activity` ahora invalida también su propia pantalla (antes
solo la agenda, así que crear una entrega desde el escritorio no la hacía
aparecer en el listado del teléfono).

`period` es la que más arrastra: cerrar un semestre bloquea notas, asistencia y
matrículas, así que tira esas tres cachés. Un formulario abierto que no se
entere manda el cambio y recibe un 409 que no espera.

Las actividades salen por `emitToUser`, no por difusión: llevan el título de
una evaluación y la fecha de un parcial, y emitirlas a `role:PROFESSOR` las
mandaría a todos los docentes de la institución.

`desktop/tests/unit/sync-map.test.ts` fija que ninguna entidad emitida se quede
sin entrada en el mapa: ese fallo no rompe nada visiblemente —el evento llega,
no encuentra la entidad y sale por `if (!keys) return`— y ya pasó tres veces en
este proyecto.

### Navegación del móvil — cinco destinos

La barra inferior tiene **Inicio · Materias · Agenda · Asistente · Más**, y las
cuatro primeras son **las cuatro primeras ramas** de `rutasDeRama`, en ese
orden. No es casualidad: el botón «Más» ocupa la posición
`primaryDestinations.length`, así que si los principales no fueran las primeras
ramas ese cálculo señalaría a una pantalla real y tocar «Más» abriría cualquier
cosa. `test/router_test.dart` lo fija.

La agenda subió a la barra porque es la respuesta a «¿qué tengo ahora?» y se
abre a diario; la asistencia bajó a «Más» porque se entra a ella desde la clase
concreta. «Más» es una cuadrícula de tres columnas, no una columna de
`ListTile`: diez entradas en columna son unos 560 dp y no caben en ningún
teléfono, y un menú que hay que desplazar deja de ser un menú.

Los destinos secundarios declaran `roles`, así que el menú no ofrece entradas
que el backend va a rechazar con un 403.

### Componentes compactos del móvil

`core/widgets/compact.dart` es el kit denso: `CompactHeader` (56 dp frente a
los 88 del `AppBar` con subtítulo), `AcademicRow` (56 frente a ~92),
`CompactStat`, `FilterBar`, `FilterChipCompact`, `CollapsibleSection`,
`showCompactSheet`, `StickySummaryBar`, `SkeletonRows`, `CompactEmpty`,
`CompactSectionHeader` e `InitialsAvatar`.

Existe porque convivían tres formas de pintar «un estudiante con su nota y su
estado» —notas, asistencia y riesgo— con tres altos y tres criterios distintos
sobre qué es un metadato. Ninguna era peor; el problema era que fueran tres.

`ui_kit.dart` sigue vivo para lo que no es lista: `AppCard`, `StatusPill`,
`RiskBadge`, `AppToast`, `StateView`, `SkeletonBox`.

**La densidad no se gana encogiendo lo que se toca**: 48 dp de objetivo táctil,
44 de mínimo absoluto. Detalle en DESIGN.md §7.2.

### Escritorio v2 — capas
`domain/` (esquemas Zod + puertos, sin React) → `infrastructure/` (adaptadores HTTP de los puertos) → `features/` (una pantalla por capacidad) → `shared/` (design system según `DESIGN.md`). Estado de servidor con TanStack Query, estado de cliente con Zustand. Tokens en `keyring` (Rust) vía `src-tauri/src/commands/`. `desktop_python/` (PySide6) está **muerto**: su lanzador se eliminó y no recibe cambios. No añadir nada ahí ni tomarlo como referencia.

### Servicio ML
Sustituye los umbrales fijos de `domains/risk` por un modelo entrenado con explicación SHAP obligatoria. Arranca con modelo bootstrap derivado de las reglas; un candidato reentrenado solo se promueve **si gana en recall** (AUC desempata), salvo que sea el primer modelo con datos reales. Si el servicio cae, el backend usa el motor de reglas y lo declara en el campo `source` (`model` | `rules`). Config en `backend/.env`: `ML_BASE_URL=http://127.0.0.1:8100`, `ML_ENABLED=1`.

**El servicio se autentica con un secreto compartido** (`ML_SHARED_SECRET`, cabecera `X-ML-Secret`). No lo tenía: nueve endpoints abiertos, entre ellos `POST /train`, que reentrena y **promueve** el modelo —es decir, decide qué estudiantes salen marcados en rojo en las tres aplicaciones— y los cuatro `/vision/*`, que reciben archivos. Lo único que lo acotaba era que `uvicorn` sin `--host` escucha en `127.0.0.1`: una convención, no un cierre, y un `--host 0.0.0.0` en un `docker run` lo abría entero sin que nada lo advirtiera.

Ahora: sin secreto no exige nada mientras escuche solo en la loopback —para que un `git clone` arranque sin configurar— y **se niega a arrancar** si `ML_HOST` sale de ahí y no hay secreto. `/health` queda fuera: es la sonda con la que el backend decide si el servicio está vivo, y tiene que poder responder antes de compartir nada.

Del lado del backend, las nueve llamadas pasan por `shared/ml-client.ts` (`mlFetch`). Están repartidas en seis módulos, y añadir la cabecera en cada uno garantiza que la que se añada mañana se olvide — y una llamada sin cabecera no falla de forma visible: funciona en local, funciona en las pruebas, y solo se cae el día del despliegue.

## Rendimiento de los clientes

Tres reglas que son fáciles de deshacer sin querer y caras de diagnosticar después, porque ninguna la detecta `flutter analyze` ni el `tsc`.

**`MediaQuery.sizeOf` / `viewInsetsOf`, nunca `MediaQuery.of`.** `of` suscribe al `MediaQueryData` entero, y el teclado anima `viewInsets` **fotograma a fotograma**: un `MediaQuery.of` para leer un ancho reconstruye ese widget sesenta veces por segundo mientras el teclado sube. Estaba en `app_scaffold.dart` —que envuelve todas las pantallas— y dentro de cada burbuja del chat, que es la pantalla donde el teclado más se abre.

**Cambiar de pestaña no debe rehacer la pestaña.** El móvil usa `StatefulShellRoute.indexedStack` (`app.dart`), con una rama por destino. `rutasDeRama` en `app_scaffold.dart` es el contrato: **la rama N atiende a `rutasDeRama[N]`**, y `test/router_test.dart` lo fija porque descuadrar el orden compila igual y manda cada pestaña a la pantalla equivocada. Para navegar entre pestañas se usa `goBranch`, no `context.go`: `go` reinicia la rama y `goBranch` vuelve donde se dejó.

**Un `setState` de página por pulsación de tecla es un error, no un detalle.** Reconstruye cabecera, filtros y lista, y además refiltra la lista completa: escribir nueve letras son nueve pasadas sobre mil registros, ocho de las cuales nadie ve. Los buscadores usan `DebouncedSearchField` (`core/widgets/`); lo que solo habilita un botón o pinta unas iniciales usa `ValueListenableBuilder` sobre el controlador. Y las listas largas van con `ListView.builder` o `SliverList.builder`: `ListView(children: [...])` construye **todos** sus hijos aunque se vean ocho.

En el escritorio esto no aparece porque TanStack Query ya guarda el estado de servidor (`staleTime` 30 s, `gcTime` 5 min, `refetchOnWindowFocus: false` en `app/providers.tsx`), así que cambiar de pantalla no vuelve a consultar. En el móvil el equivalente es que **ningún provider de Riverpod es `autoDispose`**: los datos sobreviven al cambio de pestaña a propósito.

## Organización de los clientes

**Móvil.** `core/` tiene una casa por tema (`network`, `auth`, `notifications`, `storage`, `theme`, `widgets`, `data`) y **cada capacidad guarda lo suyo en `features/<X>/`**: su pantalla, sus `<X>_providers.dart` y su `data/` con el repositorio. Antes había tres sitios donde podía ir un modelo y dos donde podía ir un repositorio, así que no había forma de saber dónde poner nada nuevo.

**Escritorio.** `domain/schemas/` y `infrastructure/repositories/` tienen un archivo por capacidad. `academic.ts` y `academic.repository.ts` son solo índices de reexportación.

En los dos casos el índice existe para no romper los sitios que ya importaban de ahí. **Un índice de `export` no es un archivo central**: el problema nunca fue el import compartido, era que el código viviera todo junto y cualquier cambio de cualquier pantalla chocara en el mismo sitio.

## Idioma y tema

**La aplicación es solo en español.** No hay internacionalización: ni paquete, ni catálogo de cadenas, ni selector de idioma. Los textos están escritos en el código. Si algún día hace falta inglés, es un proyecto propio (extraer varios miles de cadenas de las tres aplicaciones), no un ajuste.

**El tema tiene tres modos en los dos clientes**: claro, oscuro y seguir al sistema. Dos detalles que no son opcionales:
- **El tercer modo tiene que ser alcanzable.** Un interruptor de dos posiciones deja la app clavada en cuanto se toca una vez, y el teléfono que cambia solo al anochecer deja de hacerlo sin explicación.
- **La preferencia se lee antes de dibujar** (`ThemeModeController.cargarInicial()` en `main()`, `initTheme()` antes de montar React). Leerla después deja el primer fotograma con el tema del sistema y lo cambia a continuación: quien eligió claro con el teléfono en oscuro ve un fogonazo.

## Sistema de diseño

`DESIGN.md` es la fuente de verdad y los tres clientes la implementan con la misma estructura: un archivo de tokens y cero colores o tamaños en crudo en las pantallas. Antes de escribir un color o un `fontSize` literal, comprueba que no exista ya el token.

| Concepto | Escritorio v2 | Móvil | |
|----------|---------------|-------|---|
| Tokens | `desktop/src/styles/tokens.css` | `AppColors` en `lib/core/theme/app_theme.dart` | — |
| Tipografía | utilidades `text-h1 … text-caption` | `AppType` | |
| Estado semántico | `--success`/`--success-soft`… | `SemanticKind` + `SemanticTone` | |

- **Declara el significado, no el color.** `StatusPill`, `StatTile` y `RiskBadge` (móvil) reciben un `SemanticKind` y resuelven el par (texto, fondo) contra el tema activo. Pasarles colores sueltos rompe el modo oscuro.
- **La escala tipográfica tiene cinco pasos** (36/30/24/16/13). Un tamaño fuera de ese ramp es un error, no una variante.
- **En modo oscuro los semánticos van aclarados** (`#4ADE80`, `#FBBF24`, `#F87171`, `#38BDF8`), no con los hex canónicos de §4: esos están calibrados para texto sobre blanco y sobre `#33332A` caen a 2.4–4.0:1, por debajo del AA que exigen §4 regla 5 y §15.
- **El lima `#CAD225` es el acento en los dos modos** y nunca es color de texto ni fondo de superficie grande — solo botones, badges, selección y foco (§4 reglas 2 y 4). En claro, cuando el acento tiene que *ser* texto se usa `--accent-strong` / `AppColors.accentStrong` (`#626D0F`), que es la misma rampa bajada hasta AA.
- **En el móvil, los colores del tema se leen con `context.palette`** (`AppPalette` en `app_theme.dart`), no con `isDark ? XDark : X` repetido en cada pantalla: cada copia de ese ternario es un sitio donde se puede olvidar el caso oscuro, y olvidarlo no da error, da texto gris sobre fondo oliva.
- **La superficie de marca (`surface-brand` / `BrandSurface`) es solo para lo que representa a la aplicación** — cabecera del panel, clase en curso, acceso. Nunca detrás de una tabla o una lista: el degradado cambia de tono a lo largo del bloque y cada fila acabaría sobre un fondo distinto.
- Inter va empaquetada en los dos clientes (`@fontsource/inter` en escritorio, `.ttf` en `flutter_app/assets/fonts/`). No la sustituyas por una carga remota: el CSP de Tauri no tiene `font-src` y la app móvil se usa sin red fiable.
- Los gráficos de escritorio leen los tokens en vivo y se repintan al cambiar de tema; no les pases colores fijos.

## Variables de entorno — trampas conocidas

Leídas por `backend/src/shared/env.ts`. **Un nombre mal escrito no da error: cae en silencio al valor por defecto.** Verificar con `npm run check:env`.

- La variable es `JWT_ACCESS_SECRET`, **no** `JWT_SECRET`.
- `MONGODB_URI` es obligatoria; sin ella el backend arranca pero no conecta a la base.
- **`NODE_ENV` ya no es el interruptor de la seguridad.** Lo fue, y era un error de diseño: `validarProduccion()` empezaba con `if (!esProduccion) return`, o sea que el guardián que impide desplegar con los secretos de juguete **solo se activaba si ya estaba puesta la variable que él mismo tendría que verificar**. Un `pm2 start` sin `NODE_ENV` arrancaba sin un aviso con `JWT_ACCESS_SECRET='dev-access'`, que está escrito en este repositorio. Ahora los secretos de firma se validan **siempre que haya `MONGODB_URI` configurada** —la señal de que esto no es un clon recién hecho— y `NODE_ENV` solo decide lo que sí molestaría en local: CORS acotado y servidor de correo.
- **`TRUST_PROXY`** activa `trust proxy`, que es lo que hace que el límite de intentos de login vea la IP real y no la del proxy. Sin declarar sigue a `NODE_ENV`, que es lo que hacía antes. No la actives sin un proxy delante: cualquiera podría inventarse su `X-Forwarded-For` y estrenar cupo en cada petición.
- **El límite de intentos de login va siempre**, no solo en producción. Estaba dentro de un `if (esProduccion)` y esa es justo la condición que falta cuando alguien despliega sin declararla. Diez intentos cada quince minutos no estorban a nadie desarrollando.
- **`ALLOW_DEV_RECOVERY_CODE`** devuelve el código de recuperación en la respuesta de `/auth/recovery/request`. Apagada por defecto y con dos condiciones más encima (fuera de producción, sin SMTP). Nunca en un servidor al que llegue nadie más.
- **`ML_SHARED_SECRET`** tiene que valer lo mismo aquí y en el entorno del servicio de Python. Vacío solo mientras el servicio escuche en `127.0.0.1`.
- `CLIENT_ORIGIN=*` para uso local: la app empaquetada de escritorio se sirve desde `http://tauri.localhost` (dev: `http://localhost:5183`). Si `CLIENT_ORIGIN` apunta a otro puerto, el login desde escritorio falla con un error de red que **no** menciona CORS.
- El backend escucha en todas las interfaces (`0.0.0.0`) — necesario para que el móvil se conecte desde el teléfono.
- `CAMPUS_UTC_OFFSET_MIN` (por defecto `-300`) es la zona del campus. Si el servidor corre en UTC y esto no se declara bien, **todas las clases y todos los recordatorios se desplazan varias horas sin ningún error visible**.
- `CLASS_REMINDER_INTERVAL_MIN` va a `1` por defecto: un aviso de «empieza en 15 minutos» comprobado cada cuarto de hora no es un aviso. Con varias instancias, activarlo en una sola.
- **El push a Android está apagado por defecto.** Sin `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL` y `FCM_PRIVATE_KEY` no se envía nada con la app cerrada y queda anotado en el log. Los recordatorios de clase siguen llegando: los programa el teléfono como alarmas locales.
- **Correo saliente y aviso de versiones están apagados por defecto.** Sin `SMTP_HOST` no se envía nada y queda anotado en el log; con `RELEASE_CHECK_INTERVAL_H=0` no se consulta GitHub. Las dos degradan en silencio a propósito: una instalación local no debería necesitar servidor de correo para arrancar. Para activarlos: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE` y `RELEASE_CHECK_INTERVAL_H` (horas), `RELEASES_REPO`.

## Actualizaciones automáticas

Los dos clientes se actualizan desde **GitHub Releases**; el proceso completo está en `docs/PUBLICAR_VERSION.md`.

- Escritorio: `tauri-plugin-updater` verifica la firma minisign contra `plugins.updater.pubkey` antes de instalar. La lógica vive en `desktop/src/core/platform/updater.ts` — como el resto de `core/platform`, es el único módulo que toca el plugin y degrada a "no hay nada" en el navegador.
- Móvil: `flutter_app/lib/core/services/update_service.dart` consulta la API de Releases, descarga el APK y se lo pasa al instalador de Android. Solo Android; en otras plataformas responde que no hay actualizaciones.
- **Publicar exige subir la versión en los cuatro archivos** (`desktop/package.json`, `tauri.conf.json`, `Cargo.toml` y `pubspec.yaml` con su `+versionCode`) y empujar una etiqueta `v*`. Sin subir la versión el updater no ofrece nada. **No los edites a mano**: `node .github/scripts/subir-version.mjs patch|minor|major|X.Y.Z` los actualiza todos, sube el `versionCode` y regenera los ficheros de bloqueo; `comprobar-version.mjs` lo verifica después y en CI. Ver la «Regla de subida de versión» más abajo.
- La clave privada de firma **no está en el repositorio** y no debe estarlo: quien la tenga puede publicar actualizaciones falsas que las apps instaladas aceptarían como oficiales.

**iOS no existe y no se puede compilar desde Windows** (hace falta macOS con Xcode, y el Apple Developer Program para distribuir). No empieces a añadir una carpeta `ios/`: el bloqueo es de herramientas, no de código.

## Documentación de referencia

- `docs/AGENDA_Y_NOTIFICACIONES.md` — agenda, recordatorios, push de Android, sincronización y qué hay que configurar.
- `docs/CIERRE_Y_ADMINISTRACION.md` — cierre de periodos, auditoría, centro de salud, patrones de inasistencia, telemetría, historial, migración v3 y suite E2E.
- `docs/PUBLICAR_VERSION.md` — publicar una versión, secretos de CI y manejo de las claves de firma.
- `docs/AUDITORIA_SEGURIDAD.md` — auditoría de entradas, formularios, subidas y sesión: qué falló, cómo se corrigió y **por qué existe cada defensa**. Léelo antes de quitar una comprobación que parezca redundante.
- `desktop/README.md` — guía completa del cliente de escritorio v2.
- `ml_service/README.md` — ciclo de entrenamiento, endpoints y variables del modelo.
- `docs/ARQUITECTURA_V2.md` — auditoría de la v1 y arquitectura de la v2.
- `DESIGN.md` — tokens de diseño, paleta, accesibilidad (fuente de los estilos del escritorio).
- Swagger interactivo en `http://localhost:4000/docs` con el servidor arriba.
---

# Reglas de trabajo

Las secciones anteriores describen **cómo está hecho** el sistema. Estas
describen **cómo se trabaja sobre él**: qué hay que ejecutar antes de dar algo
por terminado, dónde va una prueba nueva, y qué se rompe siempre que nadie
mira. Están adaptadas de las de UniPlanner, que es el otro proyecto de esta
misma persona; lo que allí eran reglas de Firestore y Flutter, aquí son de
MongoDB y de tres clientes.

## Estilo de respuesta — nivel «lite»

- Sin muletillas, sin rodeos, sin relleno conversacional.
- Se mantienen los artículos y las frases completas: no es telegrama.
- Explicaciones y código directos, profesionales y **técnicamente exactos al
  100 %**.

```
Normal: "Deberías envolver el objeto en useMemo, ya que se crea una referencia
         nueva en cada render."
Lite:   "Envuelve el objeto en useMemo. Se crea una referencia nueva en cada
         render."
```

## Regla de verificación

**Nada se da por terminado sin ejecutar lo que corresponda al código tocado.**
No es ceremonia: los tres clientes y el backend fallan de maneras que no se ven
leyendo el diff.

| Tocaste | Ejecuta, en este orden |
|---|---|
| `backend/` | `npm run lint` · `npx tsc -p tsconfig.json --noEmit` · `npm test` |
| `desktop/` | `npm run lint` · `npm run typecheck` · `npm test` |
| `flutter_app/` | `flutter analyze` · `flutter test` |
| `ml_service/` | `.venv/bin/python -m pytest tests/` |
| `backend/.env` o variables nuevas | `npm run check:env` |

El objetivo es **0 errores**. Los avisos preexistentes (`no-console`,
`no-explicit-any`) no se arreglan de paso; los nuevos, sí.

`npm test` en el backend cubre `src/domains/`: funciones puras, sin base ni
servidor. `npm run smoke` sigue siendo la verificación de extremo a extremo y
necesita el servidor arriba y sembrado.

**Si cambias una variable de entorno**, actualiza en el mismo commit
`backend/.env.example`, la lista `KNOWN` de `check-env.mjs` y la tabla de
CLAUDE.md. Una clave que no esté en `KNOWN` salta como si fuera una errata, y un
aviso que siempre aparece deja de leerse.

## Regla de ubicación de las pruebas

Cada cliente tiene su carpeta y **una prueba va donde vive el código que
cubre**:

| Carpeta | Cubre |
|---|---|
| `backend/tests/` | `backend/src/domains/` y los módulos puros de `shared/` |
| `desktop/tests/unit/` | `desktop/src/domain/` y utilidades de `core/` |
| `flutter_app/test/` | `flutter_app/lib/` |

Las tres son planas a propósito: son de 15 a 30 archivos por cliente, y una
jerarquía sobre eso añade navegación sin añadir información. **El nombre es la
ubicación**: `professor-scope.test.ts` prueba `domains/scope/professor-scope.ts`,
`router_test.dart` prueba el enrutador. Una prueba cuyo nombre no diga qué cubre
está mal nombrada, no mal ubicada.

Una prueba que cruza dos módulos va con el que **posee el comportamiento que se
afirma**, no con el que solo lee. `student-follow-up-scope.test.ts` importa
cosas de seguimiento y afirma sobre el alcance, así que es del alcance.

**Antes de crear un archivo, mira si extender uno existente con un `describe`
nuevo.** Varios archivos pequeños afirmando lo mismo son más difíciles de
mantener que uno agrupado.

**Qué merece una prueba.** La lógica de dominio; lo que puede corromper o
perder datos (migraciones, escrituras masivas); los fallos que de verdad
ocurrieron; y las garantías que se rompen en silencio — el alcance de un
docente, el mapa de invalidación de `sync:update`, el orden de las ramas del
enrutador móvil, el escape de fórmulas de los exportables. Ninguna de esas
lanza una excepción al romperse: devuelven un 200 con los datos de otro, o una
pantalla en blanco.

**Qué no.** Pruebas que solo repiten una constante. Afirmar que una lista tiene
exactamente tres entradas falla en cada ajuste de diseño sin que nada esté roto.

## Regla de las hojas modales (móvil)

Tres defectos aparecen en toda hoja inferior que nadie vigila. `showCompactSheet`
(`core/widgets/compact.dart`) los tiene resueltos: **una hoja nueva pasa por
ahí**, y si de verdad necesita `showModalBottomSheet` a pelo, revisa los tres.

**1. `useSafeArea: true` va en la ruta.** Sin la bandera,
`showModalBottomSheet` envuelve la hoja en `MediaQuery.removePadding`, que
depende del `MediaQueryData` **entero**. El teclado anima `viewInsets` fotograma
a fotograma, así que cada uno de esos fotogramas invalida la construcción y
rehace el subárbol completo de la hoja. Y sin ella la hoja tampoco pinta bajo la
barra de estado.

**2. Nunca leas `MediaQuery.viewInsetsOf` en el `build` de un formulario.** Usa
`KeyboardInset` (`core/widgets/keyboard_inset.dart`), que lee el inset en su
propio `build` diminuto y recibe el contenido **ya construido**, de modo que el
framework se salta ese subárbol en vez de rehacerlo.

```dart
// Mal: apunta la dependencia al formulario entero.
Padding(
  padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
  child: /* el formulario */,
)

// Bien.
KeyboardInset(child: /* el formulario */)
KeyboardInset(extra: 16, child: /* una barra de acciones fija abajo */)
```

Vale igual para un pie fijo dentro de una pantalla más alta: se envuelve **el
pie**, no la pantalla.

**3. Una hoja alta tiene que poder encoger.** `useSafeArea` le cuesta a la hoja
el alto de la barra de estado, así que una `Column` cuyos hijos exijan un alto
fijo se desborda en una pantalla corta. La parte que crece va en `Flexible`, no
solo con un `maxHeight`.

`test/keyboard_inset_test.dart` fija el punto 2 contando reconstrucciones, no
píxeles: quitar `KeyboardInset` se ve idéntico en una captura y multiplica por
sesenta el trabajo por segundo.

## Regla de carga de la base de datos

MongoDB Atlas cobra por operación y por transferencia, y las dos se multiplican
por accidente. Aquí no aplica lo de `autoDispose` de UniPlanner — es al revés,
**ningún provider de Riverpod es `autoDispose` a propósito**, para que cambiar
de pestaña no vuelva a consultar. Lo que sí aplica es esto:

**1. Una escritura por lote, no un viaje por fila.** `/grades/bulk`,
`/attendance/scan/confirm`, `/students/bulk` y `/enrollments/bulk` usan
`bulkWrite()` y `auditBatch()`. Volver al bucle de `findOneAndUpdate` convierte
una planilla de 500 × 10 en quince mil idas y vueltas encadenadas a Atlas sobre
una ventana que el docente ya cerró. **La auditoría también es una escritura por
registro**: agrupar solo el upsert deja el bucle donde estaba.

**2. `bulkWrite` no castea los ids.** `find()` los convierte a partir del
esquema; la agregación y `bulkWrite`, no. Un `studentId` en texto no casa con el
ObjectId guardado, así que el filtro no encuentra nada y el upsert **crea un
duplicado** en vez de actualizar.

**3. Un filtro de lote se resuelve en una consulta, no en una por fila.**
`estudiantesPorCodigo()` existe por eso: comprobar el alcance fila a fila
habría devuelto la escritura masiva al bucle que `bulkWrite` vino a quitar.

**4. Todo listado se pagina.** `paginacionCon(porDefecto)` en
`shared/validation.ts`. El valor por defecto de un endpoint es **el tope que ya
devolvía**: bajarlo deja a los móviles ya instalados pidiendo la lista de
siempre y recibiendo la décima parte, sin ningún error.

**5. El conteo va en paralelo con la página**, no encadenado: son dos consultas
independientes y encadenarlas duplica la espera sin ninguna razón.

En los clientes el equivalente es que el estado de servidor ya está cacheado
—TanStack Query con `staleTime` 30 s en escritorio, providers no `autoDispose`
en móvil— así que **cambiar de pantalla no debe volver a consultar**. Si una
pantalla nueva consulta al montarse cada vez, está saltándose la caché.

## Regla de subida de versión

**Nunca edites la versión a mano. Ejecuta el script:**

```bash
node .github/scripts/subir-version.mjs patch      # o: minor | major | 1.4.2
node .github/scripts/subir-version.mjs --check    # ¿está todo alineado?
```

Actualiza los cuatro archivos que declaran la versión, sube el `versionCode` de
Android y regenera los dos ficheros de bloqueo. Después,
`comprobar-version.mjs` (que ya corría en CI) verifica que nada se quedó atrás.

**Los cuatro archivos:**

| Archivo | Qué declara |
|---|---|
| `desktop/package.json` | versión del paquete de escritorio |
| `desktop/src-tauri/tauri.conf.json` | la que ve el updater de Tauri |
| `desktop/src-tauri/Cargo.toml` | la que declara el ejecutable |
| `flutter_app/pubspec.yaml` | versión visible **y** `+versionCode` |

**El `versionCode` de Android siempre sube, aunque el número visible baje.** Es
lo que compara el sistema para dejar instalar el APK encima del anterior;
bajarlo deja a los teléfonos ya instalados sin poder actualizar y sin ningún
error que lo explique.

Existía solo el verificador y no el que sube, y el historial dice cómo acaba
eso: `Cargo.toml` se quedó en 2.3.5 mientras el resto iba por 2.5.0 durante dos
publicaciones, y hay un commit entero dedicado a sincronizar los ficheros de
bloqueo a posteriori. Una release mal numerada no se corrige: se reemplaza.

**¿Añades un archivo que nombre la versión?** Añádelo a `ARCHIVOS` en
`subir-version.mjs` **y** a `fuentes` en `comprobar-version.mjs`. En una sola de
las dos, o queda sin verificar o hace fallar la publicación después de que
alguien ya subió la etiqueta.

La **etapa** (`alfa`/`beta`/`estable`) vive aparte, en `desktop/src/core/version.ts`
y `flutter_app/lib/core/version.dart`, y las dos tienen que coincidir: el
workflow deriva de ahí el nombre de la release. Detalle en
`docs/PUBLICAR_VERSION.md`.

## Regla de integridad de la documentación

**La documentación se mantiene al día con la realidad, en el mismo commit.**

Cuando cambies lógica relevante, reorganices una pantalla, toques el modelo de
datos, la paginación o el comportamiento de una plataforma:

1. **Actualiza lo afectado en el momento**: `CLAUDE.md` y `AGENTS.md` (que son
   el mismo documento para dos herramientas y no pueden divergir), `README.md`,
   `DESIGN.md` y lo que corresponda de `docs/`.
2. **No dejes una descripción obsoleta como si fuera verdad.** Una afirmación
   sobre un archivo borrado, una arquitectura sustituida o un flujo que ya no
   existe es peor que no tener documentación: se lee con la misma confianza y
   manda al lector a un sitio que no está.
3. **Mantén los conteos.** Si el número de pruebas cambia de forma apreciable,
   actualiza la cifra donde esté escrita en vez de dejar una que ya no cuadra.

`AGENTS.md` y `CLAUDE.md` solo se diferencian en la primera línea y en el nombre
de la herramienta. Editar uno y no el otro es la forma más fácil de que las dos
herramientas trabajen con reglas distintas sobre el mismo repositorio.
