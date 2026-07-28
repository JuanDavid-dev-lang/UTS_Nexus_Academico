"""Pruebas del motor de riesgo."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.bootstrap import generate  # noqa: E402
from app.features import FEATURE_NAMES, to_frame, to_vector  # noqa: E402
from app.model import RiskModel, rules_fallback  # noqa: E402
from app.schemas import StudentFeatures  # noqa: E402


def student(**overrides) -> StudentFeatures:
    base = dict(
        student_id="s1",
        subject_id="m1",
        cut1=0.0,
        cut2=0.0,
        cut3=0.0,
        cuts_graded=0,
        partial_average=0.0,
        attendance_rate=100.0,
        missed_classes=0,
        total_classes=20,
        group_average=3.5,
    )
    base.update(overrides)
    return StudentFeatures(**base)


class TestFeatures:
    def test_column_order_is_stable(self):
        # El modelo aprende posiciones, no nombres: reordenar invalida los
        # modelos ya entrenados.
        frame = to_frame([student()])
        assert list(frame.columns) == FEATURE_NAMES

    def test_trend_captures_direction(self):
        rising = to_vector(student(cut1=2.0, cut2=3.0, cut3=4.0, cuts_graded=3))
        falling = to_vector(student(cut1=4.0, cut2=3.0, cut3=2.0, cuts_graded=3))

        # Mismo promedio, significado opuesto.
        assert rising["grade_trend"] > 0
        assert falling["grade_trend"] < 0

    def test_deficit_is_zero_when_passing(self):
        # No se premia ir sobrado; solo se mide a quien no llega.
        assert to_vector(student(partial_average=4.5))["deficit_to_pass"] == 0
        assert to_vector(student(partial_average=2.0))["deficit_to_pass"] == pytest.approx(1.0)

    def test_absence_ratio_survives_zero_classes(self):
        # División por cero al inicio del semestre.
        assert to_vector(student(total_classes=0, missed_classes=0))["absence_ratio"] == 0


class TestRulesFallback:
    def test_flags_low_average(self):
        result = rules_fallback([student(partial_average=1.8, cuts_graded=2)])
        prediction = result.predictions[0]

        assert prediction.level in {"MEDIUM", "HIGH"}
        assert prediction.source == "rules"
        assert any("promedio" in reason.lower() for reason in prediction.reasons)

    def test_flags_low_attendance(self):
        result = rules_fallback(
            [student(partial_average=3.6, cuts_graded=2, attendance_rate=45, missed_classes=11)]
        )
        assert result.predictions[0].level in {"MEDIUM", "HIGH"}

    def test_good_student_is_not_flagged(self):
        result = rules_fallback(
            [student(partial_average=4.3, cuts_graded=3, attendance_rate=96)]
        )
        prediction = result.predictions[0]
        assert prediction.level == "LOW"
        # Nunca una alerta muda: incluso sin riesgo hay una frase.
        assert prediction.reasons


class TestTraining:
    def test_refuses_tiny_datasets(self):
        with pytest.raises(ValueError, match="al menos 50"):
            RiskModel.train(generate(samples=10), origin="bootstrap")

    def test_refuses_single_class(self):
        examples = generate(samples=120)
        for example in examples:
            example.failed = False

        with pytest.raises(ValueError, match="mismo desenlace"):
            RiskModel.train(examples, origin="bootstrap")

    def test_bootstrap_model_is_usable(self):
        model = RiskModel.train(generate(samples=1500), origin="bootstrap")

        # Con datos sintéticos coherentes debe superar claramente al azar.
        assert model.metrics.roc_auc > 0.8
        assert model.metrics.recall > 0.6
        assert model.metrics.origin == "bootstrap"


class TestPrediction:
    @pytest.fixture(scope="class")
    def model(self):
        return RiskModel.train(generate(samples=1500), origin="bootstrap")

    def test_separates_clear_cases(self, model):
        result = model.predict(
            [
                student(
                    student_id="riesgo",
                    cut1=1.2, cut2=1.5, cuts_graded=2,
                    partial_average=1.35, attendance_rate=48, missed_classes=12,
                ),
                student(
                    student_id="sano",
                    cut1=4.4, cut2=4.6, cut3=4.5, cuts_graded=3,
                    partial_average=4.5, attendance_rate=97, missed_classes=0,
                ),
            ]
        )

        at_risk, healthy = result.predictions
        assert at_risk.probability > healthy.probability
        assert at_risk.level == "HIGH"
        assert healthy.level == "LOW"

    def test_every_risky_prediction_is_explained(self, model):
        # Requisito no negociable: nadie se marca como en riesgo sin motivo.
        result = model.predict(
            [student(partial_average=1.5, cuts_graded=2, attendance_rate=40, missed_classes=14)]
        )
        prediction = result.predictions[0]

        assert prediction.source == "model"
        assert prediction.reasons
        assert prediction.contributions

    def test_empty_input_is_safe(self, model):
        assert model.predict([]).predictions == []
