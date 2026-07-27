from __future__ import annotations

import subprocess
import time
import sys
from pathlib import Path

import requests


def _backend_health_url() -> str:
    return "http://127.0.0.1:4000/health"


def _project_root() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parents[3]
    return Path(__file__).resolve().parents[2]


def _start_backend() -> bool:
    backend_dir = _project_root() / "backend"
    server = backend_dir / "dist" / "server.js"
    if not server.exists():
        return False
    subprocess.Popen(
        ["node", str(server)],
        cwd=str(backend_dir),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=subprocess.CREATE_NO_WINDOW,
    )
    return True


def ensure_backend_running(timeout_seconds: int = 10) -> bool:
    try:
        requests.get(_backend_health_url(), timeout=2)
        return True
    except Exception:
        pass

    if not _start_backend():
        return False

    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        try:
            response = requests.get(_backend_health_url(), timeout=2)
            if response.ok:
                return True
        except Exception:
            time.sleep(1)
    return False
