# Auditoría de carga sobre la base de datos

Auditoría: 2026-09-06 · Correcciones: 2026-09-06 · Alcance: `backend/src`,
`desktop/src`, `flutter_app/lib`

Tres preguntas: **¿hay consultas N+1?**, **¿puede un script de ingesta degradar la
base?** y **¿los listados del panel paginan?** Más una cuarta que salió del
encargo: qué tiene UniPlanner de carga progresiva y si encaja aquí.

**Estado: los diez hallazgos están corregidos.** Este documento se conserva
porque explica de dónde salen los números —por qué 5 000 casillas y no 50 000,
por qué el cupo se cuenta por usuario— que es lo que impide que alguien los
cambie sin saber qué estaba midiendo.

---

## Resumen

| # | Hallazgo | Impacto | Estado |
|---|----------|---------|--------|
| E1 | `/attendance/scan/confirm` no acotaba `filas` ni `fechas`: ~380 000 escrituras en una petición | **Alto** | Corregido |
| E2 | Ninguna ruta de escritura tenía límite de tasa | **Alto** | Corregido |
| N1 | Importar el horario hacía hasta 300 viajes encadenados a Atlas | Medio | Corregido |
| P1 | El escritorio casi nunca pedía página: traía el tope por defecto entero | Medio | Corregido |
| P2 | El móvil no paginaba nada, en ningún listado | Medio | Corregido |
| E3 | El limitador global contaba por IP, y el campus sale por una IP | Medio | Corregido |
| N2 | Escaneo de patrones: dos consultas por patrón detectado | Bajo | Corregido |
| N3 | Recordatorio de seguimiento: una consulta por caso, una escritura por episodio | Bajo | Corregido |
| P3 | La auditoría cortaba en 200 sin forma de ver lo anterior | Bajo | Corregido |
| C1 | `presentes` no se validaba contra `fechas.length` | Bajo | Corregido |

### Qué cambió, en números

| | Antes | Después |
|---|---|---|
| Escrituras máximas en una petición (`/scan/confirm`) | ~380 000 | **5 000** (`TOPE_CELDAS`) |
| Escrituras por ventana de 15 min (`/students/bulk`) | 125 000 por IP | **10 000** por usuario (20 lotes × 500) |
| Consultas al importar un horario de 60 sesiones | hasta 300, encadenadas | **4** |
| Consultas del escaneo de patrones (N series) | 2 × N | **3** |
| Documentos por carga de la pantalla de Estudiantes | hasta 1 000 | **50** (escritorio) · **30** (móvil) |
| Listados administrativos sin paginar | 5 (auditoría, personal, docentes, sugerencias, supervisión móvil) | **0** |
| Filtro por institución en los listados de personal | ninguno | `?institutionId=` + selector en las 3 pantallas |
| Cupo general | 250/15 min **por IP** | 600/15 min **por usuario** |
| Pruebas | 374 backend · 140 escritorio · 99 móvil | **414 · 154 · 111** |

**Lo que está bien** —y es la mayor parte— está al final. En particular: los
índices están completos, la pipeline académica es una agregación y no un bucle,
y las tablas del escritorio ya están virtualizadas.

---

## E1 · Una sola petición podía escribir 380 000 documentos

**Dónde:** `backend/src/modules/attendance/attendance-scan.routes.ts:168-184`.

```ts
const confirmacion = z.object({
  groupId: z.string().min(1),
  fechas: z.array(z.coerce.date()).min(1),            // ← sin .max()
  durationMinutes: z.number().int().min(30).max(300).default(90),
  filas: z.array(z.object({
    studentId: z.string().min(1),
    presentes: z.array(z.boolean()),                   // ← sin .max()
  })).min(1),                                          // ← sin .max()
});
```

Las tres listas están sin techo, y el número de escrituras es **el producto** de
dos de ellas: una casilla por (fila × fecha). Lo único que lo acota es el límite
de cuerpo de Express, 2 MB, que no tiene ninguna relación con lo que esta ruta
puede escribir sin bloquearse.

La cuenta, con el formato real del JSON:

| | |
|---|---|
| Coste de una fila | ~57 B (`{"studentId":"507f…011","presentes":[]},`) |
| Coste de una casilla | 5 B (`true,`) |
| Presupuesto | 2 000 000 B |

Maximizando `filas × fechas`: con **200 filas y 1 900 fechas** el cuerpo ocupa
1,96 MB y pasa la validación. Eso son:

- **380 000 upserts** en `AttendanceModel.bulkWrite`
- **380 000 inserciones** más en `auditBatch` — la auditoría escribe un
  documento por casilla
- **dos `find`** con `date: { $in: [1 900 fechas] }` sobre esa misma colección,
  uno antes y otro después, para poder auditar el antes y el después

Es decir: **760 000 documentos escritos y dos consultas enormes por petición**,
desde una sesión de docente cualquiera. Y como no hay límite de tasa en
escritura (E2), se puede repetir 250 veces cada quince minutos.

Comparado con las rutas hermanas, que sí están acotadas:

| Ruta | Tope | Escrituras máximas |
|---|---|---|
| `POST /students/bulk` | `.max(TOPE_LOTE)` = 500 | 500 |
| `POST /enrollments/bulk` | `.max(TOPE_LOTE)` = 500 | 500 |
| `POST /grades/bulk` | 500 filas × 10 `labels` | 5 000 |
| `POST /attendance/scan/confirm` | **ninguno** | ~380 000 |

**Corregido.** Tope en las tres listas y, sobre todo, **un tope al producto**:
`TOPE_CELDAS = 5000` en `shared/validation.ts`. Una planilla real es un grupo
(≤ 60 estudiantes) por las clases de un corte (≤ 30 fechas), o sea unas 1 800
casillas, así que 5 000 es holgado para cualquiera que exista y deja el trabajo
por petición en el mismo orden que `/grades/bulk`.

Que el tope del producto haga falta *además* de los de cada lista no es
redundancia: 500 filas y 60 fechas están las dos dentro de su `.max()` y juntas
dan 30 000 casillas. Un tope por lista no puede ver eso.

De paso se arregla **C1**: un `.refine()` exige que cada fila traiga exactamente
un valor por fecha. Sin él, una fila más corta dejaba `presentes[i]` en
`undefined`, el `as boolean` lo dejaba pasar y Mongoose lo casteaba a `false` —
una falta que nadie marcó, sobre un estudiante que quizá sí fue.

Ocho casos en `tests/attendance-confirm-limits.test.ts`.

---

## E2 · Ninguna ruta de escritura tenía límite de tasa

Inventario completo de los limitadores del proyecto:

| Ruta | Cupo | Cuenta por |
|---|---|---|
| Global (toda la API) | 250 / 15 min | IP |
| `/auth/login` | 10 / 15 min | IP |
| `/auth/password` | 10 / 15 min | IP |
| `/auth/recovery/request` | 8 / 15 min | IP |
| `/auth/recovery/reset` | 20 / 15 min | IP |
| `/registro` | 10 / 15 min | IP |
| `/telemetry/errores` | 30 / 5 min | IP |
| `/ai/chat` | 20 / 15 min | **usuario** |
| `/ai/quick` | 60 / 15 min | **usuario** |

Todo lo demás —notas, asistencia, matrículas, estudiantes, horarios, avisos—
solo tiene el cupo global. Y el cupo global no fue pensado como defensa contra
escritura masiva: 250 peticiones son muchísimas cuando cada una puede escribir
500 documentos.

Cupo real de escritura por IP y ventana de 15 minutos, hoy:

| Ruta | Documentos por ventana |
|---|---|
| `/students/bulk` | 125 000 |
| `/enrollments/bulk` | 125 000 (× 2: estudiante + matrícula) |
| `/grades/bulk` | 1 250 000 |
| `/attendance/scan/confirm` | ~95 000 000 (E1) |

No hace falta mala intención: un cliente con un bucle de reintentos mal escrito
—que es el caso que de verdad ocurre— produce exactamente esto.

**Corregido.** Los límites viven ahora en `middlewares/rate-limit.ts`, en tres
capas que se acumulan:

| Limitador | Cupo | Alcance |
|---|---|---|
| `limiteGeneral` | 600 / 15 min | todas las peticiones de la API |
| `limiteEscritura` | 120 / 15 min | solo `POST`/`PUT`/`PATCH`/`DELETE` |
| `limiteLotes` | 20 / 15 min | las cuatro rutas masivas y los tres escáneres |

Los tres cuentan **por usuario cuando hay sesión y por IP cuando no**. El corte
de escritura se aplica con `skip: req => esLectura(req.method)` sobre
`apiRouter`, no ruta por ruta: marcar cuáles escriben deja fuera la que alguien
añada mañana, y una ruta de escritura sin marcar no falla — concede.

Que el general suba de 250 a 600 no afloja nada: lo que antes compartía una
facultad entera ahora es de cada persona.

**No sustituye a los topes por petición.** Son dos defensas distintas —cuánto
cabe en una petición y cuántas peticiones caben en una ventana— y hacen falta
las dos. Con solo el limitador, veinte peticiones de 380 000 escrituras siguen
siendo 7,6 millones.

UniPlanner resuelve lo mismo con `WriteGuard`, un *token bucket* en el cliente,
porque allí no hay servidor propio. Aquí el sitio correcto es el backend: un
guardián en el cliente no protege de un script que no usa el cliente.

---

## E3 · El limitador global contaba por IP, y el campus sale por una IP

`app.ts:50` — `rateLimit({ windowMs: 15 * 60 * 1000, limit: 250 })`, sin
`keyGenerator`, así que agrupa por IP.

Es un problema por los dos lados a la vez:

- **Demasiado flojo** contra el caso que preocupa: un script en una sola máquina
  tiene 250 peticiones cada quince minutos, que con los lotes actuales son
  millones de documentos.
- **Demasiado estricto** para el uso legítimo: una facultad entera detrás del
  NAT del campus comparte esas 250 peticiones. `ai.routes.ts` ya identificó esto
  y lo resolvió contando por usuario —«un campus sale a internet por una sola
  dirección: contar por IP dejaría a toda la facultad compartiendo el cupo de
  quien más pregunte»— pero el limitador global se quedó como estaba.

**Corregido** junto con E2: se cuenta por usuario cuando hay sesión y por IP
cuando no.

El detalle que hacía falta acertar: el limitador **se movió de `app.ts` a
`routes/index.ts`, después de `identificar`**. En `app.ts` corre antes de que se
sepa quién llama, así que un `keyGenerator` por usuario allí habría caído
siempre en la IP — el arreglo habría parecido hecho sin estarlo. Lo único que se
queda en `app.ts` es el del login, que cuenta por IP a propósito: quien prueba
contraseñas todavía no es nadie, y la clave saldría del correo que él mismo
elige.

---

## N1 · Importar el horario: de 300 viajes encadenados a 4

**Dónde:** `backend/src/modules/schedules/schedule.routes.ts:323-375`.

```ts
for (const sesion of body.sesiones) {        // hasta 60
  const materiaPrevia = await SubjectModel.findOne({ … });
  const materia = materiaPrevia ?? (await SubjectModel.create({ … }));
  if (!materiaPrevia) { const grupo = await GroupModel.create({ … }); }
  const franjaPrevia = await ScheduleModel.exists(clave);
  await ScheduleModel.findOneAndUpdate(clave, { … }, { upsert: true });
}
```

Es el único N+1 que está **en el camino de una petición**, no en una tarea de
fondo. Con las 60 sesiones que permite el esquema: 60 `findOne` + hasta 60
`create` de materia + hasta 60 `create` de grupo + 60 `exists` + 60
`findOneAndUpdate`, todos **encadenados** —cada uno espera al anterior.

Contra Atlas, con ~30 ms de ida y vuelta, son unos **9 segundos** de petición
colgada. Es exactamente el problema que el propio repositorio describe en
`/enrollments/bulk`: «un grupo de 40 eran 80 viajes en serie; un listado de
programa entero se pasaba del minuto y el docente no sabía si había funcionado».
Aquí se quedó sin arreglar.

**Corregido.** Tres fases y cuatro consultas: materias existentes por código →
`bulkWrite` de las nuevas → relectura para tener sus `_id` → `bulkWrite` de
grupos y de franjas.

La trampa documentada apareció puntualmente: **`bulkWrite` no castea los ids**.
Con `teacherId` en texto el filtro no casa con el ObjectId guardado, el upsert
no encuentra nada y **crea un duplicado** en vez de actualizar — dos materias
iguales y el horario con las clases repetidas, sin ningún error. Aquí lo cazó el
tipado porque el esquema declara el campo; en una agregación no habría avisado
nadie.

De paso, los avisos de socket salen agrupados al final en vez de uno por sesión
dentro del bucle: importar un horario de veinte franjas emitía cuarenta eventos,
y cada uno hace que el cliente invalide su caché y vuelva a consultar.

---

## N2 y N3 · Los dos N+1 de las tareas de fondo

**N2 — escaneo de patrones.** Era un `findOne` más un `findOneAndUpdate` dentro
de un bucle anidado (series × patrones detectados): con dos mil estudiantes en
el alcance, cuatro mil viajes encadenados por pasada. El archivo ya bateaba los
nombres —«Nombres en dos consultas, no en dos por caso»— pero los casos seguían
uno a uno.

**Corregido** con el mismo patrón de tres fases: una consulta de los casos
previos, un `bulkWrite` de todos los upserts, una relectura para tener los `_id`
de los recién creados, y los avisos ya sin tocar la base. De 2 × N consultas a
**tres**, sea cual sea N.

**N3 — recordatorio de seguimiento.** Un `StudentModel.findById` por caso y un
`RiskFeedbackModel.updateOne` por episodio, dentro de un bucle anidado.
**Corregido**: los nombres salen de una sola consulta con `$in` y las marcas se
acumulan en un `bulkWrite`.

En los dos apareció la misma trampa del casteo de ids que en N1.

**Falsos positivos que descarté:** `notification.routes.ts:101` (el bucle es
sobre `quietHours`, en memoria) y `announcement-notify.service.ts:163` (una
consulta por aviso, acotada a 50, y es un *claim-lock* deliberado para que dos
instancias no notifiquen el mismo aviso).

---

## P1 y P2 · Los listados ahora piden páginas

El backend paginaba bien —`paginacionCon()` con `total` y `hasMore` en todos los
listados— y el problema estaba en quién lo consumía: solo `audit-page` pasaba
`limit`, y el móvil no lo pedía en ningún sitio.

**Lo primero que hubo que arreglar no fue la paginación, fue la búsqueda.** La
pantalla de Estudiantes filtraba **en memoria** sobre la lista descargada. Eso
funciona mientras lo descargado sea *toda* la lista; en cuanto hay páginas, el
estudiante de la quinta deja de existir para la búsqueda y **nada lo indica**.
Es exactamente el fallo que describe el comentario de UniPlanner sobre su panel
(«se pedían con `limit(500)` y se filtraban en memoria, así que el usuario 501
no existía para la búsqueda»). Paginar sin mover la búsqueda al servidor no
habría sido una mejora: habría sido cambiar un coste por un fallo.

Así que `GET /students` amplía su `?q=` a `email` y `program` —los dos campos
que el filtro del cliente cubría y el servidor no— y los dos clientes dejan de
filtrar en memoria.

**Escritorio.** `useListadoPaginado` (`shared/hooks/`) envuelve
`useInfiniteQuery` y devuelve `propsDeTabla` listas para `DataTable`. Se
devuelven agrupadas a propósito: la alternativa es que cada pantalla recuerde
cablear cuatro props, y la que se equivoque no dará error — se quedará sin
paginar.

`DataTable` gana la carga progresiva. Dos detalles que costaron:

- **El disparo sale del virtualizador, no de un centinela.** Un
  `IntersectionObserver` necesitaría un nodo dentro del contenedor virtual,
  donde las posiciones las calcula el virtualizador y un nodo extra descuadra el
  alto total. El último índice montado ya lo sabe él. Se pide con ocho filas de
  margen: con el umbral en el final exacto la lista se para en seco y **se
  siente** como un fallo aunque no lo sea.
- **La animación de entrada no puede tocar `transform`.** El virtualizador
  posiciona cada fila con un `transform: translateY(...)` en línea; animarlo se
  lo pisaría y la fila entraría desde donde no es. Así que la fila solo aparece
  (`opacity`) y el desplazamiento lo hacen sus celdas, que no llevan transform
  propio. El efecto que se ve es el mismo.
- **La animación se limpia con un temporizador.** Como la tabla está
  virtualizada, una fila que sale de pantalla y vuelve **se remonta**: sin
  limpiar la marca, cada viaje del cursor volvería a animar las mismas filas.

**Móvil.** `PaginaDe<T>` en los modelos, `studentsPagina()` en el repositorio,
un `AsyncNotifier` que acumula páginas y guarda el término, y `ListaProgresiva`
(`core/widgets/`) con `ElementoQueEntra` para la entrada escalonada.

El notifier **no pasa por `AsyncLoading` al buscar**, y eso no es un detalle:
con `AsyncLoading` la pantalla pinta su esqueleto encima de todo el `Column`
—incluido el buscador—, y al desmontarse el campo se lleva su
`TextEditingController` con el texto escrito y el foco. Es la misma razón por la
que el término vive en el estado de la pantalla, y está documentada ahí desde
antes.

Es un `AsyncNotifier` y no un `FutureProvider.family` sobre el término: una
familia sin `autoDispose` deja una instancia viva por cada texto que alguien
llegue a escribir, y con `autoDispose` se perdería el acumulado al cambiar de
pestaña — que es justo lo que este proyecto evita a propósito.

**El mapa de invalidación se actualizó en `app.dart`** para las entidades
`student` y `enrollment`. Sin esa línea el evento llega, no encuentra nada que
invalidar y la pantalla se queda con la lista vieja: el fallo que no rompe nada
visiblemente y que `desktop/tests/unit/sync-map.test.ts` existe para cazar del
otro lado.

**P3 — la auditoría, y las tres listas administrativas.** También paginan. La
auditoría cortaba en 200 y avisaba de que había más («acota el rango de fechas
para ver los anteriores»): honesto, pero dejaba registros a los que no había
forma de llegar si caían dentro del mismo rango.

`staff`, `professors` y `feedback` no son `DataTable` sino listas de tarjetas,
así que usan `CargarMasAlLlegar` (`shared/ui/`): un centinela al final con
`IntersectionObserver` y `rootMargin: 300px`. Aquí sí funciona lo habitual
porque no hay virtualización de por medio; en `DataTable` el disparo tiene que
salir del virtualizador. La lógica de «qué acaba de llegar» se extrajo a
`useTandaNueva` y la comparten los dos caminos.

**El móvil también.** `admin_supervision_page` traía **todos** los docentes y
**todas** las cuentas de una vez y filtraba en memoria. Ahora pagina de 30 con
`ListaProgresiva`, y la búsqueda y el filtro de rol van al servidor.

Para que eso fuera posible hubo que **ampliar la búsqueda de docentes del
backend**: cubría `nombres`, `apellidos` y `cedula`, pero no el correo, que vive
en la cuenta y no en la ficha. El móvil lo suplía filtrando en memoria. Ahora
`GET /professors?q=` resuelve primero las cuentas que casan por `email` o
`fullName` y las suma al `$or` — una consulta más, y de paso hace buscable el
`fullName` de una ficha creada desde Personal sin `nombres`/`apellidos`.

**Tamaños de página.** 50 en escritorio y 30 en móvil. Los dos están elegidos
para que la **primera** pantalla se llene de una vez: 50 cubre de sobra las ~20
filas visibles de una tabla de escritorio, y 30 las ~12 de un teléfono con filas
compactas de 56 dp. Bajarlos haría que la primera pantalla ya necesitara dos
viajes, que es justo lo que se quería evitar.

---

## Lo que está bien

**Índices.** Completos en las colecciones calientes: `Asistencia` tiene los seis
campos de filtro indexados más el único compuesto `(studentId, subjectId, date)`;
`Matricula` igual, con `(studentId, groupId, period)`; `Auditoria` tiene los
cuatro compuestos que necesitan sus pantallas, todos por `createdAt: -1`.

**La pipeline académica no tiene N+1.** `computeAcademicRecords()` son dos
agregaciones en `Promise.all` más **una** consulta de estudiantes con `$in`. Es
el camino que alimenta el panel, los riesgos, las notificaciones y los reportes,
o sea el más recorrido del sistema, y está bien resuelto.

**El alcance por programa también.** `construirAlcanceDePrograma()` trae
docentes, materias, grupos y matrículas en cuatro consultas con `$in`, no en una
por docente, y se cachea por usuario.

**Las escrituras masivas ya usan `bulkWrite` + `auditBatch`**, con las dos
trampas documentadas (el casteo de ids y la auditoría por registro). El problema
de E1 no es la técnica, es que falta el tope.

**El conteo va en paralelo con la página** en todos los listados
(`Promise.all([find, countDocuments])`), no encadenado.

**El render de listas está resuelto en los dos clientes**: `DataTable`
virtualizado en escritorio, `ListView.builder` en las pantallas de lista del
móvil.

---

## Qué vigilar de aquí en adelante

Cuatro cosas que este trabajo dejó como regla y que se rompen por omisión:

1. **Un tope por lista no acota un producto.** Cuando el número de escrituras
   sale de multiplicar dos entradas, hace falta acotar el producto además de
   cada lado. `TOPE_CELDAS` existe por eso.
2. **Los topes por petición y los límites de tasa son defensas distintas.** Uno
   dice cuánto cabe en una petición y el otro cuántas peticiones caben en una
   ventana. Quitar cualquiera de los dos deja el agujero entero.
3. **Paginar un listado exige mover su búsqueda al servidor.** Filtrar en
   memoria sobre páginas es peor que no paginar: esconde registros sin decirlo.
4. **Un límite que depende de saber quién llama va después del middleware que lo
   averigua.** `limiteGeneral` en `app.ts` habría contado por IP para siempre y
   habría parecido arreglado.
