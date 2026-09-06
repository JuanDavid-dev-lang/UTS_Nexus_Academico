"""
El servicio no tenía autenticación de ningún tipo.

Nueve endpoints abiertos, entre ellos `POST /train` —que reentrena y promueve
el modelo de riesgo, es decir, decide qué estudiantes salen marcados en rojo en
las tres aplicaciones— y los cuatro `/vision/*`, que reciben archivos y los
pasan por opencv, pypdf y rapidocr. Lo único que lo acotaba era que `uvicorn`
sin `--host` escucha en 127.0.0.1: una convención, no un cierre.

Estas pruebas fijan las dos mitades de la decisión: en local sigue sin hacer
falta configurar nada (para que un `git clone` arranque), y expuesto sin
secreto **no arranca**.
"""
from __future__ import annotations

import asyncio

import pytest
from fastapi import HTTPException

from app import security


@pytest.fixture(autouse=True)
def entorno_limpio(monkeypatch):
    monkeypatch.delenv("ML_SHARED_SECRET", raising=False)
    monkeypatch.delenv("ML_HOST", raising=False)


def test_local_sin_secreto_arranca(monkeypatch):
    """Es el modo por defecto: un clon recién hecho no configura nada."""
    monkeypatch.setenv("ML_HOST", "127.0.0.1")
    security.validar_arranque()  # no lanza


@pytest.mark.parametrize("host", ["127.0.0.1", "localhost", "::1", ""])
def test_hosts_considerados_locales(monkeypatch, host):
    monkeypatch.setenv("ML_HOST", host)
    assert security.escucha_solo_local() is True


@pytest.mark.parametrize("host", ["0.0.0.0", "10.0.0.5", "192.168.1.20"])
def test_expuesto_sin_secreto_no_arranca(monkeypatch, host):
    monkeypatch.setenv("ML_HOST", host)
    with pytest.raises(SystemExit) as salida:
        security.validar_arranque()
    assert salida.value.code == 1


def test_expuesto_con_secreto_arranca(monkeypatch):
    monkeypatch.setenv("ML_HOST", "0.0.0.0")
    monkeypatch.setenv("ML_SHARED_SECRET", "un-secreto-cualquiera")
    security.validar_arranque()  # no lanza


def test_sin_secreto_configurado_no_exige_nada():
    """Modo local: la dependencia deja pasar aunque no llegue cabecera."""
    asyncio.run(security.exigir_secreto(None))


def test_secreto_correcto_pasa(monkeypatch):
    monkeypatch.setenv("ML_SHARED_SECRET", "abc123")
    asyncio.run(security.exigir_secreto("abc123"))


@pytest.mark.parametrize("enviado", [None, "", "otro", "abc12", "abc1234"])
def test_secreto_incorrecto_o_ausente_da_401(monkeypatch, enviado):
    monkeypatch.setenv("ML_SHARED_SECRET", "abc123")
    with pytest.raises(HTTPException) as error:
        asyncio.run(security.exigir_secreto(enviado))
    assert error.value.status_code == 401


def test_el_secreto_se_lee_sin_espacios(monkeypatch):
    # Un `.env` copiado a mano suele traer un espacio al final; que eso
    # rompiera la autenticación se diagnostica fatal.
    monkeypatch.setenv("ML_SHARED_SECRET", "  abc123  ")
    asyncio.run(security.exigir_secreto("abc123"))
