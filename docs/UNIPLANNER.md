# Puente con UniPlanner

Cómo Nexus escribe en la app del estudiante, qué garantiza y qué no.

**UniPlanner** es el entorno personal del estudiante: su horario, sus notas
simuladas, su presupuesto, sus recordatorios. **Nexus** es la plataforma del
docente. Son dos aplicaciones con dueños distintos, y el puente entre ellas va
en **una sola dirección**: Nexus escribe en el buzón del estudiante, y nada
vuelve.

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
3. **Nada sale de UniPlanner hacia aquí.** No hay ninguna ruta que traiga datos
   suyos, y esa ausencia es la garantía: sus notas simuladas, su presupuesto,
   su bóveda de contraseñas y su disponibilidad personal no tienen por dónde
   llegar.

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

- **Nadie verifica las matrículas, y de ahí sale el riesgo real.** El nombre
  del documento de enlace es calculable —que es justo lo que evita montar un
  servicio puente—, así que cualquier cuenta de UniPlanner con el correo
  confirmado puede reclamar el código de otra persona y **recibir sus avisos**.
  Las reglas de allá suben el precio (correo verificado, forma estricta del
  código, un rechazo por cada código ya reclamado) pero no lo impiden: no hay
  forma de que una regla sepa si una matrícula es tuya.

  `UNIPLANNER_SOLO_VERIFICADOS=1` existe para el día que haya un proceso de
  verificación. Hoy nadie confirma ninguno, así que encenderlo deja el canal
  mudo. Mientras tanto la lista de clase **distingue** un enlace confirmado de
  uno sin confirmar, para que la decisión de mandar sea informada.

  La verificación tendría que salir de aquí, que es quien tiene la lista
  oficial. La opción más sólida es casar el **correo institucional**: Nexus lo
  tiene en `StudentModel.email`, pero el documento de enlace no lleva el correo
  de la cuenta a propósito —UniPlanner promete que solo viaja institución y
  código—. Cerrar esto es una decisión de producto de las dos partes, no un
  cambio de código de una.

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
  la lista delante.
