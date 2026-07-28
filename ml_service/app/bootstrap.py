"""
Datos sintéticos de arranque.

El problema real: un modelo supervisado necesita casos cerrados —estudiantes de
los que ya se sabe si reprobaron—, y una institución que estrena el sistema no
los tiene. Sin esto, el servicio no serviría de nada hasta dentro de un semestre.

La solución es arrancar el modelo imitando las reglas que hoy usa el backend
(`domains/risk/risk.service.ts`), con ruido para que no las memorice al pie de la
letra. Eso da un modelo que desde el primer día se comporta como el sistema
actual, y que a partir de ahí mejora conforme llegan resultados reales.

Es importante ser claro sobre lo que esto NO es: un modelo bootstrap no sabe
nada que las reglas no supieran. Su valor aparece cuando se reentrena con datos
reales; hasta entonces es un empate con el sistema anterior, no una mejora.
"""
from __future__ import annotations

import numpy as np

from .schemas import StudentFeatures, TrainingExample

PASSING_GRADE = 3.0
MIN_ATTENDANCE = 70.0
CRITICAL_ATTENDANCE = 60.0


def _fails_under_rules(average: float, attendance: float, missed: int) -> bool:
    """Réplica del criterio del backend para el resultado final."""
    if average < PASSING_GRADE:
        return True
    if attendance < CRITICAL_ATTENDANCE:
        return True
    # Nota justa en el límite y asistencia floja: históricamente termina mal.
    if average < PASSING_GRADE + 0.3 and attendance < MIN_ATTENDANCE:
        return True
    if missed >= 8:
        return True
    return False


def generate(samples: int = 4000, seed: int = 20260728) -> list[TrainingExample]:
    """Genera casos sintéticos plausibles y su desenlace."""
    rng = np.random.default_rng(seed)
    examples: list[TrainingExample] = []

    for index in range(samples):
        # Distribución sesgada hacia el aprobado: refleja un curso normal, donde
        # la mayoría pasa. Entrenar sobre clases balanceadas al 50% produciría un
        # modelo que sobreestima el riesgo.
        base = float(np.clip(rng.normal(3.4, 0.9), 0, 5))
        cuts_graded = int(rng.integers(1, 4))

        cuts = [0.0, 0.0, 0.0]
        for i in range(cuts_graded):
            cuts[i] = float(np.clip(rng.normal(base, 0.45), 0, 5))

        graded = [c for c in cuts if c > 0]
        partial = float(np.mean(graded)) if graded else 0.0

        attendance = float(np.clip(rng.normal(85, 14), 0, 100))
        total_classes = int(rng.integers(8, 40))
        missed = int(round(total_classes * (1 - attendance / 100)))

        group_average = float(np.clip(rng.normal(3.5, 0.35), 0, 5))

        failed = _fails_under_rules(partial, attendance, missed)

        # 8% de ruido: hay estudiantes que remontan y otros que se caen sin
        # aviso. Sin ruido, el modelo aprendería las reglas exactas y no podría
        # descubrir nada nuevo cuando lleguen datos reales.
        if rng.random() < 0.08:
            failed = not failed

        examples.append(
            TrainingExample(
                features=StudentFeatures(
                    student_id=f"synthetic-{index}",
                    subject_id="synthetic",
                    cut1=cuts[0],
                    cut2=cuts[1],
                    cut3=cuts[2],
                    cuts_graded=cuts_graded,
                    partial_average=partial,
                    attendance_rate=attendance,
                    missed_classes=missed,
                    total_classes=total_classes,
                    group_average=group_average,
                ),
                failed=failed,
            )
        )

    return examples
