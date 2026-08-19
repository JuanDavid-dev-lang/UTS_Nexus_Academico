# Agenda académica, notificaciones y sincronización

Tres piezas que funcionan como una sola: el backend expande el horario a clases
con fecha, Socket.IO propaga los cambios a los clientes conectados y el teléfono
avisa aunque la aplicación esté cerrada.

Este documento explica **qué se añadió, por qué está donde está y qué hay que
configurar**. Para publicar una versión ver `docs/PUBLICAR_VERSION.md`.

---

## 1. La decisión que ordena todo lo demás: la hora del campus

`ScheduleModel` guarda `dayOfWeek` + `"HH:mm"`. Eso no es un instante: es una
hora de pared. Convertirla en un instante exige saber **en qué zona horaria**.

- Si el backend usara la zona del proceso, un contenedor en UTC pondría la clase
  de las 10:00 a las 05:00 del teléfono del docente.
- Si cada cliente la resolviera con su zona, un teléfono mal configurado —o de
  alguien que viajó— mostraría otra hora, y el docente no tendría forma de saber
  cuál de los dos miente.

Por eso hay una sola respuesta y viene del servidor:

```
CAMPUS_UTC_OFFSET_MIN=-300   # Colombia, sin horario de verano
```

`GET /agenda` devuelve **instantes absolutos en UTC** más `campusOffsetMinutes`.
Los clientes formatean con ese desfase; ninguno recalcula a qué hora es una
clase. Colombia no tiene DST, así que un desfase fijo es correcto todo el año;
si algún día hay un campus con DST, el único archivo que cambia es
`backend/src/domains/agenda/agenda.service.ts`.

---

## 2. Modelo de datos

### Lo que se reutilizó

| Concepto | Colección existente | Qué hace la agenda |
|----------|--------------------|--------------------|
| Clases | `horarios` (`ScheduleModel`) | Las **lee** y las expande a ocurrencias con fecha |
| Entregas | `actividades` (`ActivityModel`) | Las lee por `dueAt` |
| Notificaciones | `notificaciones` (`NotificationModel`) | Se amplió, no se duplicó |

**Las clases NO se copiaron a una colección nueva.** Duplicar el horario habría
dado dos fuentes de verdad para el mismo dato y un desfase garantizado en cuanto
alguien moviera una franja en una de las dos.

### Colecciones nuevas

| Colección | Modelo | Para qué |
|-----------|--------|----------|
| `eventos_calendario` | `CalendarEventModel` | Lo que **no** se repite cada semana: parciales, entregas, tutorías, reuniones, recordatorios |
| `dispositivos` | `DeviceModel` | Tokens de push por usuario |
| `preferencias_notificacion` | `NotificationPreferenceModel` | Un documento por usuario: qué recibir, con cuánta antelación, horas de silencio |

### Campos añadidos a `notificaciones`

| Campo | Para qué |
|-------|----------|
| `priority` | `URGENT` / `IMPORTANT` / `INFO` / `SYSTEM`. Ordena la bandeja y decide si atraviesa las horas de silencio |
| `dedupeKey` | Identidad del **hecho** notificado. Índice único parcial por `(userId, dedupeKey)` |
| `link` | Ruta interna a la que lleva al tocarla (`/agenda?item=…`). Nunca una URL externa |
| `type` | Se ampliaron los valores con `EVENT`, `REMINDER`, `SCHEDULE` |

### Migración

**Ninguna es obligatoria.** Los tres campos nuevos de `notificaciones` tienen
valor por defecto y los documentos antiguos siguen siendo válidos: `priority`
cae a `INFO` y `dedupeKey` queda `null`, que el índice parcial ignora. Mongoose
crea los índices al arrancar.

Si se quiere rellenar la prioridad del histórico (opcional, cosmético):

```js
// mongosh
db.notificaciones.updateMany({ type: 'RISK', priority: { $exists: false } }, { $set: { priority: 'IMPORTANT' } })
db.notificaciones.updateMany({ priority: { $exists: false } }, { $set: { priority: 'INFO' } })
```

---

## 3. Endpoints

Todos bajo `/api/v1`, todos con `identificar` (JWT) y filtrados por alcance:
un PROFESSOR ve lo suyo, un STUDENT lo de las materias en las que está
matriculado, ADMIN/COORDINATOR todo.

### Agenda

| Método | Ruta | Qué hace |
|--------|------|----------|
| `GET` | `/agenda?from&to&subjectId&groupId&tipos&soloClases` | Clases + eventos + entregas, unificados y ordenados. Rango máximo 120 días |
| `GET` | `/agenda/resumen` | Clase en curso, próxima clase, lo de hoy y próximos eventos |
| `GET` | `/agenda/events?from&to` | Eventos en crudo, para editarlos |
| `POST` | `/agenda/events` | Crea un evento |
| `PATCH` | `/agenda/events/:id` | Edita uno propio |
| `DELETE` | `/agenda/events/:id` | Baja lógica |

Forma de un item de agenda:

```json
{
  "id": "class:66f1…:2026-08-11",
  "origen": "schedule",
  "sourceId": "66f1…",
  "kind": "CLASS",
  "type": "CLASS",
  "title": "Programación II",
  "startAt": "2026-08-11T15:00:00.000Z",
  "endAt": "2026-08-11T17:00:00.000Z",
  "durationMinutes": 120,
  "date": "2026-08-11",
  "classroom": "304",
  "groupName": "2A",
  "teacherName": "Ana Ruiz",
  "status": "PROXIMA"
}
```

`id` es estable: **misma clase + mismo día = misma cadena**. Es lo que permite
que un recordatorio no se repita y que una notificación abra exactamente esa
clase.

### Notificaciones

| Método | Ruta | Qué hace |
|--------|------|----------|
| `GET` | `/notifications?estado&priority&type&limit` | Bandeja, con filtros |
| `PATCH` | `/notifications/read-all` | Marca todas leídas en **una** petición |
| `PATCH` | `/notifications/:id/read` | Marca una |
| `DELETE` | `/notifications/:id` | Baja lógica |
| `GET` | `/notifications/preferences` | Preferencias + `pushConfigurado` |
| `PUT` | `/notifications/preferences` | Guarda preferencias |
| `POST` | `/notifications/devices` | Registra el token de push |
| `DELETE` | `/notifications/devices` | Da de baja un token |
| `POST` | `/notifications/agenda/scan?ventana=N` | Fuerza una pasada de recordatorios (solo ADMIN, para diagnosticar) |

### Horario

`/schedules` gana `DELETE /:id` y ahora **filtra por dueño en `PATCH` y
`DELETE`**: antes, un docente con el id de la franja de otro podía moverla.

---

## 4. Recordatorios: quién avisa de qué

Hay dos mecanismos y **no se solapan**.

```
Recordatorio de clase           →  alarma local de Android
  (se conoce con días de antelación, funciona sin red y con la app cerrada)

Alerta de riesgo, cambio de     →  push del servidor (FCM)
horario, evento creado en PC        (el teléfono no puede saberlo por adelantado)
```

El teléfono se registra con `localClassReminders: true` y el servidor **deja de
mandarle push de tipo `CLASS`**. Sin eso, el docente recibiría el mismo aviso
dos veces, que es la forma más rápida de enseñarle a ignorarlos.

### Control de duplicados

Cada aviso se identifica por **qué** notifica, no por cuándo se creó:

```
class:<horarioId>:<AAAA-MM-DD>:<antelación>
event:<eventoId>:<antelación>
schedule-changed:<docenteId>:<AAAA-MM-DD>
```

- En el servidor, `dedupeKey` choca contra el índice único `(userId, dedupeKey)`.
  Dos pasadas solapadas, un reinicio a mitad de minuto o dos instancias del
  backend escriben la misma clave y solo entra una.
- En el teléfono, el id de la notificación es `clave.hashCode`. Android
  **reemplaza** la que ya tenía ese id en vez de apilar otra.

`avisoEnVentana()` dispara dentro de una ventana de un minuto en vez de en un
instante exacto: un tick que llega dos segundos tarde no puede saltarse el aviso.

### Horas de silencio

Dentro de la franja no suena nada, pero la notificación **sí se crea**:
silenciar es dejar de sonar, no dejar de enterarse. Las `URGENT` la atraviesan
salvo que el usuario lo desactive.

---

## 5. Sincronización en tiempo real

Se reutilizó el `sync:update` que ya existía. Se añadieron entidades y un
evento nuevo:

| Evento | Payload | Para qué |
|--------|---------|----------|
| `sync:update` | `{entity, action, id}` | "Esta caché caducó" |
| `notification:new` | `{_id, title, message, type, priority, link}` | "Avísale" |

### Estado de la conexión

Los dos clientes muestran los tres estados que pidió el sistema:

| Estado | PC (barra superior) | Android (franja superior) |
|--------|--------------------|---------------------------|
| 🟢 Conectado | icono verde | franja fina: «Sincronizado · hace 4 min» |
| 🟡 Reconectando | icono girando + «Reconectando…» | «Reconectando…» |
| 🔴 Sin conexión | icono rojo + etiqueta | «Sin conexión — datos guardados hace X» |

`reconnecting` se distingue de `connecting` a propósito: la primera conexión y
un corte a mitad de sesión no significan lo mismo. En PC sale del manager de
socket.io (`reconnect_attempt` / `reconnect` / `reconnect_failed`); en Android,
del `RealtimeStatus` que ya publicaba el servicio, ahora con valor inicial para
que un widget montado con la conexión ya establecida no muestre «sin conexión».

La marca de última sincronización se persiste en `SharedPreferences`: «hace 4
minutos» sigue siendo cierto después de cerrar y abrir la app, y se borra al
cerrar sesión.

Son dos cosas distintas y por eso van por canales distintos: quien solo quiere
invalidar una caché no debería acabar mostrando avisos.

Entidades nuevas en el mapa de invalidación: `schedule`, `calendar`, `activity`,
`preferences`.

**Escritorio** (`desktop/src/core/realtime/socket.ts`): cada entidad invalida
sus claves de TanStack Query; `notification:new` muestra un toast y un aviso
nativo del sistema.

**Android** (`flutter_app/lib/app.dart`): cada entidad invalida sus providers de
Riverpod, y `schedule` / `calendar` / `activity` / `preferences` además
**reprograman las alarmas locales**. Ese es el enlace entre las tres funciones:

```
PC cambia el horario
  → backend guarda y emite sync:update{entity:'schedule'}
  → Android invalida la agenda y vuelve a pedirla
  → Android cancela sus alarmas y las reprograma con las horas nuevas
  → el aviso llega a la hora correcta
```

**Seguridad:** los eventos salen por `emitToUser`, que publica solo en la sala
`user:<id>` (más ADMIN/COORDINATOR). El horario dejó de usar el broadcast global
`emitSync`.

---

## 6. Configuración

### Backend (`backend/.env`)

```bash
# Obligatorio si el servidor no está en la zona del campus
CAMPUS_UTC_OFFSET_MIN=-300

# Recordatorios de clase. 0 lo desactiva.
CLASS_REMINDER_INTERVAL_MIN=1

# Push a Android — OPCIONAL. Sin esto no se envía nada con la app cerrada
# y queda anotado en el log, igual que el correo saliente.
FCM_PROJECT_ID=mi-proyecto-firebase
FCM_CLIENT_EMAIL=...@...iam.gserviceaccount.com
FCM_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Comprobar con `npm run check:env`. **Un nombre mal escrito no da error: cae en
silencio al valor por defecto.**

En un despliegue con varias instancias, activar
`CLASS_REMINDER_INTERVAL_MIN` en **una sola**: el `dedupeKey` evita el aviso
doble, pero no el trabajo doble.

### Firebase (solo si se quiere push con la app cerrada)

Todo el código está puesto en los dos lados. Lo único que falta es la cuenta:

1. Crear un proyecto en <https://console.firebase.google.com>.
2. Añadir una app **Android** con el paquete `co.edu.uts.nexus.academico`.
3. Descargar `google-services.json` a **`flutter_app/android/app/`**.
4. Configuración del proyecto › Cuentas de servicio › **Generar nueva clave
   privada**. Del JSON salen `project_id`, `client_email` y `private_key`, que
   van a `backend/.env` como `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL` y
   `FCM_PRIVATE_KEY`.
5. `flutter clean && flutter pub get && flutter run`.

**Sin el paso 3 la app compila igual.** El plugin de Gradle se aplica solo si el
archivo existe (`android/app/build.gradle.kts`), `Firebase.initializeApp()`
falla, `PushService` lo captura y la aplicación arranca sin push. En la consola
de Gradle aparece:

```
[uts] google-services.json no encontrado: se compila SIN notificaciones push.
```

Ajustes › Notificaciones dice cuál de los dos lados falta —el servidor o este
build—, para no tener que adivinar a quién preguntar.

**La clave privada no va al repositorio** (`google-services.json` tampoco).
Quien tenga la clave puede mandar notificaciones a todos los teléfonos con la
app instalada.

### Escritorio

`npm install` en `desktop/` (dependencia nueva:
`@tauri-apps/plugin-notification`). El plugin de Rust ya está declarado en
`src-tauri/Cargo.toml` y su permiso en `capabilities/default.json`; una
compilación nativa lo descarga sola.

En modo navegador (`npm run dev`) no hay bandeja del sistema: el aviso nativo
degrada a `false` y queda el toast, igual que hace el updater.

### Android

`flutter pub get` (dependencias nuevas: `flutter_local_notifications`,
`timezone`). Ya están configurados:

- Permisos en `AndroidManifest.xml`: `POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM`,
  `USE_EXACT_ALARM`, `RECEIVE_BOOT_COMPLETED`, `VIBRATE`.
- Los tres receptores de `flutter_local_notifications`, incluido el de arranque:
  Android borra las alarmas al reiniciar y sin ese receptor un reinicio nocturno
  dejaba al docente sin avisos al día siguiente.
- `isCoreLibraryDesugaringEnabled` en `build.gradle.kts`: sin esto la app compila
  y revienta en ejecución en los Android antiguos.
- Reglas de R8 en `proguard-rules.pro`: el plugin serializa con Gson para
  reprogramar tras un reinicio, y R8 renombraba esos campos.

---

## 7. Integración con la IA

El asistente **no calcula horarios**. La agenda se resuelve con los datos
reales y se le entrega ya formateada:

- `pareceDeAgenda()` decide si la pregunta va de horarios. Si no, no se carga la
  agenda: sería una consulta de más por cada «¿cómo va el grupo?».
- Si va: `contextoAgenda()` construye un bloque con horas absolutas, aulas y
  fechas, y el prompt del sistema le prohíbe explícitamente calcular, convertir
  zonas o deducir una hora que no esté escrita ahí.
- Si Ollama está caído, `responderAgenda()` contesta con reglas sobre los mismos
  datos. Un horario es justo lo que no se puede dejar sin responder: mandar a un
  docente a un aula equivocada es un error con coste real.

Preguntas cubiertas por el modo reglas: «¿qué clases tengo hoy/mañana?», «¿cuál
es mi próxima clase?», «¿qué tengo después del almuerzo?», «¿a qué hora tengo
Programación II?», «¿qué tengo el jueves?», «¿qué evaluaciones tengo esta
semana?».

---

## 8. Pruebas

```bash
cd backend && npm test        # 183 pruebas · dominio puro, sin base ni servidor
cd desktop && npm test        # 92 pruebas
cd flutter_app && flutter test  # 53 pruebas
```

`backend/tests/agenda.test.ts` (41 pruebas) fija:

- que «10:00» son las diez del campus y no las del servidor;
- que una clase en curso se distingue de una terminada, incluso solapadas;
- que un recordatorio cae en **una sola** pasada del temporizador aunque el tick
  llegue tarde;
- que la franja de silencio que cruza la medianoche silencia de verdad;
- que «mañana» es el día siguiente y no las próximas 24 horas.

`desktop/tests/unit/calendar.test.ts` (22 pruebas) fija el dibujo: reparto de
solapados en columnas, altura del bloque en la rejilla, rejilla mensual de 42
días, y que escribir «10:00» en el formulario guarde las 10:00 del campus.

`flutter_app/test/campus_time_test.dart` fija lo mismo del lado del teléfono más
el parseo tolerante: un tipo desconocido o una fecha inválida no revientan la
pantalla.

`npm run smoke` (requiere servidor arriba y `SEED_PASSWORD`) comprueba la agenda
end-to-end: rango, resumen, preferencias, y alta y baja de un evento.

---

## 9. Limitaciones conocidas

1. **Push con la app cerrada exige una cuenta de Firebase.** El código está
   completo en los dos lados; lo que falta es crear el proyecto y colocar los
   dos archivos de §6. Sin ellos no hay push del servidor, pero los
   recordatorios de clase siguen llegando con la app cerrada y sin red porque
   son alarmas locales.
2. **Una clase no se puede mover «solo este día».** El modelo guarda franjas
   semanales; una excepción por fecha necesitaría una colección de excepciones.
3. **iOS no existe.** No se puede compilar desde Windows.
4. **Un solo desfase horario para toda la instalación.** Suficiente para UTS.
5. **Escrituras offline.** El calendario se **lee** sin red desde la caché,
   fechado. Crear un evento o mover una clase sí exige conexión: fingir que un
   parcial quedó guardado cuando no llegó al servidor es peor que fallar.
6. El recordatorio de cambio de horario se agrupa por día: mover cuatro franjas
   seguidas genera **un** aviso, no cuatro.
7. **Flutter no se pudo compilar ni analizar** en la máquina donde se escribió
   esto: no hay SDK instalado. El Dart está revisado contra las APIs de los
   plugins usados, pero `flutter analyze` y `flutter test` siguen pendientes de
   ejecutar.

---

## 11. Qué se puede hacer desde dónde

| Acción | PC | Android |
|--------|----|---------|
| Ver agenda día / semana / mes / próximas | ✅ (semanal en rejilla) | ✅ (hoy / semana / próximas, en lista) |
| Próxima clase y clase en curso con contador | ✅ | ✅ (agenda y panel) |
| Crear, editar y borrar eventos | ✅ | ✅ crear |
| Editar una franja del horario (día, hora, aula, modalidad) | ✅ | ✅ |
| Reordenar el horario | — | ✅ |
| Preferencias de notificación | ✅ | ✅ |
| Centro de notificaciones con filtros por prioridad | ✅ | ✅ (todas / sin leer) |
| Avisos del sistema operativo | ✅ (Tauri) | ✅ (alarmas locales + push) |
| Búsqueda de eventos en la paleta | ✅ `Ctrl+K` | — |

Cualquiera de las escrituras de la tabla emite `sync:update`, así que el otro
dispositivo se entera sin recargar. Android reprograma además sus alarmas.

---

## 10. Archivos

### Backend — nuevos
```
src/domains/agenda/agenda.service.ts        Motor puro: expansión, estado, ventanas
src/domains/agenda/agenda-questions.ts      Intención de las preguntas de agenda
src/models/calendar-event.model.ts
src/models/device.model.ts
src/models/notification-preference.model.ts
src/modules/agenda/agenda.service.ts        Composición con alcance
src/modules/agenda/agenda.routes.ts
src/modules/notifications/class-reminder.service.ts
src/modules/ai/agenda-context.ts
src/shared/notify.ts                        Punto único de creación
src/shared/push.ts                          FCM HTTP v1, sin dependencias nuevas
tests/agenda.test.ts
```

### Backend — modificados
```
src/models/notification.model.ts       priority, dedupeKey, link, tipos nuevos
src/modules/notifications/notification.routes.ts
src/modules/notifications/risk-notifier.service.ts
src/modules/schedules/schedule.routes.ts    scoping, DELETE, aviso de cambio
src/modules/ai/ai.routes.ts
src/modules/ai/assistant.service.ts
src/routes/index.ts · src/server.ts · src/shared/scheduler.ts · src/shared/env.ts
src/scripts/smoke.ts · .env.example
```

### Escritorio — nuevos
```
src/domain/schemas/agenda.ts
src/domain/agenda/calendar.ts
src/infrastructure/repositories/agenda.repository.ts
src/core/platform/notifications.ts
src/features/agenda/  (página, hooks, presentación y 5 componentes)
src/features/settings/components/notifications-card.tsx
tests/unit/calendar.test.ts
tests/unit/sync-map.test.ts
```

### Escritorio — modificados
```
src/core/realtime/socket.ts · src/core/api/query-keys.ts
src/domain/repositories/ports.ts · src/domain/schemas/insights.ts
src/app/router.tsx · src/shared/layouts/{sidebar,app-shell,command-palette,topbar}.tsx
src/features/notifications/{notifications-page.tsx,hooks/use-notifications.ts}
src/features/settings/settings-page.tsx
package.json · src-tauri/{Cargo.toml,src/lib.rs,capabilities/default.json}
```

### Android — nuevos
```
lib/core/data/campus_time.dart
lib/core/models/agenda.dart
lib/core/services/agenda_repository.dart
lib/core/services/local_notifications_service.dart
lib/features/agenda/agenda_page.dart
lib/features/agenda/widgets/next_class_card.dart
lib/core/services/push_service.dart
lib/features/agenda/widgets/event_sheet.dart
lib/features/settings/widgets/notifications_section.dart
test/campus_time_test.dart
test/offline_status_test.dart
```

### Android — modificados
```
lib/app.dart · lib/main.dart · lib/core/data/{providers,models}.dart
lib/core/services/{realtime_service,api_client}.dart
lib/core/data/offline_status.dart · lib/core/widgets/offline_banner.dart
lib/core/widgets/app_scaffold.dart
lib/features/schedule/schedule_page.dart · lib/features/ai/ai_page.dart
lib/features/reports/reports_page.dart
lib/features/dashboard/dashboard_page.dart
lib/features/notifications/notifications_page.dart
lib/features/settings/settings_page.dart
pubspec.yaml · android/app/build.gradle.kts
android/app/src/main/AndroidManifest.xml · android/app/proguard-rules.pro
android/settings.gradle.kts
```
