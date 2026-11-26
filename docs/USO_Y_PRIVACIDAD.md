# Uso de la aplicación y privacidad

La administración puede ver cuánto se usa UTS Nexus y quién lo usa más. Es
**estadística interna**: no se publica, no se comparte con terceros y solo la
ve el rol ADMIN. Este documento dice qué se registra, cómo se cuenta, cuánto
se guarda y qué se le dice a cada persona.

## El aviso que ve cada persona (versión 1)

> **Uso de la aplicación y privacidad**
>
> UTS Nexus registra cuándo usas la aplicación: los días en que entras, el
> tiempo aproximado de actividad (en tramos de 5 minutos), el número de
> peticiones y si lo haces desde el escritorio, la web o el móvil. No registra
> qué pantallas abres ni qué datos consultas o escribes.
>
> Estos datos no se publican ni se comparten con terceros. Solo los ve la
> administración de la plataforma y únicamente con valor estadístico: para
> saber cuánto se usa la aplicación y mejorarla.
>
> Tú eres el dueño de tus datos. Puedes pedir a la administración que te
> muestre lo registrado sobre ti o que lo elimine. Los registros se borran
> solos a los 400 días.

El texto está escrito en tres sitios que **tienen que decir lo mismo**:
`desktop/src/domain/usage/aviso-uso.ts`, `flutter_app/lib/features/usage/aviso_uso.dart`
y este documento. El servidor no guarda el texto, solo la versión que vio cada
persona (`AVISO_USO_VERSION` en `backend/src/domains/usage/aviso-uso.ts`, la
misma constante en los dos clientes). **Subir la versión vuelve a enseñar el
aviso a todo el mundo**, que es lo que corresponde si el texto cambia en algo
que importe: quien leyó una versión no leyó la siguiente.

- **Registro nuevo** (escritorio y móvil): el aviso está a la vista en
  `/registro` con la casilla «He leído el aviso de uso y privacidad», y sin ella
  no se envía. El backend guarda `avisoUsoVistoEn` y `avisoUsoVersion` al crear
  la cuenta. La casilla es opcional para el servidor: un móvil anterior no la
  manda y su cuenta verá el aviso al entrar.
- **Cuentas existentes**: `/auth/login` y `/auth/me` devuelven
  `avisoUsoPendiente`. Si es `true`, el cliente enseña un diálogo una vez con
  «Entendido», que llama a `POST /auth/aviso-uso`. Sin conexión no se enseña, y
  si la marca no llega al servidor el diálogo se cierra igual y vuelve en el
  siguiente inicio: un aviso no puede bloquear el trabajo. En el móvil no se
  monta encima del recorrido guiado; si ese día toca el recorrido, el aviso sale
  la vez siguiente.
- `POST /auth/aviso-uso` escribe sobre la cuenta de quien la llama y sobre nada
  más: está en la lista blanca de secretaría (`role-access.ts`) y fuera del
  cupo de escritura (`RUTAS_DE_SESION`).

## Qué se registra

Una fila por persona y día del campus en la colección `uso_diario`
(`models/usage-day.model.ts`):

| Campo | Qué es |
|---|---|
| `userId`, `rol`, `institutionId` | quién (el rol del token; la institución, de la cuenta) |
| `dia` | `AAAA-MM-DD` en la hora del campus (`CAMPUS_UTC_OFFSET_MIN`) |
| `peticiones` | cuántas peticiones con sesión |
| `porCliente.{escritorio,web,movil}` | peticiones por cliente |
| `franjas` | números de franja de 5 minutos con actividad (0–287) |
| `primeraActividad`, `ultimaActividad` | primera y última petición del día |

**No** se registra la ruta, la pantalla, el cuerpo ni la respuesta de ninguna
petición. Solo cuentan las peticiones con sesión: el formulario de registro o
la página de descargas no dejan rastro.

## Cómo se cuenta

- **Cliente.** La web la decide el canal del token (`canal: 'web'`), que el
  servidor fijó al iniciar sesión por el `Origin` (`canalDeOrigen`). Dentro de
  `app`, el móvil se reconoce por el `User-Agent` de `dart:io` (`Dart/…`) y el
  escritorio por llegar con el `Origin` de Tauri. Lo que llega sin `Origin` y sin
  `Dart/` (un script) se cuenta como móvil: es lo que llega sin navegador.
  `clienteDePeticion()` en `domains/usage/usage.ts`, con pruebas.
- **Minutos activos.** El día se parte en 288 franjas de 5 minutos; una franja
  con al menos una petición cuenta 5 minutos. Se guarda el **número** de franja
  con `$addToSet`, no un contador: dos instancias del backend, o el escritorio
  y el móvil a la vez, no cuentan dos veces el mismo rato. Es una
  aproximación honesta —quien lee una pantalla diez minutos sin pedir nada no
  suma— y se presenta como tal.
- **Ranking.** Por minutos, luego días activos, luego peticiones. Las
  peticiones solas premian a quien tiene más pantallas abiertas, no a quien
  más trabaja con la aplicación.

## Cómo se escribe sin cargar la base

El middleware `registrarPeticionDeUso` (justo detrás de `identificar` en
`routes/index.ts`) **no escribe en la base**: suma a un acumulador en memoria,
una entrada por (persona, día). Cada 60 s `volcarUso()` lo vuelca con **un
solo `bulkWrite`** de upserts (`$inc`, `$addToSet`, `$min`, `$max`), más una
consulta para la institución de las personas del lote. Son, como mucho, tantas
operaciones por minuto como personas activas, en una ida y vuelta.

Se eligió esto frente a un upsert con `$inc` limitado a uno por persona cada N
minutos porque ese límite también vive en memoria —así que tiene el mismo
riesgo de pérdida— y además pierde las peticiones intermedias. Lo que se puede
perder aquí es, como mucho, un minuto de estadística si el proceso muere de
golpe; el apagado ordenado (`SIGTERM`/`SIGINT` en `server.ts`) vuelca antes de
salir, con un tope de 5 s. Un volcado que falla devuelve sus entradas al
acumulador y se reintenta en el siguiente. Si el acumulador pasa de 5 000
entradas entre dos volcados, se vuelca antes.

## Cuánto se guarda

Índice TTL sobre `ultimaActividad`: cada fila se borra sola **400 días**
después de la última actividad de ese día (`DIAS_DE_RETENCION`). Da para
comparar un semestre con el mismo del año anterior, y nada justifica guardarlo
indefinidamente. Borrar lo de una persona que lo pida es
`db.uso_diario.deleteMany({ userId })`.

## Quién lo ve

`GET /api/v1/uso/resumen`, `/uso/ranking` y `/uso/export.xlsx` son **solo
ADMIN**, por la misma razón que la auditoría: es información sobre el personal,
y abrirla a coordinación la convertiría en una forma de vigilar a los docentes.

- `resumen?desde&hasta&institutionId&rol&page&limit`: activos hoy / 7 / 30 días
  (los siete y treinta días que terminan hoy), activos por día con los días
  vacíos en cero, totales por cliente y por rol, y una página del ranking.
  Sin fechas, los 30 días que terminan hoy; el rango máximo es de 400 días.
  `institutionId` acepta el slug o el `_id`, y uno desconocido es 404.
- `ranking`: lo mismo que la tabla, paginado con `items` en la raíz.
- `export.xlsx`: el ranking completo con el membrete de los reportes; cada
  celda sale por `agregarFila()`.

Escritorio: «Uso de la aplicación» (`/uso`, capacidad `usage.read`, grupo
Administración, visible en modo administración). Móvil: «Uso de la app» en
«Más», `roles: ['ADMIN']`, rama añadida al final de `rutasDeRama`.
