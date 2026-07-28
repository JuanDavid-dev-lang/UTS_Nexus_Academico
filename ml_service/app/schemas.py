"""
Contratos de entrada y salida del servicio de predicción.

Se validan con pydantic para que un cambio en el backend falle aquí, con un
mensaje claro, en lugar de propagarse como una predicción silenciosamente
equivocada.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

RiskLevel = Literal["LOW", "MEDIUM", "HIGH"]


class StudentFeatures(BaseModel):
    """Señales observables de un estudiante en una materia.

    Todas provienen de datos que el backend ya calcula. No se inventan
    variables que la institución no registre.
    """

    student_id: str
    subject_id: str = ""

    # Rendimiento
    cut1: float = Field(0, ge=0, le=5, description="Nota del corte 1")
    cut2: float = Field(0, ge=0, le=5)
    cut3: float = Field(0, ge=0, le=5)
    cuts_graded: int = Field(0, ge=0, le=3, description="Cortes con al menos una nota")
    partial_average: float = Field(0, ge=0, le=5, description="Promedio de lo ya calificado")

    # Asistencia
    attendance_rate: float = Field(100, ge=0, le=100)
    missed_classes: int = Field(0, ge=0)
    total_classes: int = Field(0, ge=0)

    # Contexto del grupo: un 3.0 significa cosas distintas en un grupo con
    # promedio 4.5 que en uno con promedio 2.8.
    group_average: float = Field(0, ge=0, le=5)


class PredictionRequest(BaseModel):
    students: list[StudentFeatures]


class FeatureContribution(BaseModel):
    """Cuánto empujó cada variable hacia el riesgo, según SHAP."""

    feature: str
    label: str
    value: float
    contribution: float


class StudentPrediction(BaseModel):
    student_id: str
    subject_id: str

    probability: float = Field(ge=0, le=1, description="Probabilidad de reprobar")
    level: RiskLevel

    #: 'model' cuando predijo el modelo entrenado; 'rules' si se usó el
    #: respaldo determinista. El cliente muestra esta distinción al docente.
    source: Literal["model", "rules"]

    #: Las variables que más pesaron, de mayor a menor.
    contributions: list[FeatureContribution] = []

    #: Explicación en lenguaje natural, derivada de las contribuciones.
    reasons: list[str] = []


class PredictionResponse(BaseModel):
    model_version: str
    predictions: list[StudentPrediction]


class TrainingExample(BaseModel):
    """Un caso cerrado: las señales de un estudiante y lo que pasó de verdad."""

    features: StudentFeatures
    failed: bool = Field(description="True si finalmente reprobó")


class TrainingRequest(BaseModel):
    examples: list[TrainingExample]

    #: Si es False, el modelo nuevo solo se promueve si supera al vigente.
    force: bool = False


class ModelMetrics(BaseModel):
    version: str
    trained_at: str
    samples: int
    accuracy: float
    precision: float
    recall: float
    roc_auc: float
    #: 'bootstrap' = entrenado con datos sintéticos derivados de las reglas.
    origin: Literal["bootstrap", "real"]


class TrainingResponse(BaseModel):
    promoted: bool
    reason: str
    candidate: ModelMetrics
    incumbent: ModelMetrics | None = None


class HealthResponse(BaseModel):
    ok: bool
    model_loaded: bool
    model_version: str | None
    origin: str | None
