# Cierre de periodos, auditoría, salud y telemetría

Guía de las capacidades administrativas añadidas en la evolución v3. Explica
qué hace cada una, por qué está diseñada así y qué hay que configurar.

Complementa a `docs/AGENDA_Y_NOTIFICACIONES.md` (agenda y avisos) y a
`docs/ARQUITECTURA_V2.md` (arquitectura general).

---

## 1. Cierre oficial del periodo académico

### El problema

`period` era una cadena (`'2026-1'`) repartida por notas, asistencia y
matrículas. Nadie sabía si un semestre seguía abierto, así que una nota se
podía corregir un año después sin que el consolidado impreso en diciembre
dejara de circular como oficial. Cuando los dos no coincidían, no había forma
de saber cuál tenía razón.

### Los tres estados

| Estado | Qué significa | Qué se puede escribir |
|--------|---------------|-----------------------|
| `OPEN` | Semestre en curso | Todo |
| `CLOSING` | Cierre en marcha | Ni notas, ni asistencia, ni matrículas |
| `CLOSED` | Cerrado, con fotografía completa | Ídem |

**`CLOSING` no es adorno.** El cierre recorre miles de registros y puede
interrumpirse. Sin un estado intermedio hay dos opciones y las dos son malas:
marcarlo cerrado desde el principio —y una interrupción deja un periodo cerrado
con la fotografía a medias— o no bloquear nada, y entonces una nota guardada a
mitad del proceso queda fuera del acta sin que nadie lo note.

El orden lo garantiza:

1. `CLOSING` → las escrituras académicas ya devuelven 409.
2. Se genera la fotografía con `computeAcademicRecords()`.
3. **Solo si terminó**, `CLOSED`.

Un fallo en el paso 2 deja el periodo en `CLOSING`: bloqueado, sí, pero honesto.
Se retoma llamando otra vez a `POST /periods/:period/cierre` —es idempotente— o
se aborta con `/cierre/abortar`, que existe precisamente para que un fallo de
red no deje el semestre en solo lectura para siempre.

### Qué se bloquea y qué no

Se bloquean **notas, asistencia y matrículas**: son el acta, y cambiarlas
después la desmiente.

**Horarios, actividades, avisos y eventos del calendario siguen editables**, y
es una decisión, no un descuido. Ninguno entra en el consolidado: un horario
dice dónde y cuándo se dictó una clase, y a un coordinador le puede hacer falta
corregirlo un año después para reconstruir un aula. Bloquearlos solo impediría
arreglar datos sin proteger nada. Lo que sí queda bloqueado es la asistencia
asociada a esa clase, que es lo que cuenta para el porcentaje.

La lista vive en `domains/periods/period-lifecycle.ts` (`ENTIDADES_BLOQUEADAS`)
y está fijada por pruebas.

### La fotografía

Un documento por **(estudiante, materia, periodo)**, no uno por periodo. Un
único documento con el semestre entero dentro superaría los 16 MB de MongoDB en
cuanto la institución creciera, y el fallo llegaría el día del cierre en forma
de un `BSONObjectTooLarge` que nadie sabría interpretar.

Repartido por registro:

- El cierre es **reanudable**: los upserts van contra la clave única
  `(period, studentId, subjectId)`, así que retomarlo reescribe en vez de
  duplicar.
- El consolidado histórico se consulta con un `find` normal.
- `snapshotVersion` dice con qué reglas se congeló. Si dentro de un año cambia
  la forma del documento, esa cifra es lo que permite saberlo.

Lo que se guarda **ya viene calculado** por la pipeline canónica. Aquí no se
recalcula ni una fórmula: si se hiciera, el acta oficial y la pantalla podrían
discrepar.

### Reapertura

Solo ADMIN, y con motivo obligatorio de al menos 10 caracteres.

**La fotografía anterior no se borra.** Se anota la reapertura con autor, fecha
y motivo en `reopenings[]`, junto con la versión que quedó congelada. Un cierre
posterior sobrescribe los registros por su clave, pero el documento del periodo
conserva la traza — que es lo único que permite responder «¿por qué el
consolidado de diciembre no coincide con el de marzo?».

### Interfaz

Escritorio: **Periodos** (`/periodos`, capacidad `periods.close`). Muestra el
estado, la barra de progreso —que se refresca sola mientras hay un cierre en
marcha—, el resumen de la fotografía y su contenido paginado.

Móvil: no tiene pantalla de cierre a propósito. Lo que sí lee es el estado, para
desactivar la captura de notas y de asistencia con su explicación en vez de
ofrecer un botón que va a devolver 409.

---

## 2. Panel de auditoría

El sistema escribía auditoría desde el primer día; lo que no había era forma de
leerla sin abrir la base a mano.

### Saneado

Ocurre **al escribir**, en `shared/audit.ts`, no al leer. Sanear solo al leer
dejaría las contraseñas guardadas en la colección: a salvo de la pantalla y de
nadie más.

`shared/sanitize.ts` es el punto único. Elimina por nombre de campo
—`password`, `token`, `authorization`, `recoveryCode`, `FCM_PRIVATE_KEY`,
`MONGODB_URI`…, normalizando mayúsculas y separadores— y enmascara por patrón
dentro de cadenas libres: correos, JWT, cadenas de conexión y cédulas. Acota
tamaños, profundidad y número de claves, y nunca registra un cuerpo binario.

La regla que protege es negativa —«esto NO puede quedar guardado»—, y una regla
negativa copiada en ocho ficheros se cumple en siete. Por eso vive dentro de
`auditChange`/`auditBatch`: una ruta escrita dentro de un año no puede
saltárselo sin querer.

`calcularDiff()` registra **solo lo que cambió**. Guardar el documento entero
dos veces por un número que pasó de 3.0 a 3.5 llenaba la colección de copias
casi idénticas.

### Acceso

**Solo ADMIN.** Un COORDINATOR administra docentes y catálogo, pero la
auditoría contiene los cambios de todo el mundo —incluidos los del propio
ADMIN sobre cuentas—, y abrirla a coordinación la convertiría en una forma
cómoda de vigilar al personal. Si la política institucional lo exige algún día,
se abre en `audit.routes.ts` y se documenta el porqué; no antes.

### Interfaz

Escritorio: **Auditoría** (`/auditoria`). Tabla virtualizada con fecha, actor,
acción, entidad, identificador y qué campos cambiaron. El contenido del antes y
el después se pide al abrir un evento: una tabla con dos documentos completos
por fila no se lee.

El móvil no la tiene, y no por falta de tiempo: es una herramienta de
investigación que se usa sentado, con filtros y comparando dos columnas.

---

## 3. Centro de salud del sistema

`GET /api/v1/system/health` (ADMIN/COORDINATOR). `/health` a secas sigue siendo
la sonda pública y mínima: un balanceador necesita saber si el proceso
responde, no qué integraciones hay configuradas.

### Cuatro estados, no dos

**desactivado** · **configurado** · **saludable** · **con error**.

Sin esa distinción, un SMTP que nadie quiso activar aparecería en rojo para
siempre y el rojo dejaría de significar «hay que mirar esto».

### Qué informa

- MongoDB, servicio ML, SMTP, FCM y comprobación de versiones.
- Fuente activa del riesgo: `model` o `rules`.
- Las cinco tareas periódicas con su última ejecución, último éxito, duración,
  número de pasadas, fallos y último error.
- Versión del backend, tiempo de actividad e instancia.
- Resumen de los defectos reportados por los clientes.

### Dos garantías

**Ni un secreto sale.** El mensaje de error de Mongoose lleva dentro la cadena
de conexión con usuario y contraseña, y este panel es exactamente la pantalla
que apetece pegar en un chat de soporte. Todo pasa por `resumirError()`.

**Abrir el panel no puede tumbar el servidor.** Las comprobaciones remotas van
en paralelo y con tiempo de espera corto (3 s para el ML). Encadenadas, un ML
caído sumaría su espera a la de todas las demás y el panel tardaría más cuanto
peor estuviera el sistema.

### Multi-instancia

El tiempo de actividad y la versión son de **esa** instancia, y el panel lo dice
por escrito. Las tareas se leen de la colección `ejecuciones_tareas`, no de una
variable del proceso: con dos instancias, la que atiende la consulta no tiene
por qué ser la que ejecutó la tarea, y contestaría «nunca» sobre algo que sí
corrió hace un minuto.

---

## 4. Patrones de inasistencia

El porcentaje de asistencia sirve para el riesgo de fin de semestre; no sirve
para detectar a tiempo. Un estudiante con 78 % que ha faltado a las tres
últimas clases seguidas está abandonando la materia, y el porcentaje —que sigue
por encima del umbral— no lo dice.

### Los cinco patrones

| Patrón | Se dispara con | Severidad |
|--------|----------------|-----------|
| `AUSENCIAS_CONSECUTIVAS_2` | 2 faltas seguidas **al final** de la serie | Media |
| `AUSENCIAS_CONSECUTIVAS_3` | 3 o más seguidas | Alta |
| `TARDANZAS_REPETIDAS` | ≥ 3 llegadas con ≥ 10 min de retraso | Baja/Media |
| `CAIDA_RECIENTE` | Caída ≥ 25 puntos entre las últimas 4 clases y el historial | Media/Alta |
| `ASISTENCIA_PARCIAL_REPETIDA` | ≥ 3 clases perdiendo al menos ¼ del tiempo | Media |

Los umbrales viven en `domains/attendance/patterns.ts` (`UMBRALES_PATRON`), en
un solo sitio y fijados por pruebas. **No se replican en los clientes**: el
móvil y el escritorio solo llevan el título legible de cada patrón.

Dos detalles que las pruebas fijan:

- Se mira la racha **final**, no la más larga del semestre. Una racha de marzo
  que ya terminó no es un problema abierto en mayo, y abrir un caso por ella
  enseñaría a ignorar los casos.
- Con 3 o más consecutivas **no** se emite además el patrón de 2. Emitir los dos
  duplicaría el caso y la notificación del mismo hecho con dos claves distintas
  que el dedupe no relaciona.

### Llegadas tarde

El modelo de asistencia no tenía forma de distinguir «llegó tarde» de «vino»:
un booleano no da para eso. Se añadió `lateMinutes` (opcional, por defecto 0),
compatible con todos los registros anteriores.

**No se infiere.** Un listado escaneado o una lista pegada no traen la hora de
llegada; deducir un retraso de ahí abriría casos de seguimiento sobre
estudiantes puntuales. Se captura a mano: en el móvil, el botón «Tarde» de cada
fila (10 min por defecto, ajustable manteniéndolo pulsado).

### Casos, no notificaciones

Una notificación se lee y desaparece; el caso queda. La clave única es
`(estudiante, materia, periodo, patrón)`, sin fecha: el hecho seguido es «este
estudiante tiene este problema en esta materia», no «faltó el martes». La
segunda pasada que ve el mismo problema **actualiza** en vez de duplicar.

**La desaparición del patrón no borra el caso**: pasa a `RESUELTO` con su fecha
y sigue en el historial. Borrarlo dejaría al docente sin memoria de lo que ya
había atendido.

Se activa con `ATTENDANCE_PATTERN_INTERVAL_MIN`. Va a 0 por defecto —al revés
que los recordatorios— porque la pasada recorre la asistencia de todo el
alcance: una instalación local recién clonada no debería arrancarla sola. Con
varias instancias, en una: el `dedupeKey` evita el aviso doble, no el trabajo
doble.

---

## 5. Telemetría de errores de los clientes

Propia y limitada, sin proveedor externo. No es ideología: lo que se reporta
son fallos ocurridos sobre expedientes de estudiantes reales, con sus cédulas y
sus notas dentro de los mensajes. Mandar eso a un tercero convierte un panel de
diagnóstico en una transferencia de datos personales que nadie autorizó.

### Un documento por firma, no por ocurrencia

Una pantalla que falla en bucle manda el mismo error cincuenta veces por
minuto. Guardarlos todos llenaría la colección de ruido y escondería los otros
diez defectos distintos que sí hay.

**La firma la calcula el servidor** a partir de cliente, categoría, ruta
normalizada y mensaje normalizado. Si la calculara el cliente, dos versiones de
la aplicación agruparían distinto el mismo defecto.

**El usuario sale de la sesión**, nunca del cuerpo: un cliente que declarara su
propio `userId` podría declarar el de otro.

### Los clientes deduplican antes de enviar

- **Escritorio** (`core/telemetry/reporter.ts`): `ErrorBoundary` de React,
  `window.onerror` y `unhandledrejection`. Ventana de silencio de 5 minutos por
  firma, tope de 50 firmas por sesión.
- **Móvil** (`core/telemetry/error_reporter.dart`): `FlutterError.onError` y
  `PlatformDispatcher.instance.onError`. Sin red, cola de como mucho 10
  reportes **en memoria** —no en disco: un archivo con trazas de error en el
  teléfono de un docente es un archivo con nombres de estudiantes dentro—, con
  un solo reintento.

En los dos, **un fallo al reportar no se reporta**: reintentar sería la forma
más rápida de convertir un error en un bucle de peticiones.

El endpoint tiene además su propio limitador (30 reportes cada 5 minutos), para
que un bucle no agote el cupo general de la sesión justo cuando la aplicación
ya está rota.

### Categorías

`render`, `network`, `runtime`, `unhandled`, `promise`, `otro`. **`network` se
separa a propósito**: un teléfono sin cobertura no es un defecto del programa, y
mezclarlo ahoga la lista con lo único que nunca hay que arreglar.

### Retención

`TELEMETRY_RETENTION_DAYS` (90 por defecto) purga lo resuelto e ignorado.
Con 0 no se borra nada.

---

## 6. Historial cronológico del estudiante

`GET /api/v1/students/:id/historial`.

Une **matrículas, notas creadas o modificadas, ausencias y retrasos, alertas de
riesgo, intervenciones, patrones de inasistencia, actividades y cierres de
periodo**, ordenados y paginados.

### Por qué lo hace el backend

El historial cruza seis colecciones. Si cada cliente lo armara por su cuenta,
harían seis peticiones, ordenarían con seis criterios y el escritorio y el móvil
mostrarían dos historias distintas del mismo estudiante.

### Contrato de un evento

`id`, `type`, `occurredAt`, `title`, `summary`, `period`, `subjectId`,
`subjectName`, `metadata`, `sourceId` y `link`.

### Reglas

- Se distingue el **hecho académico** del evento técnico. Una nota corregida es
  historial; que alguien tocara un documento a las 3:14 es auditoría, y vive en
  su propio panel. Mezclarlos convertiría la ficha en un volcado que nadie lee.
- La asistencia solo aporta **ausencias y retrasos**. Una asistencia normal
  repetida cuarenta veces no es historial, es ruido.
- **Las notas internas del docente no se le muestran al estudiante.** La
  evidencia del caso sí; lo que el docente escribió al intervenir, no.
- El orden es **estable**: a igualdad de instante desempata el `id`. Sin eso,
  dos eventos del mismo segundo podrían intercambiarse entre página y página y
  uno de los dos no aparecería nunca.
- Cada fuente se consulta una vez y con tope propio; la paginación se aplica
  **después** de ordenar la unión. Paginar por fuente devolvería las veinte
  notas más recientes y ninguna asistencia, aunque la asistencia fuera más
  nueva.

### Interfaz

- **Escritorio**: diálogo desde el botón de historial de cada fila del listado
  de estudiantes, con filtros por periodo y tipo y agrupación por día.
- **Móvil**: panel inferior desde el directorio y desde la ficha del estudiante.

---

## 7. Migración

```bash
cd backend
npm run migrate:v3                # simulación: no escribe nada
npm run migrate:v3 -- --aplicar   # ejecuta
```

Empieza en **simulación a propósito**: toca tres colecciones completas sobre
datos reales de estudiantes, y un script que escribe por defecto se ejecuta
«para ver qué hace» sin vuelta atrás.

Es **idempotente y reanudable**: cada paso solo toca lo que aún no cumple el
estado final.

| Paso | Estado anterior | Estado posterior |
|------|-----------------|------------------|
| Periodos | `period` solo como cadena en notas y matrículas | Un documento por periodo, en `OPEN` |
| Retrasos | Asistencia sin `lateMinutes` | `lateMinutes: 0` en todos |
| Actividades | Sin `period` | Hereda el del grupo (las que no tienen grupo se quedan sin él a propósito: deducirlo de la fecha acertaría casi siempre y fallaría en enero y julio) |
| Índices | — | `syncIndexes()` al final, cuando los datos ya son consistentes |

### Recuperación

Ningún paso borra ni sustituye: los tres **añaden** un campo o un documento.

```js
db.asistencias.updateMany({}, { $unset: { lateMinutes: '' } })
db.actividades.updateMany({}, { $set: { period: '' } })
db.periodos_academicos.deleteMany({ state: 'OPEN', closedAt: null })
```

Lo que **no** hay que deshacer así es un periodo ya cerrado: borrar su documento
dejaría la fotografía huérfana y el semestre volvería a admitir escrituras.

---

## 8. Suite E2E

```bash
cd backend
npm run test:e2e
E2E_MONGODB_URI="mongodb://127.0.0.1:27017" npm run test:e2e
```

Recorre el flujo académico completo contra la aplicación **real** —el mismo
`app.ts` de producción— sobre una base aislada que se crea, se usa y se borra en
la misma ejecución.

### Qué cubre

Autenticación por rol · materia y grupo · importación de estudiantes ·
matrícula · notas masivas de los tres componentes en los tres cortes ·
asistencia con retrasos · consolidado · riesgo · actividades con estado
derivado · intervención · PDF y Excel (comprobando la firma del archivo, no
solo el 200) · cierre de periodo · bloqueo 409 de notas, asistencia y
matrículas · que actividades y horarios siguen editables · fotografía ·
auditoría · historial · centro de salud · telemetría con deduplicación ·
reapertura con traza.

Incluye las comprobaciones de autorización que importan: 401 sin sesión, 403 de
un docente sobre datos de otro, 403 de un docente sobre auditoría y salud, 400
de un periodo mal formado, 409 de un cierre repetido.

### Aislamiento

- Base propia con nombre único por ejecución, **borrada al terminar** pase lo
  que pase (la limpieza va en `finally`).
- **Se niega a arrancar contra `mongodb+srv://`**: es casi seguro un despiste, y
  el precio del despiste es borrar la base de la institución.
- ML desactivado (`ML_ENABLED=0`): el riesgo sale del motor de reglas, que es
  determinista y no necesita red. Con el servicio arriba, un modelo reentrenado
  cambiaría el nivel de un estudiante y la suite empezaría a fallar sin que nada
  se rompiera.
- Correo y push apagados; todas las tareas periódicas a 0, para que ninguna
  pasada cree notificaciones que las comprobaciones no esperan.
- Puerto efímero: no choca con un `npm run dev` levantado.
- Datos deterministas: mismos códigos, mismas notas, mismas fechas.

### Sin dependencias nuevas

Un runner HTTP y un Mongo efímero habrían sido lo cómodo, pero los dos resuelven
problemas que ya están resueltos: Node trae `fetch` y el proyecto ya sabe
levantar su servidor. `mongodb-memory-server` además descargaría ~100 MB en el
`npm install` de todo el mundo, incluido quien nunca corra la suite.

**Requisito**: un `mongod` local escuchando (por defecto en el 27017). Sin él,
la suite no arranca y lo dice.

---

## 9. Sincronización en tiempo real

Las entidades nuevas emiten `sync:update` y están mapeadas en los dos clientes.

| Entidad | Escritorio invalida | Móvil invalida |
|---------|--------------------|----------------|
| `period` | periodos, notas, asistencia, matrículas, analítica | periodos, consolidado, pendientes, panel |
| `activity` | actividades **y** agenda | actividades, agenda y reprograma alarmas |
| `attendanceCase` | casos, analítica, historial | casos, panel |
| `clientError` | telemetría, estado del sistema | — (el móvil no tiene panel) |

`period` tira las cachés de lo que el cierre bloquea: un formulario abierto que
no se entere manda el cambio y recibe un 409 que no espera.

Las actividades salen por `emitToUser`, no por difusión: llevan el título de una
evaluación y la fecha de un parcial, y emitirlas a `role:PROFESSOR` las mandaría
a todos los docentes de la institución.
