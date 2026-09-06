"""
Autenticación del servicio.

Este servicio no tenía ninguna. Nueve endpoints abiertos, entre ellos
`POST /train` —que **reentrena y promueve** el modelo de riesgo, es decir,
decide qué estudiantes salen marcados en rojo en las tres aplicaciones— y los
cuatro `/vision/*`, que reciben archivos y los pasan por `opencv`, `pypdf` y
`rapidocr`. Tres parsers nativos alimentados con bytes de quien sea.

Lo único que lo acotaba era que `uvicorn` sin `--host` escucha en `127.0.0.1`.
Eso es una convención, no un cierre: un `--host 0.0.0.0` en un `docker run` o en
un script de arranque lo abre entero a la red del campus, y nada en el código lo
advierte. Una defensa que depende de que nadie escriba una bandera no es una
defensa; es una casualidad.

**El secreto es obligatorio en cuanto se escucha fuera de la loopback.** Si
`ML_HOST` no es una dirección local y no hay `ML_SHARED_SECRET`, el servicio no
arranca. En local sin secreto sigue funcionando sin configurar nada, que es lo
que hace que un `git clone` arranque.
"""
from __future__ import annotations

import hmac
import logging
import os
import sys

from fastapi import Header, HTTPException

logger = logging.getLogger(__name__)

#: Cabecera que lleva el secreto. No se usa `Authorization` para no dar a
#: entender que esto es un OAuth ni que el valor sea un token con estructura.
CABECERA = "X-ML-Secret"

#: Direcciones que no salen de la máquina.
_LOCALES = {"127.0.0.1", "::1", "localhost", ""}


def secreto_configurado() -> str:
    return os.getenv("ML_SHARED_SECRET", "").strip()


def escucha_solo_local() -> bool:
    return os.getenv("ML_HOST", "127.0.0.1").strip().lower() in _LOCALES


def validar_arranque() -> None:
    """Impide arrancar expuesto y sin secreto. Se llama en el startup."""
    if escucha_solo_local() or secreto_configurado():
        if not secreto_configurado():
            logger.warning(
                "Sin ML_SHARED_SECRET: el servicio solo acepta peticiones locales. "
                "Configura el secreto (el mismo que en backend/.env) antes de exponerlo."
            )
        return

    logger.error(
        "ML_HOST=%s escucha fuera de la loopback y no hay ML_SHARED_SECRET. "
        "El servicio NO va a arrancar: /train reentrena el modelo de riesgo y "
        "/vision/* acepta archivos, y ninguno de los dos puede quedar abierto.",
        os.getenv("ML_HOST"),
    )
    sys.exit(1)


async def exigir_secreto(x_ml_secret: str | None = Header(default=None)) -> None:
    """
    Dependencia de FastAPI para las rutas del servicio.

    Sin secreto configurado no exige nada: es el modo local de siempre. Con
    secreto configurado lo exige en **todas** las rutas que la declaren.

    La comparación es `compare_digest` y no `==` para que el tiempo de respuesta
    no diga cuántos caracteres iniciales se acertaron.
    """
    esperado = secreto_configurado()
    if not esperado:
        return

    if not x_ml_secret or not hmac.compare_digest(x_ml_secret, esperado):
        raise HTTPException(status_code=401, detail="Secreto del servicio inválido o ausente.")
