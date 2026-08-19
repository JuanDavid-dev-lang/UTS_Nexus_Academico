"""Clasificador NLP interno de Rubri.

Usa TF-IDF de caracteres y regresión logística. No envía texto fuera de la
infraestructura, no consulta Internet y no conoce datos académicos: solo
clasifica intención. Backend conserva contexto, permisos y acciones.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from time import perf_counter

import joblib
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, precision_recall_fscore_support
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

ROOT = Path(__file__).resolve().parent.parent
DATASET_PATH = ROOT / "data" / "rubri_intents.json"
MODEL_PATH = ROOT / "models" / "rubri-intents.joblib"
VERSION = "rubri-intents-v3"


@dataclass(frozen=True)
class IntentResult:
    intent: str
    confidence: float
    alternatives: list[dict[str, float | str]]
    latency_ms: float


def _dataset() -> tuple[list[str], list[str]]:
    raw: dict[str, list[str]] = json.loads(DATASET_PATH.read_text(encoding="utf-8"))
    texts: list[str] = []
    labels: list[str] = []
    for intent, phrases in raw.items():
        texts.extend(phrases)
        labels.extend([intent] * len(phrases))
    return texts, labels


def _pipeline() -> Pipeline:
    return Pipeline([
        ("tfidf", TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), lowercase=True, sublinear_tf=True)),
        ("classifier", LogisticRegression(max_iter=1200, class_weight="balanced", random_state=42)),
    ])


class RubriIntentClassifier:
    def __init__(self, pipeline: Pipeline, metrics: dict[str, object]):
        self.pipeline = pipeline
        self.metrics = metrics

    @classmethod
    def train(cls) -> "RubriIntentClassifier":
        texts, labels = _dataset()
        train_x, test_x, train_y, test_y = train_test_split(
            texts, labels, test_size=0.25, random_state=42, stratify=labels,
        )
        evaluation_model = _pipeline().fit(train_x, train_y)
        predicted = evaluation_model.predict(test_x)
        precision, recall, f1, _ = precision_recall_fscore_support(
            test_y, predicted, average="macro", zero_division=0,
        )
        classes = sorted(set(labels))
        metrics: dict[str, object] = {
            "version": VERSION,
            "examples": len(texts),
            "intents": len(classes),
            "accuracy": round(float(accuracy_score(test_y, predicted)), 4),
            "precision": round(float(precision), 4),
            "recall": round(float(recall), 4),
            "f1": round(float(f1), 4),
            "labels": classes,
            "confusion_matrix": confusion_matrix(test_y, predicted, labels=classes).tolist(),
        }
        final_model = _pipeline().fit(texts, labels)
        return cls(final_model, metrics)

    @classmethod
    def load_or_train(cls) -> "RubriIntentClassifier":
        if MODEL_PATH.exists():
            saved = joblib.load(MODEL_PATH)
            if saved.get("version") == VERSION:
                return cls(saved["pipeline"], saved["metrics"])
        model = cls.train()
        MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
        temporary = MODEL_PATH.with_suffix(".tmp")
        joblib.dump({"version": VERSION, "pipeline": model.pipeline, "metrics": model.metrics}, temporary)
        temporary.replace(MODEL_PATH)
        return model

    def predict(self, message: str) -> IntentResult:
        start = perf_counter()
        probabilities: np.ndarray = self.pipeline.predict_proba([message])[0]
        classes: np.ndarray = self.pipeline.classes_
        order = np.argsort(probabilities)[::-1][:3]
        alternatives = [
            {"intent": str(classes[index]), "confidence": round(float(probabilities[index]), 4)}
            for index in order
        ]
        best = alternatives[0]
        return IntentResult(
            intent=str(best["intent"]),
            confidence=float(best["confidence"]),
            alternatives=alternatives,
            latency_ms=round((perf_counter() - start) * 1000, 2),
        )
