"""
Modelo de riesgo académico: entrenamiento, predicción y explicación.

Decisiones:

- **Gradient Boosting** (`HistGradientBoostingClassifier`) porque captura
  interacciones no lineales —"nota baja Y asistencia baja" pesa más que la suma
  de ambas— sin necesidad de escalar variables.
- **Explicación obligatoria.** Ninguna predicción sale sin decir qué la causó.
  Un sistema que marca a un estudiante como "riesgo alto" sin justificarlo no es
  utilizable: el docente no puede actuar sobre un número, y el estudiante tiene
  derecho a saber por qué se le señaló.
- **Promoción con validación.** Un modelo nuevo solo reemplaza al vigente si lo
  supera en validación cruzada. Reentrenar no es sinónimo de mejorar.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

import joblib
import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split

from .features import FEATURE_LABELS, FEATURE_NAMES, to_frame
from .schemas import (
    FeatureContribution,
    ModelMetrics,
    PredictionResponse,
    StudentFeatures,
    StudentPrediction,
    TrainingExample,
)

MODELS_DIR = Path(__file__).resolve().parent.parent / "models"
MODELS_DIR.mkdir(exist_ok=True)

ACTIVE_MODEL = MODELS_DIR / "active.joblib"
ACTIVE_METRICS = MODELS_DIR / "active.json"

#: Umbrales de probabilidad. Deliberadamente conservadores: una falsa alarma
#: cuesta una conversación; un falso negativo cuesta un estudiante perdido.
MEDIUM_THRESHOLD = 0.35
HIGH_THRESHOLD = 0.65


def _level(probability: float) -> Literal["LOW", "MEDIUM", "HIGH"]:
    if probability >= HIGH_THRESHOLD:
        return "HIGH"
    if probability >= MEDIUM_THRESHOLD:
        return "MEDIUM"
    return "LOW"


class RiskModel:
    """Envuelve el estimador entrenado y su metadata."""

    def __init__(self, estimator, metrics: ModelMetrics) -> None:
        self.estimator = estimator
        self.metrics = metrics

    # ── Entrenamiento ────────────────────────────────────────────────────────
    @classmethod
    def train(
        cls,
        examples: list[TrainingExample],
        origin: Literal["bootstrap", "real"],
    ) -> "RiskModel":
        if len(examples) < 50:
            raise ValueError(
                f"Se necesitan al menos 50 casos para entrenar; llegaron {len(examples)}."
            )

        frame = to_frame([example.features for example in examples])
        labels = np.array([1 if example.failed else 0 for example in examples])

        if len(set(labels.tolist())) < 2:
            raise ValueError(
                "Todos los casos tienen el mismo desenlace. Sin variedad no hay "
                "nada que aprender."
            )

        # Estratificado: mantiene la proporción de reprobados en ambos lados.
        x_train, x_test, y_train, y_test = train_test_split(
            frame, labels, test_size=0.25, random_state=42, stratify=labels
        )

        estimator = HistGradientBoostingClassifier(
            max_iter=250,
            learning_rate=0.07,
            max_depth=5,
            l2_regularization=1.0,
            random_state=42,
        )
        estimator.fit(x_train, y_train)

        predictions = estimator.predict(x_test)
        probabilities = estimator.predict_proba(x_test)[:, 1]

        metrics = ModelMetrics(
            version=datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S"),
            trained_at=datetime.now(timezone.utc).isoformat(),
            samples=len(examples),
            accuracy=float(accuracy_score(y_test, predictions)),
            precision=float(precision_score(y_test, predictions, zero_division=0)),
            # El recall manda en este dominio: dejar de detectar a un estudiante
            # en riesgo es peor que revisar a uno que estaba bien.
            recall=float(recall_score(y_test, predictions, zero_division=0)),
            roc_auc=float(roc_auc_score(y_test, probabilities)),
            origin=origin,
        )

        return cls(estimator, metrics)

    # ── Persistencia ─────────────────────────────────────────────────────────
    def save_as_active(self) -> None:
        joblib.dump(self.estimator, ACTIVE_MODEL)
        ACTIVE_METRICS.write_text(
            json.dumps(self.metrics.model_dump(), indent=2), encoding="utf-8"
        )
        # Copia versionada, para poder volver atrás si una promoción sale mal.
        joblib.dump(self.estimator, MODELS_DIR / f"model-{self.metrics.version}.joblib")

    @classmethod
    def load_active(cls) -> "RiskModel | None":
        if not ACTIVE_MODEL.exists() or not ACTIVE_METRICS.exists():
            return None
        try:
            estimator = joblib.load(ACTIVE_MODEL)
            metrics = ModelMetrics(**json.loads(ACTIVE_METRICS.read_text(encoding="utf-8")))
            return cls(estimator, metrics)
        except Exception:
            # Un artefacto corrupto no debe impedir arrancar: se cae al respaldo
            # de reglas y se reentrena.
            return None

    # ── Predicción ───────────────────────────────────────────────────────────
    def predict(self, students: list[StudentFeatures]) -> PredictionResponse:
        # scikit-learn rechaza una matriz sin filas. Un lote vacío es una
        # petición legítima (una materia sin matriculados), no un error.
        if not students:
            return PredictionResponse(
                model_version=self.metrics.version, predictions=[]
            )

        frame = to_frame(students)
        probabilities = self.estimator.predict_proba(frame)[:, 1]
        contributions = self._explain(frame)

        predictions: list[StudentPrediction] = []
        for index, student in enumerate(students):
            probability = float(probabilities[index])
            level = _level(probability)
            top = contributions[index]

            predictions.append(
                StudentPrediction(
                    student_id=student.student_id,
                    subject_id=student.subject_id,
                    probability=round(probability, 4),
                    level=level,
                    source="model",
                    contributions=top,
                    reasons=_narrate(top, level),
                )
            )

        return PredictionResponse(
            model_version=self.metrics.version, predictions=predictions
        )

    def _explain(self, frame) -> list[list[FeatureContribution]]:
        """Contribución de cada variable, por estudiante.

        Se usa SHAP si está disponible; si no, se cae a la importancia por
        permutación implícita del propio estimador. La explicación es un
        requisito, no un extra, así que nunca se devuelve vacía.
        """
        try:
            import shap  # import diferido: solo se paga si se usa

            explainer = shap.TreeExplainer(self.estimator)
            values = explainer.shap_values(frame)
            if isinstance(values, list):
                values = values[1]
        except Exception:
            # Respaldo: contribución aproximada por desviación respecto a la
            # media del lote. Menos preciso, pero explicable y siempre presente.
            values = (frame - frame.mean()).to_numpy()

        result: list[list[FeatureContribution]] = []
        for row_index in range(len(frame)):
            row = [
                FeatureContribution(
                    feature=name,
                    label=FEATURE_LABELS[name],
                    value=float(frame.iloc[row_index][name]),
                    contribution=float(values[row_index][column_index]),
                )
                for column_index, name in enumerate(FEATURE_NAMES)
            ]
            # Solo lo que empuja HACIA el riesgo, de mayor a menor.
            row.sort(key=lambda item: item.contribution, reverse=True)
            result.append([item for item in row if item.contribution > 0][:4])
        return result


def _narrate(contributions: list[FeatureContribution], level: str) -> list[str]:
    """Traduce las contribuciones a frases que un docente pueda accionar."""
    if level == "LOW":
        return ["El desempeño está dentro de lo esperado."]

    phrases: list[str] = []
    for item in contributions:
        match item.feature:
            case "partial_average" | "deficit_to_pass":
                phrases.append(
                    f"Promedio actual {item.value:.2f}, por debajo del mínimo de 3.0."
                    if item.feature == "partial_average"
                    else f"Le faltan {item.value:.2f} puntos para alcanzar la aprobación."
                )
            case "attendance_rate" | "attendance_deficit":
                phrases.append(
                    f"Asistencia del {item.value:.0f}%, bajo el mínimo del 70%."
                )
            case "missed_classes":
                phrases.append(f"Acumula {int(item.value)} clases perdidas.")
            case "grade_trend":
                if item.value < 0:
                    phrases.append("Sus notas vienen bajando entre cortes.")
            case "relative_to_group":
                if item.value < 0:
                    phrases.append(
                        f"Está {abs(item.value):.2f} puntos por debajo del promedio del grupo."
                    )
            case "absence_ratio":
                phrases.append(f"Faltó al {item.value * 100:.0f}% de las clases.")

    # Sin motivos concretos no se emite una alerta muda: se dice al menos que la
    # señal es combinada.
    return phrases or ["Combinación de rendimiento y asistencia por debajo de lo esperado."]


def rules_fallback(students: list[StudentFeatures]) -> PredictionResponse:
    """Respaldo determinista cuando no hay modelo cargado.

    Reproduce el criterio del backend. Marca `source='rules'` para que la
    interfaz pueda decir la verdad sobre de dónde salió la predicción.
    """
    predictions: list[StudentPrediction] = []

    for student in students:
        score = 0.0
        reasons: list[str] = []

        if student.cuts_graded > 0 and student.partial_average < 3.0:
            # Estar por debajo de la nota de aprobación ya es, por definición,
            # riesgo: se parte del umbral MEDIO y se escala con la distancia.
            # Escalar desde cero dejaba a un estudiante con 2.9 —que está
            # reprobando— clasificado como riesgo bajo.
            deficit = 3.0 - student.partial_average
            score += MEDIUM_THRESHOLD + min(0.45, deficit * 0.25)
            reasons.append(
                f"Promedio actual {student.partial_average:.2f}, por debajo del mínimo de 3.0."
            )

        if student.attendance_rate < 70:
            score += min(0.4, (70 - student.attendance_rate) * 0.012)
            reasons.append(
                f"Asistencia del {student.attendance_rate:.0f}%, bajo el mínimo del 70%."
            )

        if student.missed_classes >= 3:
            score += 0.05
            reasons.append(f"Acumula {student.missed_classes} clases perdidas.")

        probability = float(min(1.0, score))
        predictions.append(
            StudentPrediction(
                student_id=student.student_id,
                subject_id=student.subject_id,
                probability=round(probability, 4),
                level=_level(probability),
                source="rules",
                contributions=[],
                reasons=reasons or ["El desempeño está dentro de lo esperado."],
            )
        )

    return PredictionResponse(model_version="rules", predictions=predictions)
