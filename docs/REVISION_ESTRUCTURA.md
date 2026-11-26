# Revisión de estructura: contingencia, errores futuros y actualizaciones

Fecha: 25-11-2026. Rama `judagova`, commit `7ceb0d4`. Es una revisión, no un
cambio: no se tocó código. Cada hallazgo lleva `archivo:línea` del estado
revisado; las líneas pueden moverse con los cambios que estén entrando en
paralelo. Lo que no se pudo verificar se dice en su sitio.

## Resumen ejecutivo

- **Las tareas periódicas no tienen candado.** Cada proceso que arranca
  `server.ts` lanza las nueve tareas (`server.ts:82-90`) con `setInterval`, y
  `job-run.ts` solo anota quién corrió de último (`job-run.ts:66-73`). Eso
  explica lo visto el 13-11-2026 (`server1`, `servidor2` y un contenedor docker
  ejecutando `class-reminders`, `uniplanner-verificacion` y
  `announcement-publish`). Hay reclamos atómicos por elemento en algunos sitios,
  así que hoy el daño es sobre todo trabajo repetido y lecturas de Firestore
  multiplicadas. Pero una instancia con código viejo o con otra configuración
  puede llevarse el trabajo y hacerlo mal.
- **Si Atlas no responde al arrancar, el backend no vuelve a intentarlo.**
  `connectDb()` registra el error y no relanza (`db.ts:138-143`). El proceso
  sigue vivo, así que systemd no lo reinicia, y `/health` contesta 200
  `ok: true` (`app.ts:87-90`). El script de despliegue solo mira el código HTTP
  (`deploy/actualizar.sh:47`) y da el despliegue por bueno.
- **No hay apagado ordenado.** No se maneja `SIGTERM`/`SIGINT` en ningún sitio
  (grep sin resultados en `backend/src`). Hay funciones `stop*` en
  `scheduler.ts` que nadie llama. Socket.io, Mongoose y las tareas en curso se
  cortan en seco en cada despliegue.
- **Una base caída se ve como un 500 genérico.** Ningún error de conexión de
  Mongo se traduce a 503 (`error.ts:73`). El escritorio cuenta un 500 como
  «servidor presente» y marca una nota en cola como `fallida` tras 8 intentos,
  unos 8,5 minutos (`desktop/src/domain/offline/clasificacion.ts:51,78`). Una
  caída de Atlas de 10 minutos llena de errores rojos las bandejas de los
  docentes.
- **Ya hay herramientas para la deriva de índices, pero nada vigila.**
  `shared/reparar-indices.ts` es puro y tiene pruebas, pero solo lo usa un
  script manual. El arranque no compara índices y el centro de salud tampoco.
- **No hay procedimiento documentado de copia de seguridad ni de rollback.**
  `docs/DESPLIEGUE_PRODUCCION.md` no menciona respaldo. El despliegue es un
  `rsync --delete` de la copia de trabajo del desarrollador sobre el directorio
  vivo (`deploy/actualizar.sh:26-35`), sin etiqueta, sin build previo y sin
  forma de volver atrás. La versión del backend está clavada en `0.1.0`
  (`backend/package.json:3`), así que `/system/health` no dice qué está
  desplegado.
- **CI deja fuera piezas que la regla de verificación exige.** `verificar.yml`
  corre tipos y pruebas de backend y escritorio y analyze/test de Flutter. No
  corre `npm run lint` (ni backend ni escritorio), ni `pytest` del servicio ML,
  ni `cargo` en ningún workflow (grep de `lint|pytest|cargo` en
  `.github/workflows/` sin resultados).
- **El proceso de versión de los clientes está bien resuelto**
  (`plataformas.mjs`, `subir-version.mjs`, `comprobar-version.mjs` en CI, pin
  de Flutter). Lo que falta es lo de alrededor: que el servidor pueda exigir una
  versión mínima de cliente (no hay ningún mecanismo) y una política para las
  dependencias, que van varias majors por detrás sin Dependabot ni Renovate.

---

## 1. Contingencia del backend

### 1.1 Tareas periódicas en varias instancias sin candado. Severidad: **Alta**

**Evidencia**
- `backend/src/server.ts:79-91`: todo proceso que escucha arranca las nueve
  tareas. No hay ninguna variable que diga «esta instancia no ejecuta tareas».
- `backend/src/shared/job-run.ts:35-61`: `ejecutarTarea` ejecuta y anota. No
  pide permiso antes de ejecutar. `anotar` hace upsert de `lastHost`
  (`job-run.ts:69`), así que el centro de salud enseña solo el último host
  (`modules/health/health.service.ts:235`) y oculta que hay tres.
- `scheduler.ts:319-336` (`uniplanner-verificacion`) y `scheduler.ts:293-306`
  (`uniplanner-solicitudes`) no tienen variable de intervalo. La única forma de
  apagarlas en una instancia es quitarle las credenciales de UniPlanner.
- `scheduler.ts:260-283` (lector QR, cada 3 s): su `enCurso` solo protege
  dentro de un proceso. Con tres procesos hay tres lecturas de Firestore cada
  3 s por sesión abierta.
- `docker-compose.yml:9-11,21`: lee `backend/.env` (Atlas e integraciones
  reales) con `restart: unless-stopped`. Un contenedor levantado una vez para
  probar se reinicia solo con el equipo y sigue ejecutando tareas contra
  producción. Es la explicación más probable del «contenedor docker» del
  13-11-2026. No se verificó en qué máquina estaba.

**Qué protege hoy y qué no**
- `announcement-publish`: reclama cada aviso con
  `findOneAndUpdate({_id, notificadoEn: null})`
  (`modules/announcements/announcement-notify.service.ts:163-167`). Un aviso no
  se reparte dos veces. Pero si lo reclama la instancia mal configurada (por
  ejemplo el contenedor con FCM apagado), el aviso queda marcado y nunca se
  empuja.
- `uniplanner-verificacion`: el cursor se lee y se escribe sin condición
  (`modules/uniplanner/verificacion.service.ts:182` y `:201-203`). Dos
  instancias leen el mismo cursor y procesan la misma tanda. El aviso tiene id
  fijo y no se duplica, pero las escrituras sí se repiten, y el cursor puede
  retroceder si la instancia lenta escribe la última.
- `class-reminders` y el resto dependen de `dedupeKey` en
  `crearNotificacion()`. Ahí hay una carrera: `esNueva` sale del `findOne`
  previo (`shared/notify.ts:219-239`) y no del resultado del upsert. Si dos
  instancias pasan por el mismo hecho en el mismo instante, las dos ven
  «no existe», las dos hacen upsert y las dos emiten socket y **push**. La
  ventana es pequeña: los temporizadores arrancan desfasados. También depende
  de que exista el índice único `(userId, dedupeKey)`
  (`models/notification.model.ts:74-75`): si `autoIndex` hubiera fallado con
  ese índice (ver §2), la deduplicación desaparecería sin aviso.
- Ningún `setInterval` salvo el del QR evita solaparse consigo mismo
  (`scheduler.ts:107,149,190,234,305,334,402`). Un `risk-scan` que tarde más
  que su intervalo se ejecuta dos veces a la vez en el mismo proceso.

**Impacto.** Trabajo y consumo de Atlas y Firestore multiplicados por el número
de instancias. Pushes duplicados ocasionales. Una instancia vieja u olvidada
ejecuta lógica corregida desde entonces y puede quedarse con trabajo que luego
no completa. Tras desplegar un arreglo, el contenedor sin actualizar sigue
aplicando el código anterior.

**Recomendación: un *lease* por tarea en `job-run.ts`**, sin dependencias
nuevas:

```ts
// En JobRunModel: leaseHolder: String, leaseUntil: Date (índice no hace falta: _id/job ya es único).
async function tomarLease(job: NombreTarea, duracionMs: number): Promise<boolean> {
  const ahora = new Date();
  const yo = `${os.hostname()}:${process.pid}`;
  try {
    const doc = await JobRunModel.findOneAndUpdate(
      { job, $or: [{ leaseUntil: { $lt: ahora } }, { leaseUntil: null }, { leaseHolder: yo }] },
      { $set: { leaseHolder: yo, leaseUntil: new Date(ahora.getTime() + duracionMs) } },
      { upsert: true, new: true },
    );
    return doc?.leaseHolder === yo;
  } catch (e) {
    // E11000: otra instancia creó el documento a la vez y lo tiene ella.
    if ((e as { code?: number }).code === 11000) return false;
    throw e;
  }
}
```

- `ejecutarTarea` llama a `tomarLease(job, intervalo * 0.9)` antes de
  `tarea()`. Si no lo consigue, sale sin anotar. Con duración menor que el
  intervalo, la instancia que muere suelta el turno sola. Con `leaseHolder: yo`
  en el filtro, la misma instancia renueva sin competir.
- Al terminar, conviene liberar (`leaseUntil: ahora`) solo si
  `leaseHolder === yo`. Así otra instancia no espera de más tras un fallo.
- Para tareas que pueden durar más que su intervalo (riesgo), renovar el lease
  a mitad de la pasada o elegir una duración mayor.
- El lector QR, que no pasa por `ejecutarTarea`, puede usar el mismo lease con
  `duracionMs ≈ 10 s` y renovarlo en cada pasada. Así solo una instancia lee
  Firestore.
- Además del lease, conviene **una variable `JOBS_ENABLED` (o
  `SCHEDULER_ROLE=all|none`)** que `server.ts` consulte antes de las nueve
  llamadas, a `0` por defecto en `docker-compose.yml`. El lease evita el
  trabajo doble. La variable evita que una instancia con configuración distinta
  (sin FCM, sin SMTP) gane el lease. Al añadirla, actualizar `.env.example`,
  `KNOWN` de `check-env.mjs` y la tabla de CLAUDE.md, como pide la regla de
  verificación.
- En `crearNotificacion`, calcular `esNueva` con el resultado del upsert
  (`includeResultMetadata: true` → `lastErrorObject.upserted`) y no con el
  `findOne` previo.
- En el centro de salud, guardar `hosts: { <host>: lastRunAt }` o el
  `leaseHolder`, y avisar si en la última hora ha corrido más de un host.

### 1.2 Atlas caído al arrancar: sin reintento. Severidad: **Alta**

**Evidencia**
- `backend/src/shared/db.ts:119-143`: si `mongoose.connect` falla, se anota
  `status = 'error'` y se sigue. El driver solo reconecta solo **después** de
  una primera conexión buena. Si falla la primera, nada vuelve a llamar a
  `connect`.
- `backend/src/server.ts:68`: `await connectDb()` y después `listen`. El
  proceso queda vivo indefinidamente.
- `backend/src/app.ts:87-90`: `/health` responde siempre 200 con `ok: true`.
- `deploy/actualizar.sh:47`: `curl -fsS` solo comprueba el 200.
- `backend/Dockerfile:40-41`: la sonda de Docker sí mira `db === 'connected'`,
  pero un contenedor `unhealthy` no se reinicia con `restart: unless-stopped`
  (Docker sin Swarm no actúa sobre el estado de salud).

**Impacto.** Un corte de DNS, de red o de Atlas justo en el reinicio de un
despliegue deja el backend respondiendo 500 a todo hasta que alguien reinicie a
mano. El despliegue se anuncia como «verificado».

**Recomendación**
- En `connectDb`, reintentar en segundo plano con retroceso (5 s, 10 s, 20 s…
  hasta 60 s) mientras `status !== 'connected'`, sin bloquear `listen`. Así se
  conserva la decisión documentada de que el servidor escuche y diga «no
  alcanzo la base».
- `/health` debería devolver **503** cuando `db !== 'connected'` (o añadir
  `/ready` con esa semántica y dejar `/health` igual para no romper clientes
  que lo usan como sonda de conectividad). Los clientes, según CLAUDE.md, ya
  tratan 502/503/504 como «sin servidor».
- `actualizar.sh` debe comprobar `"db":"connected"` en el cuerpo, con unos
  reintentos, y salir con error si no llega.
- Escuchar `mongoose.connection.on('disconnected'|'reconnected')` para dejar
  constancia en el log. Hoy una caída posterior solo se ve consultando
  `/health` (`db.ts:48`).

### 1.3 Base caída: el 500 genérico vacía las colas de los clientes. Severidad: **Media**

**Evidencia.** `backend/src/shared/error.ts:73`: todo lo que no tiene
`statusCode` es 500. No hay ningún caso para `MongoServerSelectionError`,
`MongoNetworkError` ni `MongoNotConnectedError` (grep sin resultados). Con
`bufferCommands: false` (`db.ts:124`) esas consultas fallan enseguida. El
escritorio pasa una entrada a `fallida` al octavo 5xx
(`desktop/src/domain/offline/clasificacion.ts:51,78`), con espera de 2 s
doblando hasta 5 min (`:49,57`). Ocho intentos son unos 8,5 minutos. En cambio,
502/503/504 se tratan como «sin servidor» y no gastan ese cupo
(`desktop/src/domain/offline/conectividad.ts:13-18`).

**Impacto.** Una caída de Atlas de más de unos 8 minutos convierte notas y
asistencia ya capturadas en «Con error». No se pierden (se pueden reintentar),
pero el docente tiene que reenviarlas a mano. No se verificó el comportamiento
equivalente del móvil.

**Recomendación.** En `errorHandler`, traducir los errores de conectividad de
Mongo a **503** con `Retry-After: 30` y `codigo: 'BASE_NO_DISPONIBLE'`. Con eso
basta para que los dos clientes esperen en vez de rendirse. Añadir el caso a
`tests/error-handler.test.ts`.

### 1.4 Sin apagado ordenado. Severidad: **Media**

**Evidencia**
- No hay `process.on('SIGTERM'|'SIGINT')` en `backend/src` (grep).
- `backend/src/shared/scheduler.ts:68,113,154,195,239,338,345,352,…`: hay
  funciones `stop*` exportadas que no usa nadie.
- `backend/src/server.ts:61-66`: solo `uncaughtException` cierra el servidor.
  No cierra Socket.io, así que `server.close` espera a que se suelten los
  websockets y termina saliendo por el temporizador de 10 s.
- `deploy/instalar.sh:39-57`: la unidad systemd no fija `TimeoutStopSec` ni
  `KillSignal` (valores por defecto: SIGTERM y 90 s). Sin manejador, Node muere
  al instante con SIGTERM.

**Impacto.** En cada despliegue se cortan peticiones en vuelo. Un
`bulkWrite` de 5 000 celdas puede quedar aplicado a medias; es idempotente y el
cliente reintenta, pero la auditoría de `auditBatch` puede no escribirse. Una
tarea a medio ejecutar no deja constancia en `ejecuciones_tareas`. Los sockets
se cierran sin aviso y todos los clientes reconectan a la vez.

**Recomendación.** En `server.ts`, un `apagar(señal)` idempotente que:
1. pare las nueve tareas con las `stop*` existentes;
2. libere los leases propios (§1.1);
3. `io.close()` (avisa a los clientes y cierra el servidor HTTP);
4. espere a que `server.close` termine o a un tope de 15 s;
5. `mongoose.disconnect()` y `process.exit(0)`.

Llamarlo desde `SIGTERM`, `SIGINT` y desde el `uncaughtException` actual. Poner
`TimeoutStopSec=30` en la unidad.

### 1.5 Varias instancias y Socket.io sin adaptador. Severidad: **Media (condicional)**

**Evidencia.** `backend/src/shared/socket.ts:29`: `new Server(server, …)` sin
adaptador. Sin Redis ni el adaptador de Mongo, `emitToUser` solo llega a los
sockets conectados **al mismo proceso** que emite.

**Impacto.** Si `servidor2` también atiende tráfico (no se verificó: la
documentación solo describe el Nodo 1), una nota guardada en un proceso no
invalida la caché de un docente conectado al otro. Las tareas de una instancia
tampoco avisan por socket a los usuarios de otra.

**Recomendación.** Decidir explícitamente «una instancia sirve tráfico» y
dejarlo escrito en `DESPLIEGUE_PRODUCCION.md`. Si se quieren varias,
`@socket.io/mongo-adapter` reutiliza Atlas sin añadir infraestructura.

### 1.6 Arranque sin variables. Severidad: **Baja**

`validarProduccion()` corre antes de todo (`server.ts:21`) y, según CLAUDE.md,
se activa con `MONGODB_URI` y no con `NODE_ENV`. Sin `MONGODB_URI` el servidor
arranca en modo `disabled` (`db.ts:108-113`). Es la decisión documentada y
parece correcta. No se revisó `env.ts` línea a línea. Una mejora barata: que
`check:env` corra en `actualizar.sh` antes de reiniciar el servicio.

---

## 2. Índices

### 2.1 Deriva de índices sin detección al arrancar. Severidad: **Alta**

**Evidencia**
- `backend/src/shared/reparar-indices.ts:5-12`: el propio módulo documenta que
  `autoIndex` falla en silencio con `IndexOptionsConflict`.
- Ese plan puro solo lo usa `scripts/repair-indexes.ts`, que tiene una lista
  fija de tres índices (`repair-indexes.ts:1-25`). No hay ninguna llamada a
  `diffIndexes`, `listIndexes` ni a un evento `index` de modelo en
  `backend/src` (grep).
- El caso real: sesiones sin TTL, con 249 de 250 vencidas
  (`repair-indexes.ts:9-15`).

**Impacto.** Cualquier índice nuevo o modificado puede quedarse sin aplicar
sin que nadie se entere. Los más sensibles fallan sin error: el único de
`(userId, dedupeKey)` (avisos duplicados), los únicos parciales de la lista QR
(dos listas abiertas por grupo) y los TTL (colecciones que crecen sin límite).

**Recomendación (sin escribir nada en la base)**
1. Tras `connectDb()`, en segundo plano y sin bloquear `listen`, recorrer
   `mongoose.modelNames()` y para cada uno:
   - `await Model.init().catch(e => registrar(modelo, e))`. `init()` devuelve
     la promesa de `ensureIndexes`, y es ahí donde Mongoose «traga» el
     `IndexOptionsConflict`; esperarla lo saca a la luz;
   - `await Model.diffIndexes()` (Mongoose 8 la tiene: devuelve `toDrop` y
     `toCreate`).
2. Pasar el resultado por `planearIndice` (ya existe) para distinguir faltan,
   distintos y sobran. Los que sobran a propósito, como
   `estudiantes_email_activo_unico` (`repair-indexes.ts:21-23`), irían en una
   lista blanca con su motivo.
3. Guardar el informe en memoria o en `ejecuciones_tareas` (job
   `index-check`) y exponerlo en `GET /system/health` como un componente más:
   `saludable` / `con error` con la lista. No reparar desde ahí: reparar sigue
   siendo `npm run migrate:indices`.
4. Generalizar `repair-indexes.ts` para que tome los objetivos de ese mismo
   diff en vez de una lista fija de tres.
5. Una prueba en `tests/reparar-indices.test.ts` que cubra el caso «TTL
   distinto» y «unique distinto», si no están ya (no se comprobó el contenido
   del archivo).

### 2.2 `unique: true` + `index: true` en el mismo campo. Severidad: **Baja (sin verificar)**

`grep` encuentra el patrón en nueve modelos (`academic-period.model.ts:27`,
`config.model.ts:7`, `device.model.ts:18`, `institution.model.ts:52`,
`job-run.model.ts:19`, `notification-preference.model.ts:21`,
`professor.model.ts:7`, `student.model.ts:7`, `user.model.ts:8`). En Mongoose
8, a nivel de campo las dos opciones se funden en un único índice único, y el
aviso «Duplicate schema index» que se arregló venía de combinar `index: true`
con un `schema.index(…, {unique})` aparte. No se comprobó en la base. Lo
resolvería el diff de §2.1. Quitar el `index: true` redundante es limpieza
inofensiva cuando se toque cada modelo.

---

## 3. Actualizaciones

### 3.1 Versión del backend fija en 0.1.0. Severidad: **Media**

**Evidencia.** `backend/package.json:3` (`"version": "0.1.0"`).
`shared/version.ts` la lee y la publica en el centro de salud y en Swagger
(`health.service.ts:31`, `swagger.ts:3`). El backend no está en
`plataformas.mjs` (`versionEn` solo cubre escritorio y móvil,
`.github/scripts/plataformas.mjs:48,58`).

**Impacto.** No se puede saber qué código corre en producción. Con el despliegue
por `rsync` de una copia de trabajo (§5.2) puede ser cualquier cosa, incluso
cambios sin commitear.

**Recomendación.** Inyectar el SHA de git en el despliegue (escribir
`dist/BUILD` con `git rev-parse --short HEAD` y `git status --porcelain`
vacío/sucio) y exponerlo en `/system/health` y en `/health`. Opcionalmente,
añadir `backend/package.json` a `versionEn` para que suba con los clientes.

### 3.2 Sin versión mínima de cliente. Severidad: **Media**

**Evidencia.** No hay `X-Client-Version`, `minClient` ni nada equivalente en
`backend/src`, `desktop/src` ni `flutter_app/lib` (grep). La API va bajo
`/api/v1` (`app.ts:78`), fijado en los clientes
(`desktop/src/core/config/env.ts:95`,
`flutter_app/lib/core/network/server_discovery.dart:57`).

Lo que existe y está bien: la regla de mantener `items` en la raíz y los topes
por defecto de la paginación (CLAUDE.md, «Listados»), y que los campos nuevos
del cuerpo sean opcionales (`capturadoEn`, `deviceId`, `weight`).

**Impacto.** El día que un cambio no pueda ser compatible, no hay forma de
decirle a un móvil de hace seis meses «actualiza», ni siquiera de medir cuántos
quedan. Los APK no se actualizan solos.

**Recomendación.** Los dos clientes envían `X-Client-Version` y
`X-Client-Platform` en cada petición (cambio pequeño en `http-client.ts` y en
`ApiClient`). El backend lo registra (contador por versión en el centro de
salud) y, con una variable `MIN_CLIENT_VERSION_<PLATAFORMA>`, responde
`426 Upgrade Required` con `codigo: 'CLIENTE_DESACTUALIZADO'`. Los clientes ya
saben pintar mensajes por `codigo`. Hacerlo **antes** de necesitarlo: el primer
cliente que no envíe la cabecera es el que no se podrá cortar.

### 3.3 Dependencias: varias majors por detrás y sin automatizar. Severidad: **Media**

**Evidencia** (`npm outdated` ejecutado el 25-11-2026):
- Backend: `mongoose` 8.24 (última 9.13), `express` 4.22 (5.3),
  `express-rate-limit` 7.5 (8.7), `zod` 3.25 (4.6), `dotenv` 16 (18),
  `nodemailer` 9 (10), `pdfkit` 0.17 (0.21), `bcryptjs` 2.4 (3.0),
  `typescript` 5.9 (7.0), `vitest` 4 (5).
- Escritorio: `vite` 6 (8), `vitest` 3 (5), `framer-motion` 11 (14),
  `lucide-react` 0.469 (1.80), `tailwind-merge` 2 (3; ojo, `cn.ts` depende de
  `extendTailwindMerge`), `zod` 3 (4), `jsdom` 25 (31).
- Desajustes: `@types/express` ^5 con `express` ^4 (`backend/package.json:57`
  frente a `:39`); los `@types/*` de compresión y nodemailer van en
  `dependencies` (`:28-29`). `xlsx` viene de un tarball del CDN de SheetJS
  (`:51`): está fijado a 0.20.3, pero `npm audit` no lo vigila.
- Ningún `package.json` declara `engines`. CI y Docker usan Node 24
  (`verificar.yml:46`, `backend/Dockerfile:5`). La unidad systemd usa
  `/usr/bin/node` (`deploy/instalar.sh:50`), cuya versión en el servidor no se
  verificó.
- Tauri: el `Cargo.toml` pide `"2"` en los plugins
  (`desktop/src-tauri/Cargo.toml:17-50`) y los paquetes JS van en minors
  distintas (`@tauri-apps/plugin-updater` 2.10 instalado, 2.14 disponible).
  Tauri exige que la minor de cada plugin JS y su crate casen. `Cargo.lock` lo
  fija, pero subir una mitad sin la otra rompe la build.
- `ml_service/requirements.txt` fija versiones exactas sin lock de
  transitivas. El modelo activo es un `joblib` de scikit-learn
  (`ml_service/app/model.py:138`): un `joblib` no está garantizado entre
  versiones de scikit-learn, y si falla al cargar se traga el error sin log
  (`model.py:141-144`) y cae a reglas en silencio.
- No hay `dependabot.yml` ni Renovate (`.github/` solo tiene `scripts/`,
  `workflows/` y unas notas de release).

**Recomendación**
- Añadir `.github/dependabot.yml` agrupado por ecosistema (npm ×2, pub, pip,
  cargo, github-actions), semanal, con las majors en PR aparte.
- `engines: { node: ">=24 <25" }` en backend y escritorio, y comprobar la
  versión en `actualizar.sh` antes de compilar.
- Mover `@types/*` a `devDependencies` y alinear `@types/express` con la major
  de `express`.
- En `model.py`, registrar la excepción de `load_active` y guardar la versión
  de scikit-learn en `metrics.json`. Al cargar, si no coincide, reentrenar en
  vez de usar un artefacto que puede dar predicciones distintas.
- Orden sugerido de majors: primero las de herramientas (vitest, typescript,
  vite), que no tocan producción. Después `mongoose` 9 y `express` 5, cada una
  en su PR con `npm run test:e2e` completo. `zod` 4 cambia mensajes de error,
  y `error.ts` los transforma en el «campo que falla».

### 3.4 CI: huecos frente a la regla de verificación. Severidad: **Media**

**Evidencia.** `verificar.yml` corre `npm ci`, `tsc` y `npm test` en backend y
escritorio (`:81-117`), y `flutter analyze` y `flutter test` (`:150-160`).
Ningún workflow ejecuta `npm run lint`, `pytest` ni `cargo` (grep de
`lint|pytest|cargo` en `.github/workflows/`). La E2E (`npm run test:e2e`,
1 557 líneas en `scripts/e2e.ts`) tampoco corre en CI.

**Recomendación.** Añadir a `verificar.yml`: `npm run lint` en los dos
proyectos Node; un trabajo `ml` con `pip install -r requirements.txt` y
`pytest`; `cargo check` y `cargo test` en `desktop/src-tauri`, que tiene
pruebas de `segundo_plano.rs`; y un trabajo E2E con un servicio
`mongo:7` de GitHub Actions, aunque solo sea en `pull_request`. Es la única
verificación de alcance y de escrituras masivas contra una base real.

### 3.5 Pin de Flutter y proceso de versión. Severidad: **Baja (bien resuelto)**

`flutter_app/.flutter-version` (3.47.8) lo leen `verificar.yml:132-137` y
`release.yml`. `plataformas.mjs` es la única fuente de los archivos con
versión, y `comprobar-version.mjs` corre en CI (`verificar.yml:52`). No se
encontraron problemas. Único apunte: `pubspec.yaml` declara
`sdk: ">=3.8.0 <4.0.0"`, que el pin de Flutter hace irrelevante en CI pero no
en el equipo de quien desarrolla. `flutter pub get` con otra versión local
puede producir un `pubspec.lock` distinto.

---

## 4. Errores futuros en el código

### 4.1 Rutas que importan modelos. Severidad: **Media**

La regla «un `.routes.ts` no importa un Modelo» la incumplen **21 archivos**
(`grep -l "models/" backend/src/modules/*/*.routes.ts`). Cuántos imports de
modelo tiene cada uno:

| Archivo | Imports |
|---|---|
| `attendance/attendance.routes.ts` | 5 |
| `ai/ai.routes.ts`, `grades/grade.routes.ts`, `registration/registration.routes.ts` | 4 |
| `analytics`, `attendance-scan`, `auth`, `enrollment`, `notification`, `schedule` (`.routes.ts`) | 3 |
| `announcement`, `group`, `professor` (`.routes.ts`) | 2 |
| `agenda`, `download`, `feedback`, `ml`, `reports`, `config`, `subject`, `thesis` (`.routes.ts`) | 1 |

Destaca `reports/reports.routes.ts:4` (`ConfigModel`): `reports/` es el módulo
que CLAUDE.md pone como ejemplo a copiar, y ya se ha contaminado. Que la regla
diga «se van migrando cuando toque» no impide que vuelva a entrar.

**Recomendación.** Una prueba (o una regla de ESLint
`no-restricted-imports` con `patterns: ['**/models/**']` aplicada a
`**/*.routes.ts`) con una lista de excepciones que solo pueda encoger. Las
rutas de asistencia y notas, las de más tráfico y alcance, son las primeras a
migrar.

### 4.2 Archivos por encima de 800 líneas. Severidad: **Baja/Media**

| Archivo | Líneas | Nota |
|---|---|---|
| `backend/src/scripts/e2e.ts` | 1 557 | Prueba; tamaño justificable, pero conviene partirla por sección |
| `backend/src/modules/attendance-qr/attendance-qr.service.ts` | 1 238 | **El más arriesgado**: lógica de seguridad del QR mezclada con E/S |
| `flutter_app/lib/features/attendance/attendance_page.dart` | 1 141 | |
| `flutter_app/lib/features/auth/register_page.dart` | 1 084 | |
| `flutter_app/lib/core/widgets/compact.dart` | 1 083 | Kit de componentes; partir por widget |
| `flutter_app/lib/core/widgets/app_scaffold.dart` | 1 045 | Lleva `rutasDeRama` y el recorrido; muy tocado |
| `flutter_app/lib/core/theme/app_theme.dart` | 1 045 | |
| `backend/src/shared/uniplanner.ts` | 950 | Cliente REST de Firestore + firma |
| `flutter_app/lib/features/admin/admin_supervision_page.dart` | 804 | |

En el escritorio ninguno pasa de 800; el mayor es
`features/auth/register-page.tsx` con 766.

**Recomendación.** En `attendance-qr.service.ts`, sacar las decisiones que
todavía no estén en `domains/attendance/qr-session.ts` (resolución
`uid → estudiante`, `YA_REGISTRADA`, `DECIDIDA_POR_DOCENTE`) a funciones puras
con pruebas. Es la pieza con más reglas de negocio documentadas y la más
grande.

### 4.3 Errores tragados. Severidad: **Baja**

Revisados los `catch` vacíos y `.catch(() => undefined)` de `backend/src`.
Todos tienen motivo documentado: limpieza tras fallo
(`registration.routes.ts:234`, `thesis.routes.ts:233`), encadenamiento de cola
(`attendance-qr.service.ts:205-206`), respaldo (`shared/excel.ts:39-41`) y
scripts. Hay dos sitios silenciosos que importan:
- `ml_service/app/model.py:141-144`: `except Exception: return None` sin log
  (ver §3.3).
- `backend/src/shared/version.ts:17-21`: si no encuentra `package.json`
  devuelve `0.0.0` sin avisar. Es inofensivo, pero refuerza §3.1.

No hay `TODO`/`FIXME`/`HACK` reales en el código. El grep solo encuentra la
palabra «TODOS» en español.

### 4.4 Pruebas y migraciones. Severidad: **Media**

Bien cubierto: el dominio de grading, attendance, risk, alcance, sesión, QR,
periodos y plantillas tiene archivo propio en `backend/tests/` (48 archivos).
La lógica de migraciones con plan puro tiene prueba:
`planearMigracionDeFechas` (`tests/class-date.test.ts`), `auditStudentEmails`
(`tests/student-email-migration.test.ts`) y el plan de índices
(`tests/reparar-indices.test.ts`).

Sin prueba (verificado por grep de nombre e import en `backend/tests/`):
- `scripts/migrate-v3.ts`: hace `syncIndexes()` (`migrate-v3.ts:174-177`)
  sobre `Attendance`, `Activity` y `AcademicPeriod`. No toca `Estudiante`, así
  que no afecta a `estudiantes_email_activo_unico`. Aun así, `syncIndexes`
  **borra** todo índice de esas colecciones que no esté declarado en el modelo.
  Hoy no se sabe si existe alguno creado a mano (lo diría el diff de §2.1).
  Severidad Baja. Para el próximo script que necesite índices, mejor
  `createIndexes()` o el plan de `reparar-indices`.
- `scripts/migrate-enrollments.ts`, `scripts/migrate-student-names.ts` y
  `scripts/repair-indexes.ts` como ejecutores: probablemente su lógica pura
  esté probada en otro sitio, como la normalización de nombres en
  `validation.test.ts`, pero el flujo «respaldo → escritura → restauración si
  falla» no lo prueba nada salvo la E2E. Eso no se comprobó.
- El acceso a datos de los servicios (`*.service.ts`) solo lo cubre la E2E,
  que no corre en CI (§3.4).

**Recomendación.** Una regla en la sección de pruebas: toda migración nueva
separa `planear…()` puro (con prueba) del ejecutor, como ya hacen fechas e
índices.

---

## 5. Copias de seguridad y recuperación

### 5.1 No hay procedimiento de respaldo de Atlas. Severidad: **Alta**

**Evidencia.** `docs/DESPLIEGUE_PRODUCCION.md` (104 líneas) no menciona
respaldo, `mongodump` ni restauración. En `deploy/` no hay ningún script de
respaldo. La única mención es `docs/REFACTOR.md:136` («Respaldo de la base
(`mongodump`) antes de tocar datos»), como paso de un plan. Las migraciones
guardan copias parciales en colecciones de la propia base
(`asistencias_respaldo_fechas`, `estudiantes_respaldo_nombres`;
`docs/CIERRE_Y_ADMINISTRACION.md:409-410`), así que caen con ella.

No se pudo verificar qué plan de Atlas se usa ni si tiene *Cloud Backup* o
*snapshots* activados. Los clústeres compartidos (M0/M2/M5) no tienen
restauración a un momento concreto.

**Impacto.** Notas, asistencia y actas del cierre de periodo (la fotografía de
`AcademicPeriod`) dependen de un único sitio sin copia comprobada. Un
`deleteMany` equivocado en una migración no tiene vuelta atrás.

**Recomendación**
1. Comprobar en Atlas el plan y si hay snapshots, y anotarlo en
   `DESPLIEGUE_PRODUCCION.md` (frecuencia, retención, quién restaura).
2. Si no hay, un `deploy/respaldar.sh` con `mongodump --uri "$MONGODB_URI"
   --gzip --archive=…`, programado con un timer de systemd diario en el Nodo 1,
   rotación de 14 días y una copia fuera del nodo. Además de la base, copiar
   `uploads/` y `formatos/`, que viven en disco del servidor y `actualizar.sh`
   excluye (`deploy/actualizar.sh:31`).
3. **Probar la restauración** una vez con `mongorestore` en la pila de
   `docker-compose.local.yml` y escribir el procedimiento. Un respaldo sin
   restauración probada no cuenta.
4. Hacer obligatorio un respaldo antes de cualquier `migrate:* -- --aplicar`:
   que el script compruebe la fecha del último respaldo o lo pida.

### 5.2 Despliegue sin rollback ni trazabilidad. Severidad: **Alta**

**Evidencia**
- `deploy/actualizar.sh:26-35`: `rsync --delete` desde `backend/` de la copia
  local, sea cual sea su estado de git, directamente sobre
  `/srv/proyectos/nexus-backend`. No compila antes de copiar, no comprueba que
  el árbol esté limpio ni a qué commit corresponde.
- `deploy/actualizar.sh:44`: ejecuta `$DESTINO/actualizar.sh` en el servidor.
  Ese script no está en el repositorio: se excluye del rsync (`:32`) y no
  existe `backend/actualizar.sh`. **No se pudo revisar** qué hace (si ejecuta
  `npm ci`, si compila antes de parar el servicio, si guarda el `dist`
  anterior).
- `deploy/actualizar.sh:39-41`: sube `desktop/dist-web/` a `$DESTINO/web/`,
  aunque el propio comentario (`:9-11`) y CLAUDE.md dicen que la web vive en
  Vercel. Si `dist-web/` no existe en local, `set -e` aborta **después** de
  haber sincronizado ya el backend. Si existe y está viejo, publica una web
  vieja en el servidor.
- Tras un despliegue CLAUDE.md pide volver a ejecutar
  `migrate:fechas-asistencia`; el script no lo hace ni lo recuerda.

**Recomendación**
- Despliegue por versiones: `/srv/proyectos/nexus-backend/releases/<sha>/` y un
  enlace `current`. La unidad systemd apunta a `current`. El rollback es
  cambiar el enlace y reiniciar. Conservar las cinco últimas.
- Compilar (`npm ci && npm run build`) dentro de la carpeta nueva **antes** de
  tocar `current`. Si la compilación falla, el servicio sigue con la versión
  anterior.
- Negarse a desplegar con el árbol sucio o fuera de `main`, y escribir el SHA
  en `releases/<sha>/BUILD` (§3.1).
- Meter el `actualizar.sh` del servidor en el repositorio (`deploy/remoto.sh`)
  para que se pueda revisar.
- Quitar el rsync de `dist-web` o justificarlo en la documentación.
- Verificación final con `db: connected` y versión esperada (§1.2), y rollback
  automático del enlace si a los 60 s no responde.
- Migraciones: compatibles hacia atrás (añadir antes de quitar), para que
  volver al binario anterior no exija deshacer datos.

---

## Qué hacer primero

1. **Apagar las instancias de tareas que sobran** (hoy, sin código): parar el
   contenedor de `docker-compose.yml` que apunta a Atlas, quitarle
   `restart: unless-stopped` o cambiar el `env_file`, y confirmar qué hace
   `servidor2`. Comprobar después en `/system/health` que `instancia` deja de
   alternar.
2. **Respaldo de Atlas comprobado** (§5.1): ver si hay snapshots en el plan;
   si no, `mongodump` diario con una restauración probada en local. Incluir
   `uploads/` y `formatos/`.
3. **Lease en `ejecutarTarea` + `JOBS_ENABLED`** (§1.1), y `esNueva` desde el
   resultado del upsert en `crearNotificacion`.
4. **Reintento de conexión inicial a Atlas y `/health` (o `/ready`) en 503 sin
   base**; `actualizar.sh` comprueba `db: connected` (§1.2).
5. **Errores de conectividad de Mongo → 503 con `Retry-After`** (§1.3), para
   que una caída no deje en rojo las colas de los clientes.
6. **Despliegue con carpetas por versión, SHA visible y rollback por enlace**
   (§5.2, §3.1), y el script remoto dentro del repositorio.
7. **Apagado ordenado con SIGTERM** (§1.4).
8. **Detección de deriva de índices al arrancar, expuesta en
   `/system/health`** (§2.1).
9. **CI completo**: lint, `pytest`, `cargo check/test` y E2E con `mongo` de
    servicio (§3.4); Dependabot y `engines` (§3.3).
10. **`X-Client-Version` y `426` con versión mínima** (§3.2), antes de
    necesitar un cambio incompatible.
11. **Regla de ESLint que congele las rutas que importan modelos** y extracción
    de lógica pura de `attendance-qr.service.ts` (§4.1, §4.2).
