"""
Lectura de un listado de estudiantes desde un PDF o una foto.

Dos caminos distintos a propósito, porque los errores que cometen no se parecen:

- Un PDF institucional casi siempre trae capa de texto. Ahí no hay
  reconocimiento que pueda equivocarse: se lee el texto tal cual, y la única
  duda es cómo separar las columnas. Intentar OCR sobre un PDF que ya tiene
  texto sería cambiar un dato exacto por una conjetura.

- Una foto sí necesita OCR, con todo lo que eso implica: confundir un 1 con un
  7 en una cédula es un estudiante que no existe.

Por eso cada fila viaja con su confianza y su origen. Igual que la planilla de
asistencia, esto devuelve una PROPUESTA para que alguien la revise; no escribe
en ninguna base ni decide nada.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# Una cédula colombiana tiene entre 6 y 10 dígitos; se admite hasta 12 por si
# el listado trae un identificador institucional más largo.
_CEDULA = re.compile(r"\b(\d{6,12})\b")
_CORREO = re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b")

# Cabeceras y pies que aparecen en los listados y no son estudiantes.
_RUIDO = re.compile(
    r"^\s*(c[eé]dula|documento|identificaci[oó]n|nombre|apellidos?|correo|"
    r"e-?mail|programa|grupo|listado|p[aá]gina|total|firma|no\.?|#|item)\b",
    re.IGNORECASE,
)


@dataclass
class FilaListado:
    """Un estudiante tal como se creyó leer."""

    indice: int
    cedula: str = ""
    nombre: str = ""
    correo: str = ""
    programa: str = ""
    confianza: float = 1.0
    avisos: list[str] = field(default_factory=list)


@dataclass
class ListadoLeido:
    filas: list[FilaListado]
    origen: str  # "pdf-texto" | "ocr"
    avisos: list[str] = field(default_factory=list)


def _limpiar(texto: str) -> str:
    return re.sub(r"\s+", " ", texto).strip(" \t|;,")


def _es_ruido(linea: str) -> bool:
    if not linea or len(linea) < 4:
        return True
    return bool(_RUIDO.match(linea))


def _parsear_linea(linea: str, indice: int, confianza: float) -> FilaListado | None:
    """
    Saca cédula, nombre, correo y programa de una línea suelta.

    No se asume orden de columnas. Un listado exportado, uno pegado desde Excel
    y uno fotografiado colocan los campos en sitios distintos, así que se
    reconoce cada dato por su forma —dígitos, arroba, resto— en vez de por su
    posición. Es lo único que aguanta las tres procedencias.
    """
    original = _limpiar(linea)
    if _es_ruido(original):
        return None

    fila = FilaListado(indice=indice, confianza=confianza)
    resto = original

    correo = _CORREO.search(resto)
    if correo:
        fila.correo = correo.group(0).lower()
        resto = resto.replace(correo.group(0), " ")

    cedula = _CEDULA.search(resto)
    if cedula:
        fila.cedula = cedula.group(1)
        resto = resto.replace(cedula.group(1), " ", 1)

    # Lo que sobra son nombre y, si viene, programa. Se separan por el
    # delimitador si lo hay; si no, todo es nombre: inventar un corte por
    # posición produciría programas que nadie escribió.
    partes = [p for p in re.split(r"[|;\t]|\s{3,}", resto) if _limpiar(p)]
    if partes:
        fila.nombre = _limpiar(partes[0])
    if len(partes) > 1:
        fila.programa = _limpiar(partes[1])

    # Sin cédula ni nombre no hay estudiante que proponer.
    if not fila.cedula and not fila.nombre:
        return None

    if not fila.cedula:
        fila.avisos.append("Sin cédula reconocible")
        fila.confianza = min(fila.confianza, 0.4)
    if not fila.nombre:
        fila.avisos.append("Sin nombre reconocible")
        fila.confianza = min(fila.confianza, 0.4)
    if fila.nombre and len(fila.nombre) < 5:
        fila.avisos.append("Nombre demasiado corto; revísalo")
        fila.confianza = min(fila.confianza, 0.6)

    return fila


def _lineas_a_filas(lineas: list[tuple[str, float]]) -> list[FilaListado]:
    filas: list[FilaListado] = []
    for texto, confianza in lineas:
        fila = _parsear_linea(texto, len(filas), confianza)
        if fila is not None:
            filas.append(fila)
    return filas


def leer_pdf(contenido: bytes) -> ListadoLeido:
    """Extrae el listado de la capa de texto de un PDF."""
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
                # Confianza 1.0: no hubo reconocimiento, se leyó el texto.
                lineas.append((linea, 1.0))

    if not lineas:
        raise ValueError(
            "El PDF no tiene texto seleccionable: es una imagen escaneada. "
            "Envíalo como foto para que se lea con reconocimiento óptico."
        )

    filas = _lineas_a_filas(lineas)
    if not filas:
        raise ValueError("No se reconoció ningún estudiante en el PDF.")

    return ListadoLeido(filas=filas, origen="pdf-texto")


def leer_imagen(contenido: bytes) -> ListadoLeido:
    """Extrae el listado de una foto mediante reconocimiento óptico."""
    from .sheet import decodificar, enderezar, _lector

    if not _lector.disponible:
        raise ImportError("El lector óptico no está instalado")

    # Se endereza antes de leer, igual que la planilla: una hoja fotografiada en
    # ángulo cruza renglones y el agrupado por altura deja de funcionar.
    imagen = enderezar(decodificar(contenido))
    lineas = _lector.leer_lineas(imagen)
    filas = _lineas_a_filas(lineas)

    if not filas:
        raise ValueError(
            "No se reconoció ningún estudiante en la imagen. "
            "Prueba con más luz y la hoja lo más plana posible."
        )

    avisos = []
    dudosas = sum(1 for f in filas if f.confianza < 0.7)
    if dudosas:
        avisos.append(
            f"{dudosas} de {len(filas)} filas quedaron dudosas: revísalas antes de importar."
        )

    return ListadoLeido(filas=filas, origen="ocr", avisos=avisos)


def leer_listado(contenido: bytes, nombre_archivo: str = "") -> ListadoLeido:
    """Elige el camino según el archivo y devuelve la propuesta."""
    es_pdf = contenido[:5] == b"%PDF-" or nombre_archivo.lower().endswith(".pdf")
    return leer_pdf(contenido) if es_pdf else leer_imagen(contenido)
