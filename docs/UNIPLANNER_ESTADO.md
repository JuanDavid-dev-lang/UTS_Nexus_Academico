# Integración UniPlanner ↔ Nexus — estado

> **Qué es este documento.** Mide lo construido contra lo que pide la
> *Propuesta de Vinculación Docente* de UniPlanner (Johan Blanco,
> `johanblancoac@gmail.com`). No mide «el módulo de UniPlanner» en abstracto:
> mide **la propuesta**, capacidad por capacidad, para poder responderla con un
> número y una lista.
>
> Fecha del corte: 7 de septiembre de 2026. Repositorio en `0e2174c`+.
> Toda afirmación lleva su `archivo:línea`; lo que no se pudo verificar está
> marcado como tal.

---

## 1. El número

**La integración está al 62 %.**

No es una media de funciones: es una ponderación por lo que la propuesta pide y
por lo que cuesta. Va explícita para que se pueda discutir el reparto y no solo
el resultado.

| Bloque | Peso | Hecho | Aporta |
|---|---:|---:|---:|
| **El canal** — transporte, credenciales, enlace estudiante↔Nexus, configuración | 25 % | 100 % | 25,0 |
| **1. Alerta de inasistencias en 1 clic** *(el núcleo de la propuesta)* | 30 % | 85 % | 25,5 |
| **2. Calendario de entregas y parciales** | 15 % | 40 % | 6,0 |
| **3. Publicación de calificaciones de corte** | 15 % | 40 % | 6,0 |
| **4. Avisos de cambio de aula** | 5 % | 0 % | 0,0 |
| **Verificación de la matrícula** *(bloquea salir a producción)* | 10 % | 0 % | 0,0 |
| | **100 %** | | **62,5** |

Dicho en una frase: **lo difícil está hecho y lo que falta es superficie.** El
canal —autenticarse contra el proyecto de UniPlanner, encontrar al estudiante,
escribir en su buzón sin equivocarse de persona— funciona y tiene sus reglas
escritas. Lo que falta son botones que ya tienen su ruta detrás, y una decisión
de seguridad que nadie ha tomado todavía.

---

## 2. Capacidad por capacidad

### 2.1 Alerta preventiva de inasistencias en 1 clic — **85 %**

Es lo que la propuesta pone en el centro, y es lo único que está de punta a
punta: se puede usar hoy.

| Lo que pide la propuesta | Estado | Dónde |
|---|---|---|
| Semáforo automático de alumnos en umbral | **Hecho** (se calcula) | `uniplanner.service.ts:177-193` |
| Botón «Avisar por UniPlanner» en la pantalla de asistencia | **Hecho** | `attendance-page.tsx:404-424` |
| Aviso masivo a los que están en riesgo | **Hecho** | `attendance-page.tsx:269-289` |
| Confirmación antes de enviar, con la lista de a quién | **Hecho** | `notify-dialog.tsx:58-200` |
| Texto claro con la materia y el número de faltas | **Hecho** | `message.ts:124-149` |
| Constancia con fecha y hora | **Hecho** | `shared/uniplanner.ts:327` (`sentAt`) y auditoría en `uniplanner.service.ts:563-584` |
| Ruta del servidor | **Hecho** | `POST /uniplanner/avisos/inasistencia`, `uniplanner.routes.ts:100-116` |

**El 15 % que falta:**

- **El semáforo se calcula pero no se pinta.** El color por fila que se ve hoy
  sale del porcentaje de asistencia acumulada (`attendance-page.tsx:363-370`),
  no del `nivel` VERDE/AMARILLO/ROJO que devuelve el servidor. El `nivel` solo
  se usa para *filtrar* a quién incluye el botón masivo
  (`attendance-page.tsx:79-84`). Son dos números parecidos que no siempre
  coinciden, y el docente ve el que no manda.
- **El envío por umbral no lo usa nadie.** El servidor acepta «avisá a todos los
  que estén en AMARILLO o peor» (`uniplanner.service.ts:321-328`), pero el
  cliente siempre manda la lista explícita de estudiantes
  (`notify-dialog.tsx:81-87`). La rama existe y no la ejercita ningún cliente.

---

### 2.2 Calendario de entregas y parciales compartido — **40 %**

> *«Al fijar fechas de exámenes, talleres o entregas en Nexus, los estudiantes
> las reciben automáticamente en su lista de recordatorios.»*

| Pieza | Estado | Dónde |
|---|---|---|
| Ruta del servidor | **Hecha** | `POST /uniplanner/avisos/entrega`, `uniplanner.routes.ts:173-216` |
| Mensaje con título, fecha y hora | **Hecho** | `message.ts:311-338` |
| Rechazo de fechas imposibles (31 de febrero) | **Hecho y probado** | `uniplanner-message.test.ts:241-297` |
| Adaptador en el escritorio | **Hecho** | `uniplanner.repository.ts:44-64` |
| Hook de React | **Hecho** | `use-uniplanner.ts:79-99` |
| **Botón que lo llame** | **AUSENTE** | cero llamadores del hook |
| **Enganche automático al crear una actividad** | **AUSENTE** | nada en `modules/activities` llama a UniPlanner |

Falta lo que la propuesta llama *automáticamente*: hoy, aunque hubiera botón,
sería un envío manual y aparte. Lo que pide es que **crear la actividad en Nexus
dispare el aviso**, con la confirmación del docente.

---

### 2.3 Publicación ágil de calificaciones de corte — **40 %**

> *«Cuando usted termine de calificar y publique el corte, el alumno recibe un
> aviso formal con su nota.»*

Mismo patrón exacto que el anterior.

| Pieza | Estado | Dónde |
|---|---|---|
| Ruta del servidor | **Hecha** | `POST /uniplanner/avisos/nota`, `uniplanner.routes.ts:118-143` |
| La nota **sale de la base**, no del cliente | **Hecho** | `uniplanner.service.ts:369` sobre `computeAcademicRecords()` |
| Adaptador y hook en el escritorio | **Hechos** | `uniplanner.repository.ts:44-64`, `use-uniplanner.ts:79-99` |
| **Botón que lo llame** | **AUSENTE** | cero llamadores |
| **Enganche al cierre del corte** | **AUSENTE** | `modules/periods` no toca UniPlanner |

Que la nota salga del servidor y no del cuerpo de la petición no es un detalle:
es lo que impide que esto sea «escribir un número en la app de otra persona».
Ya está resuelto.

---

### 2.4 Avisos inmediatos de cambio de aula — **0 %**

> *«Si por fuerza mayor debe trasladar su clase a otra aula, un aviso urgente
> actualiza la tarjeta de clase en el teléfono de todo el grupo.»*

No existe: no hay tipo de aviso, ni ruta, ni mensaje. El tipo `notice` está
declarado (`message.ts:22`) pero **ninguna función lo produce**.

Hay un detalle que conviene saber antes de estimarlo: el aviso de carga
académica **se niega a inventar el aula** cuando el horario no la trae, y hay
una prueba que lo fija (`uniplanner-message.test.ts:205-212`). Es decir, el
sistema ya tiene una postura sobre el aula; lo que falta es el canal para
comunicar que cambió.

Lo que sí está construido y **la propuesta no pedía**: el envío de la **carga
académica completa** del semestre a un estudiante
(`POST /uniplanner/avisos/carga`, `uniplanner.routes.ts:151-171`). Funciona,
pero solo es alcanzable con `curl`: no hay ni siquiera método en el repositorio
del escritorio.

---

## 3. El canal — 100 %

Nada de esto se ve, y es la mitad del trabajo.

- **Autenticación propia contra Firestore por REST**, sin `firebase-admin`: JWT
  RS256 firmado con `jsonwebtoken`, canjeado por token OAuth, cacheado y
  renovado cinco minutos antes de caducar (`shared/uniplanner.ts:77-142`).
- **Identidad del enlace** derivada de (institución, código) con separador doble
  para que dos códigos no colisionen (`domains/uniplanner/link-id.ts:73-77`), y
  una prueba que fija que **todo identificador que emite el panel lo acepta
  UniPlanner** (`uniplanner-message.test.ts:69-90`). Ese desajuste ya ocurrió y
  dejaba sin enlazar a la segunda universidad que compartiera sigla.
- **Nunca se descarta a nadie en silencio.** Ocho motivos distintos de omisión
  —`sin-institucion`, `sin-enlace`, `sin-verificar`, `sin-datos`,
  `sin-configurar`, `sin-token`, `rechazado`, `red`— y una fila por destinatario
  en la respuesta (`uniplanner.service.ts:203-211`), traducidos a español legible
  en `desktop/src/domain/schemas/uniplanner.ts:69-78`.
- **Apagado por defecto y declarado.** Sin las tres credenciales el canal es un
  no-op que se anota **una sola vez** en el log (`shared/uniplanner.ts:60-66`);
  la interfaz consulta `GET /uniplanner/estado` y sencillamente no pinta nada.
- **El alcance del docente lo pone el servidor**, nunca el cliente
  (`uniplanner.routes.ts:28-30`), y los envíos a lista llevan límite de tasa
  (20 cada 15 minutos) y tope de 80 destinatarios por petición.

---

## 4. Lo que falta, por orden de lo que bloquea

### Bloqueante — sin esto no se puede encender de verdad

1. **Nadie verifica que el estudiante sea quien dice.** El identificador del
   documento de enlace **se puede calcular**: cualquiera que sepa el código de
   otro estudiante y tenga una cuenta con correo confirmado puede reclamarlo y
   recibir sus avisos de notas y faltas. Existe el interruptor
   `UNIPLANNER_SOLO_VERIFICADOS`, pero **hoy encenderlo deja el canal mudo**
   porque nada marca `verified` (`env.ts:124-132`, `docs/UNIPLANNER.md:227-245`).
   No hay ni ruta ni pantalla para verificar un enlace.
   *Es una decisión conjunta con UniPlanner, no una tarea de código de este
   lado.*

### Alto — es lo que la propuesta pide y no está

2. **Botón de «publicar nota del corte»** y **botón de «avisar de la entrega»**
   en el escritorio. La ruta, el adaptador y el hook ya existen; falta el sitio
   desde donde se pulsa y la confirmación.
3. **Enganche automático**: crear una actividad o cerrar un corte debería
   ofrecer el envío, que es lo que la propuesta llama «automáticamente».
4. **Pintar el semáforo** en la fila de asistencia con el `nivel` que devuelve el
   servidor, en vez del porcentaje acumulado.

### Medio

5. **Avisos de cambio de aula**: tipo de aviso nuevo, ruta y disparo desde el
   horario.
6. **Interfaz para la carga académica**, que ya está construida en el servidor y
   no tiene forma de usarse.
7. **Pantalla de enlaces**: hoy el estado (`Sin app` / `UniPlanner` /
   `Sin confirmar`) solo se ve dentro de la pantalla de asistencia. No hay dónde
   mirar, buscar o gestionar los enlaces de un grupo.
8. **Pruebas de las rutas y del servicio.** Hay un archivo, sólido, pero cubre
   solo lógica pura (`uniplanner-message.test.ts`, 298 líneas). **Cero** pruebas
   de las seis rutas, del reparto, del alcance del docente o del transporte.
   Existe incluso un gancho de pruebas que nadie llama
   (`_reiniciarTokenParaPruebas`, `shared/uniplanner.ts:360-363`): se escribió
   para pruebas que no se escribieron.

### Bajo — conocido y anotado

9. **Sin reintento.** Un fallo de red se anota y se pierde; no hay cola.
10. **Nadie borra los avisos caducados.** `expiresAt` se escribe y no hay tarea
    que limpie.
11. **La escala está fija en 5** (`uniplanner.service.ts:389-402`). El día que la
    calificación se parametrice por institución, esta línea tiene que moverse
    con ella, y no hay ninguna prueba que lo obligue.
12. **El móvil no tiene nada de esto.** Es una decisión escrita
    (`docs/UNIPLANNER.md:257-259`), no un olvido: cero coincidencias de
    «uniplanner» en `flutter_app/`.

---

## 5. Dos correcciones a la documentación

Salieron de esta revisión y conviene arreglarlas para no discutir sobre una base
falsa:

1. **`docs/UNIPLANNER.md` dice «nada sale de UniPlanner hacia aquí».** Es cierto
   a nivel de ruta HTTP —ninguna devuelve datos suyos—, pero el backend **sí
   lee** la colección `institution_links` de su Firestore
   (`shared/uniplanner.ts:222-276`) para saber a quién puede escribir. La frase
   es más absoluta que el código.
2. **`docs/UNIPLANNER.md` dice que `deploy/.env` basta.** El `docker-compose`
   pasa las cuatro variables, pero **no hay `deploy/.env.example`** que sirva de
   plantilla; quien despliegue tiene que crearlo a mano.

---

## 6. Qué contestarle a la propuesta

Con datos, sin adornos:

- **«¿Un botón de alerta preventiva le ahorraría reclamos?»** — Ese botón
  **existe y funciona**, individual y masivo, con confirmación y constancia de
  fecha y hora. Es lo que se puede enseñar mañana.
- **Calendario de entregas y notas de corte** — el servidor está hecho; falta
  conectar el botón. Es trabajo de días, no de semanas.
- **Cambio de aula** — no está, y es la única de las cuatro que empieza de cero.
- **Lo que hay que decidir entre los dos equipos, antes que nada**, es cómo se
  confirma que un estudiante es dueño del código que reclama. Mientras eso no
  esté, esto no debería mandar notas reales a nadie.
