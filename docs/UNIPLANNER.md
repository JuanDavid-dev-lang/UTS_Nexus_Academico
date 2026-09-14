# Puente con UniPlanner

Cómo Nexus escribe en la app del estudiante, qué garantiza y qué no.

**UniPlanner** es el entorno personal del estudiante: su horario, sus notas
simuladas, su presupuesto, sus recordatorios. **Nexus** es la plataforma del
docente. Son dos aplicaciones con dueños distintos, y el puente entre ellas va
**hacia el estudiante**: Nexus escribe en su buzón. Lo único que vuelve es la
marca que deja al escanear el QR de asistencia de una clase, con una forma fija
que no admite nada más (§8).

La especificación conjunta vive en el otro repositorio
(`UniPlanner/docs/COLABORACION_NEXUS.md`); esto es la mitad de aquí.

---

## 1. Las tres reglas

1. **Informa, nunca aplica.** Un aviso de faltas abre la pantalla de asistencia
   del estudiante, pero **no le marca ninguna falta**. Una nota publicada se
   guarda en su simulador solo cuando él lo confirma. Cuáles fueron sus faltas
   y si alguna estaba justificada lo sabe él, no el aviso.
2. **El cliente dice a quién, el servidor decide qué.** Ninguna ruta acepta la
   nota, las faltas ni el horario en el cuerpo de la petición: se leen de la
   base con `computeAcademicRecords()`, la misma pipeline que alimenta el panel
   y el escáner de riesgo. Si el número pudiera venir del cliente, esto dejaría
   de ser «avisar de lo que hay» para ser «escribir un número en la app de otra
   persona».
3. **De UniPlanner solo sale una marca de asistencia, y con forma fija.** No hay
   ninguna ruta que traiga datos suyos, y esa ausencia sigue siendo la
   garantía: sus notas simuladas, su presupuesto, su bóveda de contraseñas y su
   disponibilidad personal no tienen por dónde llegar. La excepción es la marca
   del QR (§8): cuatro campos —`uid`, `qr`, `deviceId`, `createdAt`— que las
   reglas de allá no dejan ampliar, y que Nexus lee de Firestore sin exponer
   ninguna ruta nueva. Durante un tiempo la regla fue «nada vuelve»; se abrió a
   propósito para que el estudiante pueda marcar asistencia desde su app, y
   este párrafo es el sitio donde queda dicho hasta dónde.

---

## 2. Cómo se encuentra a un estudiante

UniPlanner guarda la vinculación de cada persona en un documento de Firestore
cuyo **nombre se deriva de (institución, código)**:

```
institution_links/uts__1098765432
  { uid, institutionId, studentCode, institutionName, linkedAt, verified }
```

Eso es lo que permite traducir una matrícula a una cuenta con **una lectura
directa**, sin consulta y sin servicio puente de por medio.

El precio es que `domains/uniplanner/link-id.ts` tiene que normalizar
**exactamente igual** que UniPlanner. Si no:

- **El código se normaliza** a mayúsculas y sin puntuación. `1.098.765.432` y
  `1098765432` son la misma matrícula escrita de dos maneras.
- **El separador es doble** (`__`). Con uno solo, `uts_bucaramanga` + `123` y
  `uts` + `bucaramanga_123` darían el mismo documento.

Si esto divergiera, el enlace existiría, sería válido, y Nexus lo buscaría con
otro nombre: **no llegaría ni un aviso y no habría ningún error**.
`tests/uniplanner-message.test.ts` repite los mismos casos que
`test/institucional/institutional_inbox_test.dart` en UniPlanner, y esa
duplicación es a propósito.

---

## 3. Cómo se escribe

`shared/uniplanner.ts` habla con la **API REST de Firestore**, no con
`firebase-admin`. Es el mismo camino que `shared/push.ts` con FCM: se firma la
aserción de la cuenta de servicio con `jsonwebtoken` —que ya está aquí por el
login—, se cambia por un access token en el endpoint OAuth de Google y se hace
la llamada. Arrastrar el SDK entero (y `google-auth-library` con él) para dos
peticiones no compensaba.

Un access token de cuenta de servicio **no pasa por las reglas de seguridad**
de Firestore: son para los SDK de cliente. Por eso Nexus puede escribir en un
buzón donde la propia app del estudiante tiene prohibido crear nada, que es
justo lo que hace del buzón un canal de la institución y no otro cuaderno más
de la app.

```
users/{uid}/institutional_inbox/{autoId}
  { type, source: 'nexus', institutionId, courseCode, courseName,
    teacherName, term, message, sentAt, expiresAt, payload }
```

Dos detalles que muerden:

- **`sentAt` es obligatorio.** El buzón se lee con `orderBy('sentAt')`, y
  Firestore **deja fuera de una consulta ordenada todo documento que no tenga
  ese campo**: un aviso sin él se escribe sin error y no lo ve nadie nunca. Lo
  pone el reloj de Nexus, que es el autor del mensaje.
- **Los `type` son literales permanentes.** Viajan en el documento y los lee
  una app que puede ser de hace seis meses. Un tipo que no conozca cae en
  `notice` y se enseña como aviso de texto; uno inventado pierde su acción sin
  fallar por ningún lado.
- **Una fecha de entrega se valida como día real, no solo con su forma.**
  `2026-02-31` cumple `yyyy-MM-dd` y `new Date` **no falla**: desborda al 3 de
  marzo. El recordatorio del estudiante vencería tres días tarde sin que nada
  fallara en ninguno de los dos lados. Lo comprueba `esFechaReal()`; la ruta
  responde 400 —que es el único momento en que hay a quién preguntarle— y el
  dominio omite la fecha si aun así le llegara.
- **Los tres avisos que reparten a una lista llevan `limiteLotes`**, como las
  demás rutas masivas del backend. Una llamada escribe hasta ochenta documentos
  y cada uno es una petición a Firestore de otro proyecto: con solo el cupo de
  escritura, una sesión podía disparar casi diez mil escrituras externas por
  cuarto de hora. El tope por petición acota lo que cabe en una; el de lotes,
  cuántas caben en una ventana.

---

## 4. Qué se puede mandar

| Tipo | Ruta | Quién | Qué lleva |
| :--- | :--- | :--- | :--- |
| `attendance_alert` | `POST /uniplanner/avisos/inasistencia` | ADMIN, PROFESSOR, COORDINATOR | Faltas acumuladas y cupo |
| `grade_published` | `POST /uniplanner/avisos/nota` | ADMIN, PROFESSOR, COORDINATOR | Nota del corte y **su escala** |
| `course_load` | `POST /uniplanner/avisos/carga` | ADMIN, COORDINATOR | Materias, grupos y horario |
| `assignment` | `POST /uniplanner/avisos/entrega` | ADMIN, PROFESSOR, COORDINATOR | Título y fecha límite |

`GET /uniplanner/estado` dice si el canal está encendido —la UI no pinta nada
si no lo está— y `GET /uniplanner/enlaces` trae, de una sola lectura, quién de
una materia tiene la app y en qué color está su semáforo.

**El horario no lo manda un docente** y no es un descuido: es institucional, y
un docente solo ve su propia materia, así que su envío describiría un semestre
de una asignatura.

**La escala viaja siempre** aunque en la UTS sea 5.0. Quien lo recibe puede
tener configurada otra, y sin ese número un 4.3 se guardaría tal cual sobre una
escala de 100 — destrozando el promedio que lleva calculando todo el semestre.

---

## 5. El semáforo

Sale del **porcentaje ponderado por minutos**, que es la regla académica de la
casa: una clase de tres horas no cuenta lo mismo que una de hora y media. Con
el umbral en 70 %, el cupo de faltas es el 30 % restante.

| Color | Cupo gastado | Asistencia |
| :--- | :--- | :--- |
| Verde | < 50 % | > 85 % |
| Amarillo | 50 – 80 % | 76 – 85 % |
| Rojo | > 80 % | < 76 % |

**Lo calcula el servidor**, no la lista de clase. Es la misma cifra que decide
a quién alcanza el envío masivo, y con dos cuentas —una para pintar y otra para
enviar— la lista enseñaría a alguien en verde al que el botón de «avisar a los
que están en riesgo» sí le escribe.

Los números que viajan en el aviso (`absences`, `maxAllowed`) van **en clases**
y no en minutos, porque es lo que el estudiante cuenta y lo que su app va a
pintar. Cuando las clases duran lo mismo —el caso normal— las dos cuentas
coinciden; cuando no, el texto del aviso lleva el porcentaje real, que es el
que manda.

---

## 6. Configuración

Tres credenciales y un interruptor en `backend/.env`. **Sin las credenciales el
canal queda apagado** y se anota en el log: la lista de clase sigue funcionando
y lo que desaparece es la insignia y el botón. Es la misma degradación
silenciosa y a propósito que el push y el correo.

```
UNIPLANNER_PROJECT_ID=uniplanner-xxxxx
UNIPLANNER_CLIENT_EMAIL=...@...iam.gserviceaccount.com
UNIPLANNER_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
UNIPLANNER_SOLO_VERIFICADOS=0
```

La cuenta de servicio es **del proyecto de UniPlanner**, no de este, y necesita
lectura y escritura en Firestore (`roles/datastore.user`). No hace falta más:
el puente no toca autenticación, ni Storage, ni ninguna otra colección.

### Cómo se ponen las credenciales

```bash
cd backend
npm run configurar:uniplanner -- ~/Descargas/uniplanner-xxxx.json
npm run check:env
```

El script lee el JSON de la cuenta de servicio y escribe las tres variables en
`backend/.env`, **sin imprimir la clave**. Existe por una razón concreta: la
clave privada lleva saltos de línea y en un `.env` tienen que ir escapados como
`\n` y entre comillas. Pegarla a mano es el error habitual, y su síntoma no es
un fallo al arrancar: es una firma que Google rechaza, una línea en el log que
nadie mira y un canal que no manda nada.

Cuando termines, **borra el JSON descargado**: es una credencial con acceso de
escritura a la base de datos de la app del estudiante.

### En producción

`deploy/docker-compose.yml` pasa las variables en una **lista explícita**: lo
que no esté ahí no llega al contenedor por mucho que viva en `deploy/.env`. Las
cuatro ya están declaradas, con valor por defecto vacío —son opcionales de
verdad—, así que basta con añadirlas a `deploy/.env`. Si algún día se añade otra
variable del puente, hay que declararla también ahí: olvidarlo no rompe el
arranque, solo deja el canal apagado en producción y encendido en local.

### La clave de cada universidad no es configuración

Sale de `Institucion.institutionId`, el slug que ADMIN crea desde «Perfiles
institucionales» y que ese modelo ya declara como «el identificador que otros
sistemas (UniPlanner) usarán». En una variable de entorno el despliegue entero
quedaría atado a una sola universidad, y este backend sirve a varias.

Se resuelve en cada envío por el camino **materia → docente que la dicta → su
perfil institucional**. Si no se puede resolver, no se manda nada y el
destinatario vuelve con `sin-institucion`: con la clave equivocada el enlace no
se encuentra, y un envío que parece hecho y no llegó a ningún sitio es peor que
uno que no se intentó.

**La forma del slug la fija el catálogo, no este puente.** Admite guion además
de guion bajo (`unab-2`, cuando dos universidades comparten sigla) y llega a 40
caracteres. `domains/uniplanner/link-id.ts` acepta exactamente eso, y
`tests/uniplanner-message.test.ts` comprueba que **todo id que genera el panel
pasa la validación de UniPlanner** — con patrones incompatibles, esa segunda
universidad no habría podido enlazar una sola cuenta, sin ningún error.

---

## 7. Lo que este puente no resuelve

- **La verificación automática comprueba datos, no identidad.** El estudiante
  se enlaza con su universidad, su número de documento y su nombre completo, y
  Nexus verifica solo el enlace cuando los tres casan con un estudiante
  registrado (§8, «Verificación automática»). Eso deja fuera el documento mal
  escrito, el inventado y el de otra universidad, pero **no** a quien conozca el
  nombre completo y el documento de un compañero: puede escribirlos y el enlace
  se verifica. Contra eso quedan las otras capas —un enlace por cuenta, el
  vínculo del semestre (`CUENTA_CAMBIADA`), un teléfono por cuenta y clase, y la
  vista previa con el nombre antes de confirmar—, y la revisión manual de
  «Vínculos UniPlanner» para las excepciones. Una prueba de identidad de verdad
  sería casar el **correo institucional** de la cuenta de UniPlanner con
  `StudentModel.email`: no se hace porque el enlace no lleva el correo, y
  llevarlo es una decisión de producto de las dos partes.

  `UNIPLANNER_SOLO_VERIFICADOS=1` limita avisos **y** marcas de QR a los
  enlaces verificados. Con la verificación automática ya es viable encenderlo:
  un estudiante matriculado que se enlazó con su nombre completo queda
  verificado en un minuto. Los enlaces anteriores no tienen nombre y la app le
  pide a cada persona que lo añada; hasta que lo hagan, encenderlo los deja sin
  avisos y sin poder marcar.

- **No hay reintento.** Un aviso que falla por red se anota en el resultado y no
  se vuelve a intentar. Con un envío por corte y por materia, una cola de
  reintentos sería más máquina que problema; si algún día se manda a diario,
  hará falta.

- **Nadie borra los avisos caducados.** `expiresAt` los saca del buzón a la
  vista del estudiante; el documento se queda en Firestore. Un semestre son
  unos pocos por materia. A los tres años lo será, y el borrado toca aquí, que
  es quien los escribe.

- **El móvil (`flutter_app/`) no tiene esta función.** El puente está en el
  backend y la interfaz solo en el escritorio, que es donde se pasa lista con
  la lista delante. Tampoco la pantalla del QR de asistencia: se proyecta desde
  el escritorio.

---

## 8. Asistencia por QR

El docente proyecta un QR desde la pantalla de asistencia del escritorio; el
estudiante lo escanea con UniPlanner, **ve sus datos como los tiene la
universidad y confirma**. La lista de siempre sigue ahí: quien no tiene la app
se marca a mano, y cualquier marca se corrige igual que antes.

### Cómo viaja una marca

```
Escritorio            Nexus (backend)                 Firestore (UniPlanner)          UniPlanner
──────────            ───────────────                 ──────────────────────          ──────────
Pasar lista con QR ─► abre la sesión, lee los
                      enlaces de los matriculados ──► attendance_sessions/{id}
                                                      { open: true, closesAt, … }
QR (cambia cada 15 s) ◄─ GET …/qr (firma el servidor)
                                                                                ◄──── escanea
                                                      …/checkins/{uid}  ◄───────────── crea la marca
                      cada 3 s: marcas nuevas ◄────── { uid, qr, deviceId, createdAt }
                      decide (qr-session.ts)
                      ├ no vale ───────────────────► { status: rejected, reason } ─► motivo + arreglo
                      ├ ya presente hoy ───────────► { status: accepted,
                      │                                reason: YA_REGISTRADA }    ─► «ya estabas»
                      └ vale: NO escribe todavía ──► { stage: preview,
                                                       preview: nombre, documento
                                                       tapado, materia, grupo… }  ─► «¿eres tú?»
                                                                                ◄──── Confirmar
                      cada 3 s: confirmaciones ◄──── { confirmedAt }
                      escribe `asistencias` (QR)
                      contesta ────────────────────► { status: accepted }         ─► «registrada»
                      fija el enlace (semestre) ───► institution_links/{…}.lockedUntil
Cerrar lista ───────► sin confirmar → SIN_CONFIRMAR
                      ausentes a quien no marcó ───► attendance_sessions/{id}.open = false
```

**Confirmar no hace vencer el QR.** La vigencia se mide con `createdAt` —la hora
en que se escaneó, sellada por Firestore—, así que la persona puede leer su
vista previa con calma. Lo único que se exige al confirmar es que la lista siga
abierta (`confirmacionValida`).

**Una clase se registra una vez por día.** Si el estudiante ya tiene asistencia
presente de esa materia ese día —de esta lista, de otra que el docente abrió
después, o marcada a mano—, se le contesta `YA_REGISTRADA` sin vista previa y
sin escribir nada. Quien estaba *ausente* sí puede quedar presente en una
segunda lista: llegó tarde.

**No hay ninguna ruta de Nexus para el estudiante.** Su marca entra por
Firestore, donde las reglas de UniPlanner la atan a su cuenta, y la lee el
servidor con la cuenta de servicio que ya usaba para los avisos. Eso deja fuera
tres cosas que una llamada HTTP directa habría traído: Nexus no tiene que ser
accesible desde los datos móviles de cada estudiante, el QR no lleva ninguna
dirección a la que un QR falso pudiera desviar a la app, y **ninguna credencial
de UniPlanner cruza a Nexus**. El token de Firebase de un estudiante abre todo su
Firestore durante una hora; no tiene por qué salir de su teléfono.

### Quién es el estudiante

**La identidad no la dice el teléfono.** La marca solo lleva el QR. Al abrir la
sesión, Nexus calcula el enlace de cada matriculado —el mismo `idDeEnlace()` de
la lista de clase— y los lee de una vez: queda un mapa `uid → estudiante`. La
marca se resuelve con el `uid` de la cuenta que la creó, que las reglas obligan a
que sea el nombre del documento y el de quien la escribe.

Un estudiante está en varias materias y tiene **un solo enlace**: aparece en el
mapa de cada una de sus clases y en el de ninguna más. Escanear el QR de una
materia en la que no está matriculado se rechaza como `NO_MATRICULADO`.

Quien instala UniPlanner en plena clase también puede marcar: si llega una
cuenta que el mapa no conoce, se vuelve a leer a los matriculados que no tenían
enlace antes de rechazarla.

### Qué se comprueba (`domains/attendance/qr-session.ts`)

| Intento | Qué lo para | Motivo |
| :--- | :--- | :--- |
| Generar el QR en casa (materia, grupo y hora son predecibles) | Firma HMAC con un secreto de la sesión que nunca sale del servidor | `QR_INVALIDO` |
| Mandar una foto del QR a alguien que no está | El QR cambia cada 15 s; vale su ventana y la vecina, medidas con la hora de Firestore | `QR_VENCIDO` |
| Escanear fuera de hora | La marca tiene que caer entre la apertura y el cierre | `SESION_CERRADA` |
| El QR de otra clase | La sesión del QR tiene que ser la de la marca | `QR_DE_OTRA_CLASE` |
| Una cuenta que no es de ningún matriculado | El mapa `uid → estudiante` | `NO_MATRICULADO` |
| Una cuenta enlazada a dos estudiantes del grupo | Se rechaza por los dos | `CUENTA_CON_VARIOS_ENLACES` |
| Un teléfono marcando por dos cuentas | Un `deviceId` por sesión | `DISPOSITIVO_REPETIDO` |
| Marcar dos veces en la misma clase | Una marca por cuenta: el id del documento es el `uid` | — |
| Marcar otra vez ese día (otra lista, o ya marcado a mano) | Asistencia presente de esa materia en ese día | `YA_REGISTRADA` (no es un rechazo) |
| Marcar a nombre de otro con un enlace ajeno | La vista previa enseña el nombre que tiene la universidad | — |
| Borrar el perfil en UniPlanner, recrearlo y enlazarse al código de un compañero (o marcar desde una cuenta nueva) | El **vínculo del semestre** en Nexus: la primera asistencia confirmada ata cuenta y estudiante hasta que acaba el periodo o la institución lo suelta | `CUENTA_CAMBIADA` |
| Confirmar desde el teléfono cuando el docente ya lo marcó ausente a mano durante la lista | Un registro manual de ese día escrito después de abrir la sesión manda | `DECIDIDA_POR_DOCENTE` |
| Probar QR a ciegas | `MAX_INTENTOS` (5) por cuenta y clase; pasado el tope se contesta una vez | `DEMASIADOS_INTENTOS` |
| Escanear y no confirmar | Al cerrar, no queda presente y se le dice | `SIN_CONFIRMAR` |

**Lo que no se puede parar:** un compañero que escanea en vivo por
videollamada. Ningún QR prueba presencia física. El docente ve el recuento
mientras mira el salón, y cualquier marca se corrige a mano.

### Qué escribe

- **Al escanear no se escribe nada.** Solo la vista previa en la marca, que ve
  únicamente la persona.
- **Al confirmar:** `present: true`, `origen: 'QR'`. Si el docente ya había
  anotado algo de ese día —un retraso, una observación—, se conserva: solo se
  tocan esos dos campos. `lateMinutes` **no se deduce** de la hora del escaneo,
  que dice cuándo se apuntó la cámara y no cuándo llegó la persona.
- **Al cerrar** (el docente o el reloj), las marcas sin confirmar pasan a
  `SIN_CONFIRMAR` y, si la sesión se abrió con «marcar ausentes»,
  `present: false` a quien no confirmó **y no tenía marca de ese día**. Es un
  `$setOnInsert`: lo que el docente marcó a mano no se pisa.
- **Con el periodo en cierre** no se escribe nada más: la sesión se cierra sola
  sin marcar ausentes.
- La fecha es la canónica de la clase (`domains/attendance/class-date.ts`), la
  misma que usan las demás rutas, así que una corrección a mano del mismo día
  cae en el mismo documento.

### El vínculo del semestre (`vinculos_qr_semestre`)

`lockedUntil` lo hacen valer las reglas de otra aplicación, y esas reglas
permiten borrar el enlace fijo **en el mismo lote que borra el perfil** —quien
se da de baja se lleva su código—. Como el perfil se puede volver a crear, eso
dejaba una cuenta libre de enlazarse al código de un compañero y marcar por él.
Por eso Nexus guarda aparte, en `vinculos_qr_semestre` (`QrBindingModel`), qué
cuenta marcó por qué estudiante en cada periodo: la primera asistencia
confirmada lo escribe, dos índices únicos garantizan una cuenta por estudiante
y un estudiante por cuenta, y cualquier marca que lo contradiga se rechaza como
`CUENTA_CAMBIADA` —la cuenta que marcó por Ana no marca por Beto, y Ana no marca
desde una cuenta nueva—, recreen lo que recreen en Firestore. Lo suelta la
institución al **desbloquear** o **liberar** desde «Vínculos UniPlanner»; el
estudiante lo pide desde su app aunque su enlace no esté bloqueado.

### El enlace queda fijo el semestre

Al aceptar una marca, Nexus escribe `lockedUntil` en el documento de enlace:
**hasta el último día del semestre de esa clase**. Mientras no pase, las reglas
de UniPlanner no dejan borrar el enlace. Es lo que impide «pongo el documento de
mi amigo, marco por él y vuelvo al mío»: quien marca con un documento se queda
con él todo el semestre, y en vacaciones —sin clases que marcar— puede
cambiarlo si lo necesita.

El último día sale, por orden:

1. **`AcademicPeriod.endsOn`**, que la administración pone en la pantalla de
   Periodos del escritorio (`PATCH /periods/:period`) copiándolo del acuerdo del
   Consejo Académico: el día de las notas de habilitación.
2. Si no hay, **la fecha por defecto** de `domains/periods/period-calendar.ts`:
   30 de junio para el primer semestre y 20 de diciembre para el segundo. Cubren
   el calendario de la UTS con margen —en 2026 las notas de habilitación
   cerraron el 26 de junio (Acuerdo 03-052) y cierran el 17 de diciembre
   (Acuerdo 03-024)—, pero no el de todas: la Nacional estiró su primer
   semestre de 2026 hasta el 25 de julio. Por eso cada institución debería poner
   la suya.
3. Si ese día ya pasó —una clase después del cierre— o el periodo no tiene
   calendario (`-3`, `-4`), **30 días** desde la marca: marcar con un código
   tiene que atarlo a él un tiempo, sea cuando sea.

Se escribe **una vez por estudiante y semestre**: el fin es el mismo para todas
sus clases, y un bloqueo que ya llega hasta esa fecha no se reescribe ni se
acorta.

### Quién gestiona el enlace

**La institución, no el docente.** El enlace es de la persona con su
universidad: se crea una vez y le sirve para todas sus materias, así que
confirmarlo materia por materia no tendría sentido. Lo gestionan ADMIN y
coordinación desde la pantalla **«Vínculos UniPlanner»** del escritorio
(`modules/uniplanner/vinculos.service.ts`); secretaría la consulta.

| Acción | Qué hace | Ruta |
| :--- | :--- | :--- |
| Verificar / retirar | `verified` y `verifiedAt` en el enlace | `POST /uniplanner/vinculos/:linkId/acciones` `{accion: 'verificar' \| 'desverificar'}` |
| Quitar bloqueo | **Borra** `lockedUntil` (no lo deja en `null`, que las reglas leerían como imborrable) y suelta el vínculo del semestre: el estudiante puede cambiarlo | `{accion: 'desbloquear'}` |
| Liberar documento | Borra el enlace, sea de quien sea, y suelta el vínculo del semestre de esa cuenta y ese estudiante | `{accion: 'liberar'}` |
| Listar y buscar | Enlaces de la universidad por páginas, o búsqueda por documento o nombre (sale también quien no tiene UniPlanner) | `GET /uniplanner/vinculos?institucion=&filtro=&q=` |

**Alcance.** ADMIN elige la universidad; coordinación y secretaría ven la suya
(`req.alcance.institutionId`) y solo los estudiantes de su alcance —sus
programas, si tiene—. Un enlace cuyo código no es de un estudiante de su alcance
no se le enseña: no puede saber de qué carrera es. Fuera del alcance es un 404.

### Verificación automática (`verificacion.service.ts`)

El enlace lleva tres datos: universidad, **número de documento** (solo dígitos)
y **nombre completo** (solo letras, en mayúsculas, como lo guarda Nexus). Nexus
lo verifica solo cuando casan con un estudiante registrado: ese documento,
matriculado en esa universidad (por la institución del docente de alguna de sus
materias) y con ese nombre. Lo que decide es puro
(`domains/uniplanner/link-verification.ts`, con pruebas):

- **Nombre completo, en cualquier orden y sin tildes ni mayúsculas.** La
  universidad guarda primero los apellidos (`PÉREZ GÓMEZ JUAN CARLOS`) y la
  persona escribe primero los nombres; la ñ vale como n. Pero **todas** las
  palabras: aceptar «Juan Pérez» sería bastar con lo que sabe cualquiera del
  salón.
- **Un solo estado para «no coincide»** (`not_matched`): el nombre no casa, el
  documento no existe o es de otra universidad. Distinguirlos le diría a quien
  prueba documentos cuáles son de estudiantes de verdad. **La institución sí ve
  el motivo** (`motivoSinCoincidencia`: `sin_estudiante`, `sin_matricula`,
  `otra_universidad`, `nombre_distinto`), en «Vínculos UniPlanner» y en la
  auditoría de cada pasada; nunca viaja a Firestore.
- **Nunca desverifica.** Un enlace verificado a mano sigue verificado aunque la
  comprobación automática no case.

Dos entradas. El scheduler (`startUniplannerLinkVerifier`, cada minuto) lee
**solo lo nuevo**: UniPlanner sella `verificationRequestedAt` con la hora del
servidor al enlazar y al corregir el nombre, y Nexus guarda un cursor sobre ese
campo (`ConfigModel`, `uniplanner_verificacion_cursor`). Y al matricular (una o
en lote, `enrollment.routes.ts`), al importar fichas (`POST /students/bulk`) y al
corregir el nombre en la ficha (`PATCH /students/:id`) se vuelven a comprobar
los enlaces de esos estudiantes: quien se enlazó antes de que su docente cargara
el curso, o con un nombre que la ficha tenía mal, pasa a verificado en ese
momento. Nexus escribe `verified`, `verifiedAt`, `verificationStatus` y
`verificationCheckedAt`; la app solo los lee, **en vivo** (escucha el documento
del enlace), así que el cambio aparece sin salir de la pantalla.

**La universidad sale de la matrícula.** Un estudiante registrado en Nexus sin
matricular en ninguna materia no pertenece todavía a ninguna universidad, y su
enlace queda `not_matched` hasta que lo matriculan. Es lo que vio la primera
prueba real (septiembre de 2026): una ficha creada a mano, sin matrícula.

**Aviso de verificado.** Al pasar a verificado —solo o a mano desde «Vínculos»—
Nexus le escribe un aviso `notice` en su buzón (`avisoDeEnlaceVerificado`,
`domains/uniplanner/message.ts`): la verificación puede llegar horas después de
enlazarse, cuando la persona ya no está mirando. Va con id fijo por enlace
(`enlace-verificado-<linkId>`, `?documentId=` en la escritura y un 409 cuenta
como enviado), porque el cursor y una matrícula pueden verificar el mismo enlace
a la vez. Aparece en el centro de notificaciones de UniPlanner; como el resto de
avisos de Nexus, no hay push al teléfono con la app cerrada.

**Si Nexus no contesta.** Pasados diez minutos sin respuesta la app deja de
decir «Verificando…» y dice «Pendiente»: la comprobación tarda menos de un
minuto, así que diez sin respuesta es que el puente no está funcionando. Fue lo
que pasó en producción hasta configurar `UNIPLANNER_*` en `deploy/.env`: el
backend corría sin credenciales, el puente era un no-op declarado en el log y la
tarjeta prometía una comprobación que nadie estaba haciendo.

**Revisión manual.** Sigue en «Vínculos UniPlanner» para las excepciones —un
nombre que la universidad tiene mal escrito, un cambio de cuenta—: la pantalla
enseña si un enlace se verificó solo, a mano o si no coincide, y **por qué no
coincide** en una línea bajo el nombre: sin estudiante con ese documento, sin
matrícula (se arregla matriculándolo; el enlace se verifica solo), de otra
universidad, o el nombre que escribió la persona frente al de la ficha. Sin el
motivo, un «no coincide» por falta de matrícula parecía un nombre mal escrito.

### Solicitudes del estudiante

Desde la pantalla del enlace de UniPlanner, el estudiante puede pedir a su
universidad que revise su enlace (`link_requests/{uid}`, una por cuenta):

- `unlock` — se equivocó de documento o cambió de cuenta, y el enlace está fijo
  el semestre (o su asistencia sale como `CUENTA_CAMBIADA`).
- `claimed` — su documento lo tiene otra cuenta y no puede enlazarse.

En «Vínculos UniPlanner» → Solicitudes se resuelven (`GET /uniplanner/solicitudes`,
`POST /uniplanner/solicitudes/:uid/resolucion`): **desbloquear** o **liberar**
solo si el enlace es de quien lo pide —quitarle el bloqueo al de otra cuenta le
dejaría cambiarlo a esa otra persona—; si el documento lo tiene otra cuenta,
**asignar**; o **rechazar** con una nota.

**Asignar no borra el enlace: lo reescribe con la cuenta de quien lo pidió, ya
verificado y sin bloqueo** (`asignarEnlace`). El documento de identidad es único
y la institución acaba de comprobar de quién es; liberarlo borrándolo dejaba una
carrera en la que la cuenta anterior —que seguía apuntándolo en su perfil— lo
volvía a reclamar antes que su dueño, que había recibido «ya puedes enlazarte».
Escrito con la cuenta del dueño, las reglas solo dejan tocarlo a él, y al volver
a enlazarse desde su app el lote actualiza ese documento en vez de crearlo. La
respuesta se escribe en la propia solicitud y el estudiante la ve en su app.
Resolver desde la lista de estudiantes también cierra la solicitud pendiente de
ese enlace, para no contestarle dos veces.

El scheduler (`startUniplannerRequestWatcher`, cada 5 min, solo con el puente
configurado) avisa de cada solicitud nueva a ADMIN y a la coordinación de esa
universidad, con `dedupeKey` por solicitud: una pendiente no se avisa dos
veces.

### El contrato en Firestore

| Documento | Quién escribe | Campos |
| :--- | :--- | :--- |
| `attendance_sessions/{sesion}` | Nexus | `source: 'nexus'`, `institutionId`, `courseCode`, `courseName`, `group`, `teacherName`, `term`, `startsAt`, `closesAt`, `open`, `closedAt` |
| `attendance_sessions/{sesion}/checkins/{uid}` | UniPlanner crea | `uid`, `qr` (≤ 256), `deviceId` (≤ 64), `createdAt` (= `request.time`) |
| — mismo documento — | Nexus, vista previa | `stage: 'preview'`, `preview` { `studentName`, `studentDocument` (tapado salvo los 4 últimos), `courseName`, `courseCode`, `group`, `startTime`, `teacherName` }, `previewAt` |
| — mismo documento — | UniPlanner confirma | `confirmedAt` (= `request.time`), y nada más |
| — mismo documento — | Nexus contesta | `stage: 'done'`, `status` (`accepted` · `rejected`), `reason` (el código de la tabla, o `YA_REGISTRADA`), `message` (en español, por si la app no conoce el código), `processedAt` |
| `institution_links/{id}` | Nexus fija | `lockedUntil` |

El QR es texto plano, solo ASCII: `UNX1|<sesión>|<ventana>|<código materia>|<grupo>|<HH:mm>|<firma>`.
UniPlanner no puede validar la firma —no tiene el secreto— y no debe
intentarlo: lo lee para enseñar «Vas a marcar MAT101 · A194 · 10:00» y buscar el
curso por `courseCode`, y lo reenvía tal cual.

Nexus lee `checkins` dos veces por pasada: ordenado por `createdAt` desde la
última marca nueva que vio, y por `confirmedAt` desde la última confirmación.
Son dos consultas porque confirmar es editar un documento viejo, y una consulta
por fecha de creación no vuelve a verlo. Cada una filtra y ordena por el mismo
campo de una subcolección, así que basta el índice de campo único que Firestore
crea solo: **no hay que declarar ningún índice compuesto en el proyecto de
UniPlanner**.

### Lo que hace UniPlanner

Está hecho en su repositorio (`lib/features/institucional/`); el detalle vive en
su `docs/COLABORACION_NEXUS.md`. Lo que importa desde aquí:

- **Reglas** (`firestore.rules`), probadas contra el emulador:
  - `attendance_sessions/{id}`: lectura por id, nunca como listado; ninguna
    escritura desde la app.
  - `checkins/{uid}`: crear solo con los cuatro campos, `uid` igual al id del
    documento y a quien escribe, `createdAt == request.time`, y la sesión
    abierta y antes de `closesAt`. Editar, **solo** para añadir `confirmedAt`
    con la hora del servidor sobre una vista previa sin contestar y con la lista
    abierta. Borrar, solo una rechazada o una vista previa sin confirmar (para
    volver a escanear).
  - `institution_links`: `lockedUntil` fuera del alcance de la app; un enlace
    fijo no se borra salvo en el mismo lote que borra la cuenta; **un enlace
    por cuenta** —se crea en el mismo lote que lo apunta en el perfil, y el
    perfil solo cambia de enlace si el anterior ya no es de esta cuenta—.
- **Acceso rápido** en la cabecera del inicio, junto a la campana, solo con
  enlace y en un teléfono o tableta.
- **El escáner registra en dos pasos**: escanear deja la marca, la vista previa
  enseña los datos y «Confirmar» la registra. «No soy yo o no es mi clase»
  retira la marca. Sin conexión no se encola nada: falla a la vista.
- **Cada motivo tiene su arreglo**: `NO_MATRICULADO` y `CUENTA_CAMBIADA` llevan
  a revisar el enlace (y a pedir revisión a la universidad); `QR_VENCIDO`
  ofrece volver a escanear (Nexus acepta hasta `MAX_INTENTOS`). Un código que
  la app no conoce enseña el texto que manda Nexus.
- **Anotar en el seguimiento** personal es un botón que la persona pulsa; la
  app no lo hace sola.

Para que los dos lados no diverjan sin avisar, el QR de referencia de
`tests/qr-session.test.ts` («contrato con UniPlanner») está copiado literal en
`test/institucional/attendance_checkin_test.dart` de allí.

### Coste

Mientras hay una sesión abierta, dos consultas a Firestore cada 3 s: unas 600
lecturas por clase de 15 minutos, más un par por marca. **Sin sesiones abiertas no
se llama a Firestore**, y a la base solo se va una vez por minuto a buscar
sesiones que otra instancia haya abierto —y a reintentar el cierre en Firestore
de las que se cerraron aquí sin poder cerrarlas allá—. El lector atiende hasta
ocho sesiones a la vez: en serie, sesenta clases a las siete tardaban más de una
pasada. El bloqueo del enlace es una escritura por estudiante y semestre.

### Una lista por grupo, y el grupo se pide siempre

En la UTS una materia (`PIS701`) tiene varios grupos (`A194`, `A193`, `B212`),
cada uno con sus estudiantes, su horario y a veces su docente. **El QR es de un
grupo** y `groupId` es obligatorio al abrir (`POST /asistencia-qr/sesiones`),
aunque la materia tenga uno solo: la etiqueta del grupo viaja en el QR y es lo
que el estudiante ve al confirmar, así que el docente la elige en el diálogo en
vez de recibirla por defecto. Solo entran los matriculados de ese grupo y de ese
docente (`Matricula.professorId`), y al cerrar solo ellos quedan ausentes. Un
índice único parcial (`subjectId`, `groupId`, `teacherId` con
`estado: 'ABIERTA'`) cierra la carrera del doble clic sin impedir que la lista
de A193 se abra mientras la de A194 sigue abierta.

### Probarlo

`npm run test:e2e:qr` recorre el servicio real sobre un `mongod` local con
Firestore simulado dentro del proceso: alcance, la vista previa con los datos
del estudiante, confirmar, cada motivo de rechazo, el reintento, el bloqueo,
que una pasada vacía no escriba nada, «ya registrada» en una segunda lista del
mismo día, un estudiante en dos materias, el cierre con ausentes y marcas sin
confirmar sin pisar lo manual, el vencimiento automático y el periodo en
cierre, dos aperturas a la vez, la cuenta recreada que intenta marcar por otro
(`CUENTA_CAMBIADA`) y el desbloqueo que la suelta, y la ausencia puesta a mano
durante la lista que la confirmación no deshace. Las decisiones puras están en
`tests/qr-session.test.ts`; las reglas de UniPlanner se prueban allí.

