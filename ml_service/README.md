# Servicio interno de Machine Learning

Este servicio aloja dos capacidades independientes: predicción explicable de
riesgo académico y clasificación de intenciones de **Rubri**, el asistente de
UTS Nexus. Ambas se ejecutan dentro de la infraestructura; ninguna requiere una
API externa.

Predice la probabilidad de que un estudiante repruebe, **con la explicación de
qué variables lo determinaron**.

Sustituye los umbrales fijos de `backend/src/domains/risk/risk.service.ts`
(promedio < 3.0, asistencia < 70%) por un modelo entrenado con los datos de la
institución.

---

## 1. Lo primero: qué es y qué no es

Un modelo supervisado necesita **casos cerrados** — estudiantes de los que ya se
sabe si reprobaron. Una institución que estrena el sistema no los tiene. Sin
resolver eso, el servicio no serviría de nada durante un semestre entero.

Por eso arranca con un **modelo de bootstrap**: entrenado con 4.000 casos
sintéticos que imitan las reglas actuales del backend, con un 8% de ruido para
que no las memorice al pie de la letra.

**Sé claro sobre esto:** el modelo de arranque no sabe nada que las reglas no
supieran. Su valor aparece cuando se reentrena con resultados reales. Hasta
entonces es un empate con el sistema anterior, no una mejora.

El campo `origin` de `/metrics` dice en qué punto estás:

| `origin` | Significado |
|---|---|
| `bootstrap` | Derivado de las reglas. Equivale al sistema anterior. |
| `real` | Entrenado con desenlaces reales de tu institución. |

---

## 2. Cómo aprende de verdad

```
Predicción  →  el docente marca si acertó
                        │
Cierre de semestre  →  resultado real (aprobó / reprobó)
                        │
                        ▼
              POST /api/v1/ml/train
                        │
                        ▼
        ¿El candidato supera al vigente?
              sí → se promueve
              no → se descarta
```

**Un modelo nuevo no reemplaza al vigente por ser nuevo.** Tiene que ganarle en
validación. Se compara por **recall**: dejar de detectar a un estudiante en
riesgo es peor que revisar a uno que estaba bien. El AUC desempata.

La única excepción: un modelo con datos reales siempre reemplaza al de arranque,
aunque las métricas se parezcan. La realidad de tu institución vale más que unas
reglas sintéticas.

Hacen falta **50 casos cerrados** como mínimo. `GET /api/v1/ml/dataset` te dice
cuántos llevas.

---

## 3. Puesta en marcha

```bash
cd ml_service
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe -m uvicorn app.main:app --port 8100
```

En el primer arranque entrena el modelo de bootstrap (unos segundos) y lo guarda
en `models/`. Los siguientes arranques lo cargan directo.

En `backend/.env`:

```ini
ML_BASE_URL=http://127.0.0.1:8100
ML_ENABLED=1
```

`ML_ENABLED=0` desactiva el servicio y el backend usa solo el motor de reglas.

---

## 4. Endpoints

| Método | Ruta | Qué hace |
|---|---|---|
| `GET` | `/health` | Si hay modelo cargado y cuál |
| `GET` | `/metrics` | Precisión, recall, AUC y origen del modelo vigente |
| `POST` | `/predict` | Predice para un lote de estudiantes |
| `POST` | `/train` | Entrena un candidato y lo promueve si mejora |
| `GET` | `/rubri/metrics` | Versión, métricas y matriz de confusión del clasificador |
| `POST` | `/rubri/intent` | Intención, confianza, alternativas y latencia para un mensaje |

A través del backend (con JWT):

| Método | Ruta | Qué hace |
|---|---|---|
| `GET` | `/api/v1/ml/status` | Estado y métricas |
| `GET` | `/api/v1/ml/risk` | Riesgo del alcance del usuario |
| `POST` | `/api/v1/ml/feedback` | El docente valora una alerta |
| `POST` | `/api/v1/ml/train` | Reentrena con los casos cerrados |
| `GET` | `/api/v1/ml/dataset` | Cuántos casos hay listos |

---

## 5. Variables del modelo

Todas salen de datos que la institución ya registra. No se inventa nada.

| Variable | Por qué está |
|---|---|
| `partial_average` | Promedio de lo ya calificado |
| `attendance_rate` | Porcentaje ponderado por minutos |
| `cuts_graded` | Cuántos cortes tienen nota |
| `missed_classes` | Clases perdidas |
| `grade_trend` | **Pendiente entre cortes.** Ir de 2.0 a 3.5 y de 3.5 a 2.0 da el mismo promedio y significa lo opuesto |
| `deficit_to_pass` | Distancia a 3.0. Cero si ya está por encima: no se premia ir sobrado |
| `attendance_deficit` | Cuánto falta para el mínimo del 70% |
| `relative_to_group` | **Contexto.** Un 3.0 no significa lo mismo en un grupo con promedio 4.5 que en uno con 2.8 |
| `absence_ratio` | Proporción de inasistencias |

> El orden de `FEATURE_NAMES` en `app/features.py` es **fijo**. El modelo aprende
> posiciones, no nombres: reordenar esa lista invalida los modelos ya entrenados.

---

## 6. Explicabilidad

**Ninguna predicción sale sin decir qué la causó.** No es un extra: un sistema
que marca a un estudiante como «riesgo alto» sin justificarlo no es utilizable.
El docente no puede actuar sobre un número, y el estudiante tiene derecho a saber
por qué se le señaló.

Se usa **SHAP** sobre el árbol entrenado. Si SHAP fallara, hay un respaldo por
desviación respecto a la media del lote: menos preciso, pero la explicación nunca
se devuelve vacía.

Ejemplo real:

```json
{
  "student_id": "...", "probability": 0.9876, "level": "HIGH", "source": "model",
  "reasons": [
    "Está 2.35 puntos por debajo del promedio del grupo.",
    "Acumula 11 clases perdidas.",
    "Le faltan 1.75 puntos para alcanzar la aprobación.",
    "Asistencia del 52%, bajo el mínimo del 70%."
  ]
}
```

---

## 7. Nunca deja al backend sin respuesta

Si el servicio no responde, el backend usa el motor de reglas y lo declara en
`source`:

| `source` | Significado |
|---|---|
| `model` | Predijo el modelo entrenado |
| `rules` | Respaldo determinista |

Dejar al docente sin información porque un servicio auxiliar se cayó sería peor
que darle una estimación más simple. Y decirle cuál usó es cuestión de honestidad.

---

## 8. Pruebas

```bash
.venv\Scripts\python.exe -m pytest tests/ -q
```

51 pruebas. Del modelo de riesgo (13): orden de columnas, tendencia, división por cero al
inicio del semestre, calibración del respaldo de reglas, rechazo de conjuntos
pequeños o de clase única, y que **toda predicción de riesgo venga explicada**.
De la visión (35): lectura de planillas de asistencia, de listados y de
calificaciones, con la confianza por fila que decide qué se marca para
revisión.

---

## 9. Umbrales

| Nivel | Probabilidad |
|---|---|
| `LOW` | < 0.35 |
| `MEDIUM` | 0.35 – 0.65 |
| `HIGH` | ≥ 0.65 |

Deliberadamente conservadores: **una falsa alarma cuesta una conversación; un
falso negativo cuesta un estudiante perdido.**
