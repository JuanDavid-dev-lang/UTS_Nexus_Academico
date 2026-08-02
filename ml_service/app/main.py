"""
Servicio de predicción de riesgo académico.

Sustituye los umbrales fijos de `backend/src/domains/risk/risk.service.ts`
(promedio < 3.0, asistencia < 70%) por un modelo entrenado con los datos de la
institución.

Nunca deja al backend sin respuesta: si no hay modelo cargado, responde con el
mismo criterio de reglas y lo declara en el campo `source`.
"""
from __future__ import annotations

import logging
import os

from fastapi import FastAPI, File, HTTPException, UploadFile

from .bootstrap import generate
from .model import RiskModel, rules_fallback
from .schemas import (
    HealthResponse,
    PredictionRequest,
    PredictionResponse,
    TrainingRequest,
    TrainingResponse,
)

logging.basicConfig(level=logging.INFO, format="[ml] %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(
    title="UTS Nexus — Servicio de riesgo académico",
    version="1.0.0",
    description=(
        "Predice la probabilidad de que un estudiante repruebe, con la "
        "explicación de qué variables lo determinaron."
    ),
)

#: Modelo en memoria. Se recarga al promover uno nuevo.
_model: RiskModel | None = None


@app.on_event("startup")
def load_model() -> None:
    """Carga el modelo activo; si no hay ninguno, entrena el de arranque.

    Entrenar en el arranque tarda unos segundos, pero evita que el servicio
    quede inútil en una instalación nueva. Es preferible a exigir un paso manual
    que alguien olvidará.
    """
    global _model
    _model = RiskModel.load_active()

    if _model is not None:
        logger.info(
            "Modelo %s cargado (origen: %s, recall: %.3f)",
            _model.metrics.version,
            _model.metrics.origin,
            _model.metrics.recall,
        )
        return

    if os.getenv("ML_SKIP_BOOTSTRAP") == "1":
        logger.warning("Sin modelo activo. Se responderá con reglas.")
        return

    logger.info("Sin modelo activo. Entrenando el de arranque…")
    try:
        candidate = RiskModel.train(generate(), origin="bootstrap")
        candidate.save_as_active()
        _model = candidate
        logger.info(
            "Modelo de arranque listo (recall: %.3f, AUC: %.3f). "
            "Reentrena con datos reales en cuanto cierres un semestre.",
            candidate.metrics.recall,
            candidate.metrics.roc_auc,
        )
    except Exception as error:  # noqa: BLE001
        logger.error("No se pudo entrenar el modelo de arranque: %s", error)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        ok=True,
        model_loaded=_model is not None,
        model_version=_model.metrics.version if _model else None,
        origin=_model.metrics.origin if _model else None,
    )


@app.get("/metrics")
def metrics() -> dict:
    """Métricas del modelo vigente.

    Se exponen a propósito: el docente tiene derecho a saber qué tan fiable es
    el sistema que le está señalando estudiantes.
    """
    if _model is None:
        return {"ok": False, "message": "No hay modelo entrenado; se usan reglas."}
    return {"ok": True, **_model.metrics.model_dump()}


@app.post("/predict", response_model=PredictionResponse)
def predict(request: PredictionRequest) -> PredictionResponse:
    if not request.students:
        return PredictionResponse(model_version="none", predictions=[])

    if _model is None:
        return rules_fallback(request.students)

    try:
        return _model.predict(request.students)
    except Exception as error:  # noqa: BLE001
        # Un fallo del modelo no puede dejar al docente sin información.
        logger.error("Fallo al predecir, usando reglas: %s", error)
        return rules_fallback(request.students)


@app.post("/train", response_model=TrainingResponse)
def train(request: TrainingRequest) -> TrainingResponse:
    """Entrena un candidato y lo promueve solo si mejora al vigente.

    Este es el "aprendizaje propio": el sistema mejora cuando llegan resultados
    reales, no porque sí. Un modelo nuevo que empeora se descarta.
    """
    global _model

    try:
        candidate = RiskModel.train(request.examples, origin="real")
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    incumbent = _model.metrics if _model else None

    if incumbent is None or request.force:
        candidate.save_as_active()
        _model = candidate
        return TrainingResponse(
            promoted=True,
            reason="No había modelo vigente." if incumbent is None else "Promoción forzada.",
            candidate=candidate.metrics,
            incumbent=incumbent,
        )

    # El bootstrap siempre cede ante datos reales: aunque las métricas sean
    # parecidas, un modelo entrenado con la realidad de la institución vale más
    # que uno derivado de reglas sintéticas.
    if incumbent.origin == "bootstrap":
        candidate.save_as_active()
        _model = candidate
        return TrainingResponse(
            promoted=True,
            reason="Se reemplaza el modelo de arranque por uno con datos reales.",
            candidate=candidate.metrics,
            incumbent=incumbent,
        )

    # Se compara por recall: el coste de no detectar a un estudiante en riesgo es
    # mayor que el de revisar a uno que estaba bien. El AUC desempata.
    improves = (
        candidate.metrics.recall > incumbent.recall
        or (
            abs(candidate.metrics.recall - incumbent.recall) < 0.01
            and candidate.metrics.roc_auc > incumbent.roc_auc
        )
    )

    if not improves:
        return TrainingResponse(
            promoted=False,
            reason=(
                f"El candidato no supera al vigente "
                f"(recall {candidate.metrics.recall:.3f} vs {incumbent.recall:.3f}, "
                f"AUC {candidate.metrics.roc_auc:.3f} vs {incumbent.roc_auc:.3f})."
            ),
            candidate=candidate.metrics,
            incumbent=incumbent,
        )

    candidate.save_as_active()
    _model = candidate
    return TrainingResponse(
        promoted=True,
        reason=(
            f"Mejora el recall de {incumbent.recall:.3f} a "
            f"{candidate.metrics.recall:.3f}."
        ),
        candidate=candidate.metrics,
        incumbent=incumbent,
    )


@app.post("/vision/attendance-sheet")
async def leer_planilla_asistencia(file: UploadFile = File(...)) -> dict:
    """
    Interpreta la foto de una planilla de asistencia.

    Devuelve una PROPUESTA, no un resultado: cada fila trae su confianza y sus
    avisos para que el docente la revise antes de que se guarde nada. Este
    servicio no escribe en ninguna base; solo mira una imagen y describe lo que
    cree ver.
    """
    contenido = await file.read()
    if not contenido:
        raise HTTPException(status_code=400, detail="El archivo llegó vacío.")

    # 12 MB cubre de sobra la foto de un celular; por encima es un envío erróneo.
    if len(contenido) > 12 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="La imagen supera los 12 MB.")

    try:
        from .vision import decodificar, leer_planilla

        planilla = leer_planilla(decodificar(contenido))
    except ImportError as error:
        # OpenCV ausente: el servicio sigue vivo para el resto de endpoints.
        logger.warning("Dependencias de visión no instaladas: %s", error)
        raise HTTPException(
            status_code=503,
            detail="El servidor no tiene instalado el lector de planillas.",
        ) from error
    except ValueError as error:
        # Foto ilegible: es culpa de la imagen, no del servidor.
        raise HTTPException(status_code=422, detail=str(error)) from error

    return {
        "ok": True,
        "columnasFecha": planilla.columnas_fecha,
        "fechasSugeridas": planilla.fechas_sugeridas,
        "avisos": planilla.avisos,
        "alto": planilla.alto,
        "ancho": planilla.ancho,
        "filas": [
            {
                "indice": fila.indice,
                "cedula": fila.cedula,
                "cedulaConfianza": fila.cedula_confianza,
                "nombre": fila.nombre,
                "nombreConfianza": fila.nombre_confianza,
                "avisos": fila.avisos,
                "celdas": [
                    {
                        "columna": celda.columna,
                        "presente": celda.presente,
                        "tinta": celda.tinta,
                        "dudosa": celda.dudosa,
                    }
                    for celda in fila.celdas
                ],
            }
            for fila in planilla.filas
        ],
    }
