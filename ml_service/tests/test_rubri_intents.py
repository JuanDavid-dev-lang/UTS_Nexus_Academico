"""Pruebas del clasificador NLP interno de Rubri."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.rubri_intents import RubriIntentClassifier  # noqa: E402


def classifier() -> RubriIntentClassifier:
    return RubriIntentClassifier.train()


def test_model_reports_required_metrics():
    metrics = classifier().metrics
    assert metrics["intents"] == 11
    assert all(name in metrics for name in ("accuracy", "precision", "recall", "f1", "confusion_matrix"))


def test_representative_phrases():
    model = classifier()
    cases = {
        "muéstrame mis alumnos": "GET_STUDENTS",
        "quiero crear una materia": "CREATE_COURSE",
        "qué clase tengo hoy": "GET_SCHEDULE",
        "subir el excel del grupo": "IMPORT_STUDENTS",
        "en qué salón tengo programación": "GET_CLASSROOM",
    }
    for phrase, expected in cases.items():
        assert model.predict(phrase).intent == expected


def test_prediction_has_confidence_and_alternatives():
    result = classifier().predict("abre mis asignaturas")
    assert result.intent == "GET_COURSES"
    assert 0 <= result.confidence <= 1
    assert len(result.alternatives) == 3

