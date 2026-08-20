"""Lectura de planillas, listados y horarios.

Los submódulos se cargan PEREZOSAMENTE: `sheet` arrastra OpenCV y el OCR, y
con el import directo cualquier módulo del paquete —incluido el lector de
horarios, que solo necesita pypdf— quedaba rehén de esas dependencias. Un
despliegue (o una prueba) sin OpenCV debe poder leer un PDF de horario igual.
"""
from importlib import import_module

_EXPORTS = {
    "PlanillaLeida": ".sheet",
    "decodificar": ".sheet",
    "leer_planilla": ".sheet",
    "ListadoLeido": ".roster",
    "leer_listado": ".roster",
    "HorarioLeido": ".schedule",
    "leer_pdf_horario": ".schedule",
}

__all__ = list(_EXPORTS)


def __getattr__(nombre: str):
    modulo = _EXPORTS.get(nombre)
    if modulo is None:
        raise AttributeError(f"module {__name__!r} has no attribute {nombre!r}")
    return getattr(import_module(modulo, __name__), nombre)
