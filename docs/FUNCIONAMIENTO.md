# UTS Nexus Académico — Guía de funcionamiento

Cómo funciona la plataforma, de punta a punta: qué hace cada aplicación, cómo
se calculan las notas y el riesgo, y qué ve cada tipo de usuario.

---

## 1. Idea central

Una sola plataforma con **tres aplicaciones** que comparten **un backend** y
**una base de datos** (MongoDB Atlas):

```
   App móvil (Flutter)  ─┐
                         ├──►  Backend central (Node/TS)  ──►  MongoDB Atlas
   App escritorio (Py)  ─┘         (única fuente de verdad)
```

- El **backend** manda: calcula notas, asistencia y riesgo. Guarda todo en Atlas.
- El **escritorio** y el **móvil** son solo interfaces: piden datos y los muestran.
- Todo se **sincroniza en tiempo real** por WebSocket: si el docente guarda una
  nota en el PC, el estudiante la ve en Android sin recargar.

**Regla de oro:** ningún cliente recalcula la nota final. Todos consultan el
mismo endpoint (`/grades/consolidado`). Cero lógica duplicada.

---

## 2. Roles y qué ve cada uno

| Rol | Dónde entra | Qué ve |
|-----|-------------|--------|
| **Administrador** | Escritorio | Todo el sistema (global). |
| **Coordinación** | Escritorio | Métricas y datos globales (lectura). |
| **Docente** | Escritorio y móvil | **Solo sus** materias, grupos, estudiantes matriculados, notas y asistencia. |
| **Estudiante** | Móvil | **Solo lo suyo**: sus notas, su asistencia y sus alertas. |

El aislamiento es real: un docente **no puede** ver ni tocar estudiantes de otro
docente. Esto se garantiza en el backend a través de las **matrículas**.

---

## 3. El modelo académico (cómo se relaciona todo)

```
Usuario (rol) ─ es ─► Profesor
Profesor ─ dicta ─► Materia ─ tiene ─► Grupo ─ contiene ─► Matrículas ─► Estudiante
                                                    │
                                                    └─► Notas y Asistencia
```

- El **Estudiante** existe una sola vez, identificado por su **cédula**.
- La **Matrícula** lo conecta a un **Grupo** concreto de un **semestre** concreto.
- Un estudiante puede estar en varios grupos, pero **cada grupo tiene los suyos**;
  no se comparten entre docentes.

---

## 4. Cálculo de notas (la regla UTS)

Cada **corte** se arma con tres componentes:

| Componente | Peso |
|------------|------|
| Trabajos | 30% |
| Parciales | 60% |
| Autoevaluación | 10% |

> Nota del corte = Trabajos×0.30 + Parciales×0.60 + Autoevaluación×0.10

La **nota final** pondera los tres cortes:

| Corte | Peso |
|-------|------|
| Corte 1 | 33% |
| Corte 2 | 33% |
| Corte 3 | 34% |

> Nota final = C1×0.33 + C2×0.33 + C3×0.34   ·   Se aprueba con **3.0** (escala 0–5)

**Importante — promedio parcial vs. nota final:**
- La **nota final** cuenta como 0 lo que aún no se ha calificado (es la nota de cierre).
- El **dashboard y el riesgo** usan el **promedio parcial**: solo los cortes ya
  calificados. Así, a mitad de semestre un buen estudiante **no** aparece como
  "reprobado" solo porque falten cortes por dictar.

---

## 5. Asistencia (ponderada por tiempo real)

No se cuenta por número de clases, sino por **minutos**. Una clase de 1:30 pesa
distinto que una de 3:00.

> % Asistencia = minutos presentes ÷ minutos totales × 100

Cada registro guarda fecha, duración (30–300 min) y presente/ausente. El sistema
soporta clases de duración variable sin configuración extra.

---

## 6. Riesgo académico y alertas

El backend evalúa a cada estudiante combinando **rendimiento + asistencia**:

- **Bajo rendimiento**: promedio parcial por debajo de 3.0.
- **Faltas acumuladas**: asistencia ponderada por debajo del 70% (crítico < 60%).
- **Clases perdidas**: 3 o más.

Con eso asigna un nivel: **BAJO / MEDIO / ALTO**. Los estudiantes en riesgo
generan una **notificación** que le llega al docente y al propio estudiante.

Cómo se disparan las alertas:
- **Manual**: botón **"Escanear riesgo"** en la app de escritorio, o
  `POST /notifications/risks/scan`.
- **Automático**: define `RISK_SCAN_INTERVAL_MIN` (minutos) en `backend/.env`.

---

## 7. Flujo típico del docente (escritorio)

1. **Materias**: crea sus materias del semestre (2026-1 / 2026-2).
2. **Estudiantes**: importa la lista (CSV con columnas **cédula, nombres**) y la
   **matricula en un grupo** con el selector "Matricular en grupo".
3. **Notas**: elige Materia → Grupo → Estudiante; captura trabajos/parciales/
   autoevaluación por corte. Al guardar, ve la **nota final calculada por el
   backend**.
4. **Asistencia**: registra por fecha y clase, con la duración real.
5. **Notificaciones**: pulsa "Escanear riesgo" para detectar estudiantes en peligro.
6. **Reportes**: exporta a PDF o Excel (Notas, Asistencia, Completo o
   **Consolidado** con la nota final).
7. **Dashboard**: métricas reales de promedio, aprobados, riesgo y asistencia.

## 8. Flujo típico del estudiante (móvil)

1. Inicia sesión en la app Android.
2. **Notas**: ve su nota final consolidada por semestre, con el desglose por corte.
3. **Asistencia**: consulta su porcentaje y sus registros.
4. **Alertas**: recibe las notificaciones de riesgo que le apliquen.

---

## 9. Reportes (PDF y Excel)

Disponibles por semestre y con filtros (materia, grupo, estudiante, fechas):

| Reporte | Contenido |
|---------|-----------|
| Notas | Notas capturadas por corte y componente. |
| Asistencia | Registros con fecha, duración y presente/ausente. |
| Completo | Notas + asistencia en un documento. |
| **Consolidado** | Nota final por corte, estado (aprobado/reprobado) y % asistencia. |

Los PDF salen **paginados** (se repite el encabezado al pasar de página) y con
texto legible; los Excel llevan encabezado con filtro y fila fija.

---

## 10. Sincronización y seguridad

- **Tiempo real**: al crear/editar una nota, asistencia o alerta, el backend
  avisa por WebSocket **solo a los usuarios afectados** (salas por usuario), no a
  todo el mundo.
- **Autenticación**: inicio de sesión con JWT; el WebSocket también exige el token.
- **Auditoría**: cada cambio de nota/asistencia queda registrado.

---

## 11. Preguntas frecuentes

**¿Puedo tener 2026-1 y 2026-2 a la vez?**
Sí. Todo (materias, grupos, notas, asistencia) está separado por semestre.

**¿Qué pasa con las notas viejas del sistema anterior?**
Se conservan como lectura, pero el esquema antiguo no distinguía trabajos/
parciales/autoevaluación, así que no entran al motor automáticamente. Recomendado:
recapturarlas en la nueva pantalla de Notas. Para migrar las matrículas:
`npm run migrate:enrollments`.

**¿El estudiante puede modificar sus notas?**
No. El estudiante es solo de consulta. Capturar notas es exclusivo del docente/admin.

---

Para el detalle técnico (arquitectura, modelo de datos, endpoints y plan de
migración) consulta **`docs/REFACTOR.md`**.
