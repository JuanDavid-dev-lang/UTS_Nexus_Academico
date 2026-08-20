"""Lector del reporte de horario de Academusoft («Horario Estudiante»).

El PDF trae capa de texto, pero el DÍA de cada franja es posicional: la tabla
tiene una columna por día (Lunes…Domingo) y el texto plano pierde esa
asociación — dos franjas «06:00-07:29» idénticas pueden ser martes y viernes.
Por eso aquí no se usa ``extract_text()`` a secas sino el visitante de pypdf,
que entrega cada fragmento con sus coordenadas: la columna del encabezado más
cercana en X dice el día, y la banda en Y dice a qué materia pertenece.

Como el resto de la visión, esto solo PROPONE: devuelve sesiones con su
confianza para que el docente las revise antes de que el backend escriba nada.
"""
from __future__ import annotations

import io
import re
import unicodedata
from dataclasses import dataclass, field

RE_CODIGO = re.compile(r"^[A-Z]{2,4}\d{3}[A-Z]?$")
RE_HORA = re.compile(r"^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$")
RE_GRUPO = re.compile(r"Grupo\s*:\s*(\S+)")

DIAS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]

# Fragmentos que no son aula: las leyendas del reporte.
NO_AULA = {"DO", "RE"}


def _sin_tildes(texto: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn"
    )


@dataclass
class Fragmento:
    texto: str
    x: float
    y: float


@dataclass
class SesionLeida:
    codigo: str
    nombre: str
    grupo: str
    dia: int  # 1=Lunes … 7=Domingo
    hora_inicio: str
    hora_fin: str
    aula: str
    confianza: float
    avisos: list[str] = field(default_factory=list)


@dataclass
class HorarioLeido:
    origen: str
    avisos: list[str]
    sesiones: list[SesionLeida]


def _fragmentos_de(pagina) -> list[Fragmento]:
    """Extrae los fragmentos de texto con su posición (tm[4], tm[5])."""
    fragmentos: list[Fragmento] = []

    def visitar(texto, cm, tm, font_dict, font_size):  # noqa: ANN001
        limpio = (texto or "").strip()
        if not limpio:
            return
        # La posición real es la composición de las dos matrices: en este
        # reporte la X viaja en tm y la Y en cm (con escala 0.5). Leer solo tm
        # dejaba todas las Y en cero y la tabla entera caía en un solo bloque.
        x = cm[0] * tm[4] + cm[2] * tm[5] + cm[4]
        y = cm[1] * tm[4] + cm[3] * tm[5] + cm[5]
        fragmentos.append(Fragmento(limpio, float(x), float(y)))

    pagina.extract_text(visitor_text=visitar)
    return fragmentos


def _columnas_de_dias(fragmentos: list[Fragmento]) -> dict[int, float]:
    """Posición X del encabezado de cada día. {1..7: x}."""
    columnas: dict[int, float] = {}
    for fragmento in fragmentos:
        clave = _sin_tildes(fragmento.texto).lower()
        if clave in DIAS:
            dia = DIAS.index(clave) + 1
            # El encabezado aparece una vez; si repite (otra página), da igual.
            columnas.setdefault(dia, fragmento.x)
    return columnas


def _hora(valor: str) -> str:
    horas, minutos = valor.split(":")
    return f"{int(horas):02d}:{minutos}"


def _parsear_pagina(
    fragmentos: list[Fragmento],
    columnas: dict[int, float],
    sesiones: list[SesionLeida],
    avisos: list[str],
) -> None:
    if not columnas:
        return

    # El encabezado del día está centrado y sus celdas empiezan a la IZQUIERDA
    # de esa X: un borde pegado al encabezado se tragaba las celdas del lunes
    # dentro de la columna de materias. El borde va a media distancia entre
    # columnas, que es donde de verdad termina la zona de la materia.
    xs = sorted(columnas.values())
    espacio = min(
        (b - a for a, b in zip(xs, xs[1:]) if b - a > 1),
        default=50.0,
    )
    borde_izquierdo = xs[0] - espacio / 2

    # Bloques de materia: el código abre el bloque; su banda en Y va desde su
    # propia altura (con tolerancia hacia arriba) hasta el siguiente código.
    izquierda = sorted(
        (f for f in fragmentos if f.x < borde_izquierdo),
        key=lambda f: -f.y,
    )
    bloques: list[dict] = []
    for fragmento in izquierda:
        if RE_CODIGO.match(fragmento.texto):
            bloques.append(
                {"codigo": fragmento.texto, "y_ini": fragmento.y + 6, "nombre": [], "grupo": ""}
            )
        elif bloques:
            match = RE_GRUPO.search(fragmento.texto)
            if match:
                bloques[-1]["grupo"] = match.group(1)
                resto = RE_GRUPO.sub("", fragmento.texto).strip()
                if resto:
                    bloques[-1]["nombre"].append(resto)
            else:
                bloques[-1]["nombre"].append(fragmento.texto)

    for indice, bloque in enumerate(bloques):
        bloque["y_fin"] = bloques[indice + 1]["y_ini"] if indice + 1 < len(bloques) else -1e9

    def bloque_de(y: float) -> dict | None:
        for bloque in bloques:
            if bloque["y_fin"] < y <= bloque["y_ini"]:
                return bloque
        return None

    def dia_de(x: float) -> int:
        return min(columnas.items(), key=lambda par: abs(par[1] - x))[0]

    # Celdas de la tabla: la hora define la sesión; el aula es el fragmento
    # inmediatamente debajo en la misma columna que no sea una leyenda.
    tabla = [f for f in fragmentos if f.x >= borde_izquierdo]
    for fragmento in tabla:
        match = RE_HORA.match(fragmento.texto)
        if not match:
            continue
        bloque = bloque_de(fragmento.y)
        if bloque is None:
            continue
        dia = dia_de(fragmento.x)
        columna_x = columnas[dia]

        candidatos_aula = [
            otro
            for otro in tabla
            if otro is not fragmento
            # La ventana en X es más estrecha que la separación entre columnas
            # de días (~50): abrirla más robaría el aula del día vecino.
            and abs(otro.x - columna_x) < 22
            and fragmento.y - 20 < otro.y < fragmento.y
            and bloque_de(otro.y) is bloque
            and not RE_HORA.match(otro.texto)
            and otro.texto not in NO_AULA
        ]
        candidatos_aula.sort(key=lambda otro: -otro.y)
        aula = " ".join(c.texto for c in candidatos_aula[:2]).strip()

        sesion = SesionLeida(
            codigo=bloque["codigo"],
            nombre=" ".join(bloque["nombre"]).strip() or bloque["codigo"],
            grupo=bloque["grupo"],
            dia=dia,
            hora_inicio=_hora(match.group(1)),
            hora_fin=_hora(match.group(2)),
            aula=aula,
            confianza=1.0,
        )
        if not bloque["grupo"]:
            sesion.avisos.append("El bloque no trae grupo legible.")
            sesion.confianza = 0.8
        sesiones.append(sesion)


def leer_pdf_horario(contenido: bytes) -> HorarioLeido:
    """Extrae las sesiones del reporte de horario desde la capa de texto."""
    try:
        from pypdf import PdfReader
    except ImportError as error:  # pragma: no cover - depende del despliegue
        raise ImportError("Falta pypdf para leer PDF") from error

    lector = PdfReader(io.BytesIO(contenido))
    sesiones: list[SesionLeida] = []
    avisos: list[str] = []
    columnas: dict[int, float] = {}

    hay_texto = False
    for pagina in lector.pages:
        fragmentos = _fragmentos_de(pagina)
        if fragmentos:
            hay_texto = True
        # Los encabezados de día pueden no repetirse en páginas siguientes:
        # se reutilizan las columnas de la última página que sí los trajo.
        nuevas = _columnas_de_dias(fragmentos)
        if nuevas:
            columnas = nuevas
        _parsear_pagina(fragmentos, columnas, sesiones, avisos)

    if not hay_texto:
        raise ValueError(
            "El PDF no tiene texto seleccionable: es una imagen escaneada. "
            "Descarga el reporte de horario original de Academusoft."
        )
    if not sesiones:
        raise ValueError(
            "No se encontró la tabla de horario en el PDF. "
            "¿Es el reporte «Horario Estudiante» de Academusoft?"
        )

    # Duplicados exactos (el visitante puede repetir fragmentos en algunos PDF).
    unicas: list[SesionLeida] = []
    vistas: set[tuple] = set()
    for sesion in sesiones:
        clave = (sesion.codigo, sesion.dia, sesion.hora_inicio)
        if clave in vistas:
            continue
        vistas.add(clave)
        unicas.append(sesion)

    return HorarioLeido(origen="pdf-texto", avisos=avisos, sesiones=unicas)
