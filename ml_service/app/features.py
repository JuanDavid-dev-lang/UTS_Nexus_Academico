"""
Ingeniería de variables.

Convierte las señales crudas de un estudiante en el vector que consume el
modelo. Vive en un solo módulo porque entrenamiento y predicción DEBEN usar
exactamente la misma transformación: si divergen, el modelo se entrena sobre una
realidad y predice sobre otra, y el fallo es silencioso.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .schemas import StudentFeatures

#: Orden fijo de columnas. El modelo aprende posiciones, no nombres, así que
#: reordenar esta lista invalida los modelos ya entrenados.
FEATURE_NAMES: list[str] = [
    "partial_average",
    "attendance_rate",
    "cuts_graded",
    "missed_classes",
    "grade_trend",
    "deficit_to_pass",
    "attendance_deficit",
    "relative_to_group",
    "absence_ratio",
]

#: Etiquetas legibles para la explicación que ve el docente.
FEATURE_LABELS: dict[str, str] = {
    "partial_average": "Promedio actual",
    "attendance_rate": "Porcentaje de asistencia",
    "cuts_graded": "Cortes ya calificados",
    "missed_classes": "Clases perdidas",
    "grade_trend": "Tendencia entre cortes",
    "deficit_to_pass": "Distancia a la nota de aprobación",
    "attendance_deficit": "Asistencia por debajo del mínimo",
    "relative_to_group": "Diferencia frente al promedio del grupo",
    "absence_ratio": "Proporción de inasistencias",
}

PASSING_GRADE = 3.0
MIN_ATTENDANCE = 70.0


def _trend(features: StudentFeatures) -> float:
    """Pendiente entre los cortes calificados.

    Un estudiante que va de 2.0 a 3.5 y otro que va de 3.5 a 2.0 pueden tener el
    mismo promedio y significar cosas opuestas. La tendencia captura eso.
    """
    graded = [c for c in (features.cut1, features.cut2, features.cut3) if c > 0]
    if len(graded) < 2:
        return 0.0
    # Pendiente de una regresión lineal simple sobre los cortes con nota.
    x = np.arange(len(graded), dtype=float)
    y = np.array(graded, dtype=float)
    return float(np.polyfit(x, y, 1)[0])


def to_vector(features: StudentFeatures) -> dict[str, float]:
    """Deriva las variables del modelo a partir de las señales crudas."""
    absence_ratio = (
        features.missed_classes / features.total_classes
        if features.total_classes > 0
        else 0.0
    )

    return {
        "partial_average": features.partial_average,
        "attendance_rate": features.attendance_rate,
        "cuts_graded": float(features.cuts_graded),
        "missed_classes": float(features.missed_classes),
        "grade_trend": _trend(features),
        # Cuánto le falta para aprobar. Cero si ya está por encima: el modelo no
        # debe premiar a quien va muy sobrado, solo distinguir a quien no llega.
        "deficit_to_pass": max(0.0, PASSING_GRADE - features.partial_average),
        "attendance_deficit": max(0.0, MIN_ATTENDANCE - features.attendance_rate),
        "relative_to_group": features.partial_average - features.group_average,
        "absence_ratio": absence_ratio,
    }


def to_frame(items: list[StudentFeatures]) -> pd.DataFrame:
    """Matriz de variables, con las columnas en el orden canónico."""
    rows = [to_vector(item) for item in items]
    return pd.DataFrame(rows, columns=FEATURE_NAMES)
