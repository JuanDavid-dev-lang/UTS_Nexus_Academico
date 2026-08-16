"""
Lectura de una planilla de notas desde un PDF o una foto.

Misma tubería que el listado de estudiantes (`roster.py`): un PDF con capa de
texto se lee tal cual (confianza 1.0, sin reconocimiento que pueda fallar) y
una foto pasa por OCR con confianza por fila. La diferencia está en el
parseo: además de cédula y nombre, cada fila trae una o varias notas 0–5.

Igual que la asistencia y el roster, esto devuelve una PROPUESTA para que el
docente la revise; no escribe en ninguna base ni decide nada. Una nota fuera
de rango no se recorta en silencio: un «45» probablemente es un 4.5 sin punto,
y recortarlo a 5 escribiría una nota que nadie puso.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field

from .roster import _CEDULA, _es_ruido, _limpiar

logger = logging.getLogger(__name__)

# Un número con coma o punto decimal, o un entero suelto. La coma es lo normal
# en una planilla colombiana escrita a mano o exportada con configuración local.
_NUMERO = re.compile(r"\b(\d{1,2}(?:[.,]\d{1,2})?)\b")


@dataclass
class FilaNotas:
    """Un estudiante con sus notas, tal como se creyó leer."""

    indice: int
    cedula: str = ""
    nombre: str = ""
    confianza: float = 1.0
    notas: list[float | None] = field(default_factory=list)
    avisos: list[str] = field(default_factory=list)


@dataclass
class PlanillaNotasLeida:
    # Nombre propio a propósito: `sheet.PlanillaLeida` ya existe y es la
    # planilla de ASISTENCIA. Compartir nombre invitaría a confundirlas.
    filas: list[FilaNotas]
    columnas: int
    origen: str  # "pdf-texto" | "ocr"
    avisos: list[str] = field(default_factory=list)


def _parsear_linea_notas(linea: str, indice: int, confianza: float) -> FilaNotas | None:
    """
    Saca cédula, nombre y notas de una línea.

    No se asume orden de columnas: la cédula se reconoce por longitud (6–12
    dígitos), las notas por ser números de 0 a 5 y el nombre por ser el resto.
    """
    original = _limpiar(linea)
    if _es_ruido(original):
        return None

    fila = FilaNotas(indice=indice, confianza=confianza)
    resto = original

    cedula = _CEDULA.search(resto)
    if cedula:
        fila.cedula = cedula.group(1)
        resto = resto.replace(cedula.group(1), " ", 1)

    # Cada número restante es candidato a nota. Se procesan de izquierda a
    # derecha para conservar el orden de las columnas.
    def _reemplazar(m: re.Match[str]) -> str:
        texto = m.group(1)
        valor = float(texto.replace(",", "."))
        if 0 <= valor <= 5:
            fila.notas.append(valor)
        else:
            fila.notas.append(None)
            fila.avisos.append(f"«{texto}» está fuera del rango 0–5; revísala.")
            fila.confianza = min(fila.confianza, 0.5)
        return " "

    resto = _NUMERO.sub(_reemplazar, resto)
    fila.nombre = _limpiar(re.sub(r"[|;\t]|\s{3,}", " ", resto))

    # Sin identidad y sin notas no hay nada que proponer.
    if not fila.cedula and not fila.nombre and not fila.notas:
        return None

    if not fila.cedula:
        fila.avisos.append("Sin cédula reconocible")
        fila.confianza = min(fila.confianza, 0.4)
    if not fila.notas:
        fila.avisos.append("Sin notas en esta fila")
        fila.confianza = min(fila.confianza, 0.6)

    return fila


def _lineas_a_planilla(lineas: list[tuple[str, float]], origen: str) -> PlanillaNotasLeida:
    filas: list[FilaNotas] = []
    for texto, confianza in lineas:
        fila = _parsear_linea_notas(texto, len(filas), confianza)
        if fila is not None:
            filas.append(fila)

    if not filas:
        raise ValueError("No se reconoció ninguna fila con cédula o notas.")

    # Todas las filas al mismo ancho: la columna N tiene que ser la misma nota
    # en todas.
    columnas = max((len(f.notas) for f in filas), default=0)
    for fila in filas:
        while len(fila.notas) < columnas:
            fila.notas.append(None)

    avisos = []
    dudosas = sum(1 for f in filas if f.confianza < 0.7)
    if dudosas:
        avisos.append(
            f"{dudosas} de {len(filas)} filas quedaron dudosas: revísalas antes de importar."
        )

    return PlanillaNotasLeida(filas=filas, columnas=columnas, origen=origen, avisos=avisos)


def leer_pdf_notas(contenido: bytes) -> PlanillaNotasLeida:
    """Extrae la planilla de la capa de texto de un PDF."""
    try:
        from pypdf import PdfReader
    except ImportError as error:  # pragma: no cover - depende del despliegue
        raise ImportError("Falta pypdf para leer PDF") from error

    import io

    lector = PdfReader(io.BytesIO(contenido))
    lineas: list[tuple[str, float]] = []
    for pagina in lector.pages:
        texto = pagina.extract_text() or ""
        for linea in texto.splitlines():
            if _limpiar(linea):
                lineas.append((linea, 1.0))

    if not lineas:
        raise ValueError(
            "El PDF no tiene texto seleccionable: es una imagen escaneada. "
            "Envíalo como foto para que se lea con reconocimiento óptico."
        )
    return _lineas_a_planilla(lineas, origen="pdf-texto")


def leer_imagen_notas(contenido: bytes) -> PlanillaNotasLeida:
    """Extrae la planilla de una foto mediante reconocimiento óptico."""
    from .sheet import decodificar, enderezar, _lector

    if not _lector.disponible:
        raise ImportError("El lector óptico no está instalado")

    imagen = enderezar(decodificar(contenido))
    lineas = _lector.leer_lineas(imagen)
    return _lineas_a_planilla(lineas, origen="ocr")


def leer_planilla_notas(contenido: bytes, nombre_archivo: str = "") -> PlanillaNotasLeida:
    """Elige el camino según el archivo y devuelve la propuesta."""
    es_pdf = contenido[:5] == b"%PDF-" or nombre_archivo.lower().endswith(".pdf")
    return leer_pdf_notas(contenido) if es_pdf else leer_imagen_notas(contenido)
