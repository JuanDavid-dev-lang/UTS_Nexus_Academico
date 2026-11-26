# Paridad entre clientes

Qué hace cada cliente —escritorio (Tauri), móvil (Flutter) y web (el mismo
código del escritorio, recortado)— y si cada diferencia es **deliberada** o un
**hueco**. Revisión de noviembre de 2026, hecha leyendo las rutas de
`desktop/src/app/router.tsx`, los destinos de
`flutter_app/lib/core/widgets/app_scaffold.dart`, las llamadas a la API de los
dos clientes y `domains/scope/web-access.ts`.

Recordatorio de la regla de oro: **ningún cliente calcula**. Una función que
falte en un cliente nunca se arregla calculando allí; se arregla llamando a la
misma ruta del backend.

Leyenda: ✔ completo · ◐ parcial (se dice qué falta) · — no existe ·
en la web, fuera de ADMIN (que lo ve todo), solo hay Materias, Estudiantes,
Notas, Asistencia, Riesgo, Sugerencias y Configuración ·
**App** en la web = la pantalla enseña «Esta función está en la aplicación».

## Docencia diaria (PROFESSOR)

| Función | Escritorio | Móvil | Web | Diferencia |
|---|---|---|---|---|
| Panel / inicio | ✔ | ✔ (saludo, aviso de riesgo, próxima clase) | App | Deliberada en web (entra por Materias). |
| Materias y grupos (crear, renombrar grupo) | ✔ | ✔ | ✔ | — |
| Matricular: buscar en el directorio | ✔ | ✔ | ✔ | — |
| Matricular: lista pegada | ✔ | ✔ | ✔ | — |
| Matricular: CSV | ✔ | ✔ (nuevo) | ✔ | Cerrado en esta revisión. |
| Matricular: XLSX, PDF o foto (`/enrollments/import/scan`) | ✔ | ✔ (nuevo: archivo, cámara o galería) | App | Cerrado en esta revisión. En web, deliberado (`soloEnApp`). |
| Directorio de estudiantes (alta por lista) | ✔ | ✔ (pegar o abrir CSV) | ✔ | PDF/foto no: el escáner exige grupo; se matricula desde la materia. |
| Ficha e historial del estudiante | ✔ | ✔ | ✔ | — |
| Notas: captura y desglose | ✔ (planilla de colegio) | ✔ (desglose por estudiante) | ✔ | Forma distinta a propósito (pantalla de 360 dp). |
| Notas: peso relativo por nota | ✔ | ◐ (pinta los pesos; el peso lo resuelve el servidor por la plantilla) | ✔ | Deliberada: el móvil no pide peso y el servidor lo resuelve. |
| Plantillas de corte | ✔ | — | ✔ | Deliberada (CLAUDE.md: se gestionan desde el escritorio). |
| Importar calificaciones (Excel, PDF Academusoft, foto) | ✔ | — | App | **Hueco** (prioridad media). |
| Asistencia: lista por grupo | ✔ | ✔ | ✔ | — |
| Asistencia: escanear planilla | ✔ | ✔ | App | — |
| Asistencia por QR (proyectar) | ✔ | — | ✔ | Deliberada: se proyecta en el aula desde un equipo; el móvil ignora `attendanceSession`. |
| Excusas de inasistencia | ✔ | ✔ | ✔ | — |
| Escrituras sin conexión (notas, asistencia) | ✔ | ✔ | ◐ (cola en memoria) | Deliberada en web: no escribe en disco. |
| Riesgo y seguimientos | ✔ (pantalla propia) | ✔ (en el panel y hoja de intervención) | ✔ | — |
| Casos de inasistencia | ✔ | ✔ | ✔ | — |
| Agenda, eventos | ✔ | ✔ | App | — |
| Importar calendario institucional / horario | ✔ | — | App | **Hueco** menor (tarea de inicio de semestre, de escritorio). |
| Horario semanal (franjas, orden) | ✔ | ✔ | App | — |
| Actividades | ✔ (línea de tiempo + mes) | ✔ (lista) | App | — |
| Avisos UniPlanner (nota, inasistencia, entrega) | ✔ | — | App | **Hueco** (prioridad media): el móvil no ofrece «avisar al estudiante». |
| Reportes PDF/Excel (notas, asistencia, consolidado, combinado) | ✔ | ✔ (hoja de compartir) | ◐ (solo notas y asistencia) | Deliberada en web. |
| Asistente IA | ✔ | ✔ | Invitación | Deliberada en web. |
| Trabajos de grado (formatos) | ✔ | ✔ | App | — |
| Recordatorios de clase | Avisos del servidor (campana) | Alarmas locales (sin red) | — | Deliberada: el teléfono es quien está en el aula. |
| Widgets de inicio | — | ✔ (Android) | — | Deliberada. |

## Cuenta y sesión (todos los roles)

| Función | Escritorio | Móvil | Web | Diferencia |
|---|---|---|---|---|
| «Mantener la sesión iniciada» | ✔ | ✔ (nuevo) | — | Cerrado. En web deliberado: `sessionStorage`. |
| Sesión atada al equipo (`deviceId`) | ✔ | ✔ (nuevo) | ✔ | Cerrado: el móvil ya manda `deviceId` en login, refresh y cambio de contraseña. |
| Renovación diaria de una sesión mantenida | ✔ (`keep-alive.ts`) | ✔ (nuevo: al entrar y al volver a primer plano) | — | Cerrado. |
| Cierre de sesión con revocación | ✔ | ✔ (más rápido: local en paralelo, servidor ≤ 3 s) | ✔ | — |
| Cambiar contraseña, perfil | ✔ | ✔ | ✔ | — |
| Apariencia (tono, visión del color, estilo) | ✔ (+ posición del menú) | ✔ | ✔ | Posición del menú: deliberada, solo escritorio. |
| Notificaciones y preferencias | ✔ | ✔ (+ push FCM) | ✔ | — |
| Sugerencias | ✔ (ADMIN: bandeja completa) | ◐ (envía y ve las propias) | ✔ | **Hueco** menor: la bandeja de ADMIN no está en el móvil. |
| Actualizaciones | Tauri updater | APK desde Releases | Despliegue continuo | Deliberada. |
| Tutorial | ✔ | ✔ | ✔ | — |

## Coordinación, secretaría y administración

| Función | Escritorio | Móvil | Web | Diferencia |
|---|---|---|---|---|
| Coordinación (`/coordinacion/*`, export.xlsx) | ✔ | — | App | **Hueco** (prioridad alta para COORDINATOR): hoy en el móvil solo ve lo que ve un docente. |
| Periodos: consultar estado | ✔ | ◐ (lo lee para bloquear la captura) | App | — |
| Periodos: cerrar, abortar, reabrir | ✔ (ADMIN) | — | App | Deliberada: decisión global y con acta. |
| Avisos institucionales: redactar | ✔ | — (solo lee) | App | Deliberada por ahora. |
| Personal y docentes (alta, programas, director de TG) | ✔ | ◐ (supervisión de solo lectura, ADMIN) | ✔ | Deliberada: asignar alcances se hace con calma. |
| Solicitudes de registro | ✔ | — | ✔ | **Hueco** menor. |
| Perfiles institucionales | ✔ | — | ✔ | Deliberada. |
| Vínculos UniPlanner | ✔ | — | App | **Hueco** (prioridad media: desbloquear un enlace en el aula). |
| Auditoría | ✔ | — | ✔ | Deliberada (ADMIN, consulta larga). |
| Centro de salud | ✔ | — | ✔ | Deliberada. |
| Uso de la aplicación | ✔ (+ export) | ✔ (ADMIN) | App | Export solo escritorio. |
| Plantilla de reportes (membrete, columnas) | ✔ (ADMIN) | — | App | Deliberada. |

## Pendientes, en orden

1. **Coordinación en el móvil** (resumen y materias con su docente, de lectura).
   Es la única función de un rol entero que el teléfono no tiene. Una pantalla
   sobre `GET /coordinacion/resumen` y `/materias`, sin cálculo en cliente.
2. **Avisos UniPlanner desde el móvil** (nota, inasistencia, entrega): el
   docente está en el aula con el teléfono. Mismas rutas; el cliente dice a
   quién, el servidor decide qué.
3. **Vínculos UniPlanner** de lectura y «desbloquear» para ADMIN/coordinación.
4. **Importar calificaciones** desde archivo o foto: el contrato de dos pasos
   ya está resuelto para el listado (`LeerListado`), se reutiliza con
   `/grades/import/scan` y `POST /grades/bulk`.
5. Bandeja de sugerencias de ADMIN y solicitudes de registro.
6. Importar calendario institucional y horario (de escritorio por naturaleza;
   baja).
