"""
Pruebas de la lectura de planillas.

Los trazos de estas planillas sintéticas son FINOS a propósito (grosor 1). Una
versión anterior los dibujaba con grosor 2 y texto grande, y eso escondía un
problema real: con letra tan gruesa, una columna de dígitos acumula tantos
píxeles verticales como una línea de la tabla, y la detección de columnas se
disparaba a 16 en vez de 6. La letra a bolígrafo de una hoja real es mucho más
delgada. La foto manda; el sintético tiene que parecerse a ella.

Se genera una planilla sintética con OpenCV en vez de guardar una foto real: así
las pruebas corren en cualquier máquina, no dependen de un archivo binario en el
repositorio y permiten construir a propósito el caso que se quiere comprobar
—una celda marcada, otra vacía, la hoja torcida—.

Lo que NO prueban: la calidad del reconocimiento sobre fotos reales, con sombras,
arrugas y letra de verdad. Eso solo se puede medir con fotos de planillas
auténticas y hay que calibrar los umbrales contra ellas.
"""

from __future__ import annotations

import cv2
import numpy as np
import pytest

from app.vision.sheet import (
    UMBRAL_TINTA,
    _tinta,
    decodificar,
    detectar_rejilla,
    extraer_fecha,
    enderezar,
    leer_planilla,
)

ALTO_FILA = 60
ANCHO_CEDULA = 260
ANCHO_NOMBRE = 380
ANCHO_FECHA = 110


def construir_planilla(filas: int = 4, fechas: int = 3, marcadas: set[tuple[int, int]] | None = None):
    """Dibuja una planilla con cuadrícula y marca las celdas indicadas."""
    marcadas = marcadas or set()
    ancho = ANCHO_CEDULA + ANCHO_NOMBRE + ANCHO_FECHA * fechas + 40
    alto = ALTO_FILA * (filas + 1) + 40
    imagen = np.full((alto, ancho, 3), 255, dtype=np.uint8)

    x_columnas = [20, 20 + ANCHO_CEDULA, 20 + ANCHO_CEDULA + ANCHO_NOMBRE]
    for i in range(fechas):
        x_columnas.append(x_columnas[-1] + ANCHO_FECHA)
    y_filas = [20 + ALTO_FILA * i for i in range(filas + 2)]

    for x in x_columnas:
        cv2.line(imagen, (x, y_filas[0]), (x, y_filas[-1]), (0, 0, 0), 2)
    for y in y_filas:
        cv2.line(imagen, (x_columnas[0], y), (x_columnas[-1], y), (0, 0, 0), 2)

    fuente = cv2.FONT_HERSHEY_SIMPLEX
    for fila in range(filas):
        arriba = y_filas[fila + 1]
        # La sangría y los dígitos varían por fila: escritas a mano nunca quedan
        # alineadas al píxel, y alinearlas hacía que la columna de unos formara
        # una recta vertical falsa que la detección contaba como borde de tabla.
        cedula = f"{10987654 + fila * 137:08d}"
        cv2.putText(imagen, cedula, (x_columnas[0] + 12 + fila * 5, arriba + 40), fuente, 0.7, (60, 60, 110), 1)
        cv2.putText(imagen, f"Apellido{fila} Nombre", (x_columnas[1] + 12, arriba + 40), fuente, 0.6, (60, 60, 110), 1)

        for columna in range(fechas):
            if (fila, columna) not in marcadas:
                continue
            izq = x_columnas[2 + columna]
            # Una equis gruesa, como la que se hace a mano.
            cv2.line(imagen, (izq + 25, arriba + 15), (izq + 85, arriba + 45), (60, 60, 110), 2)
            cv2.line(imagen, (izq + 85, arriba + 15), (izq + 25, arriba + 45), (60, 60, 110), 2)

    return imagen


def test_detecta_la_cuadricula_completa():
    imagen = construir_planilla(filas=4, fechas=3)
    filas_y, columnas_x = detectar_rejilla(imagen)

    # 4 estudiantes + cabecera = 5 filas, que necesitan 6 líneas horizontales.
    assert len(filas_y) == 6
    # cédula + nombre + 3 fechas = 5 columnas, que necesitan 6 verticales.
    assert len(columnas_x) == 6


def test_una_celda_marcada_tiene_mas_tinta_que_una_vacia():
    imagen = construir_planilla(filas=2, fechas=2, marcadas={(0, 0)})
    _, columnas_x = detectar_rejilla(imagen)
    arriba = 20 + ALTO_FILA
    abajo = arriba + ALTO_FILA

    marcada = imagen[arriba:abajo, columnas_x[2] : columnas_x[3]]
    vacia = imagen[arriba:abajo, columnas_x[3] : columnas_x[4]]

    assert _tinta(marcada) >= UMBRAL_TINTA
    assert _tinta(vacia) < UMBRAL_TINTA


def test_lee_las_marcas_en_la_posicion_correcta():
    # Primer estudiante asiste a la 1a y la 3a; el segundo solo a la 2a.
    imagen = construir_planilla(filas=2, fechas=3, marcadas={(0, 0), (0, 2), (1, 1)})
    planilla = leer_planilla(imagen)

    assert planilla.columnas_fecha == 3
    assert len(planilla.filas) == 2

    assert [c.presente for c in planilla.filas[0].celdas] == [True, False, True]
    assert [c.presente for c in planilla.filas[1].celdas] == [False, True, False]


def test_una_hoja_sin_cuadricula_se_rechaza_en_vez_de_inventar_filas():
    blanco = np.full((600, 800, 3), 255, dtype=np.uint8)

    with pytest.raises(ValueError, match="cuadr"):
        leer_planilla(blanco)


def test_enderezar_no_rompe_una_imagen_ya_recta():
    imagen = construir_planilla(filas=3, fechas=2)
    recta = enderezar(imagen)

    # Puede recortar el margen, pero no debe deformarla ni vaciarla.
    assert recta.shape[0] > imagen.shape[0] * 0.7
    assert recta.shape[1] > imagen.shape[1] * 0.7


def test_decodificar_rechaza_lo_que_no_es_imagen():
    with pytest.raises(ValueError, match="imagen"):
        decodificar(b"esto no es un jpeg")


def test_decodificar_reduce_las_fotos_enormes():
    grande = np.full((3000, 4000, 3), 255, dtype=np.uint8)
    ok, buffer = cv2.imencode(".jpg", grande)
    assert ok

    imagen = decodificar(buffer.tobytes())
    assert imagen.shape[1] == 2000


# ── Formato real: cabecera con la fecha y filas de sobra en blanco ───────────

def construir_como_la_plantilla(filas_con_datos: int = 1, filas_totales: int = 20):
    """Reproduce la plantilla que usa el docente: 3 columnas y muchas filas vacías."""
    ancho = ANCHO_CEDULA + ANCHO_NOMBRE + ANCHO_FECHA + 40
    alto = ALTO_FILA * (filas_totales + 1) + 40
    imagen = np.full((alto, ancho, 3), 255, dtype=np.uint8)

    x = [20, 20 + ANCHO_CEDULA, 20 + ANCHO_CEDULA + ANCHO_NOMBRE]
    x.append(x[-1] + ANCHO_FECHA)
    y = [20 + ALTO_FILA * i for i in range(filas_totales + 2)]

    # Gris claro, como las líneas de una hoja de cálculo impresa.
    for vx in x:
        cv2.line(imagen, (vx, y[0]), (vx, y[-1]), (170, 170, 170), 1)
    for hy in y:
        cv2.line(imagen, (x[0], hy), (x[-1], hy), (170, 170, 170), 1)

    fuente = cv2.FONT_HERSHEY_SIMPLEX
    cv2.putText(imagen, "Cedula", (x[0] + 8, y[0] + 38), fuente, 0.7, (60, 60, 110), 1)
    cv2.putText(imagen, "Nombre", (x[1] + 8, y[0] + 38), fuente, 0.7, (60, 60, 110), 1)
    cv2.putText(imagen, "02/08/2026", (x[2] + 4, y[0] + 38), fuente, 0.5, (60, 60, 110), 1)

    for fila in range(filas_con_datos):
        arriba = y[fila + 1]
        cv2.putText(imagen, "111111111", (x[0] + 8, arriba + 40), fuente, 0.7, (60, 60, 110), 1)
        cv2.putText(imagen, "Juan David Gomez", (x[1] + 8, arriba + 40), fuente, 0.6, (60, 60, 110), 1)
        cv2.line(imagen, (x[2] + 40, arriba + 15), (x[2] + 75, arriba + 45), (60, 60, 110), 2)
        cv2.line(imagen, (x[2] + 75, arriba + 15), (x[2] + 40, arriba + 45), (60, 60, 110), 2)

    return imagen


def test_las_filas_en_blanco_no_llegan_a_la_revision():
    imagen = construir_como_la_plantilla(filas_con_datos=1, filas_totales=20)
    planilla = leer_planilla(imagen)

    # 19 filas vacías no pueden convertirse en 19 avisos de "sin identificar".
    assert len(planilla.filas) == 1
    assert any("blanco" in aviso for aviso in planilla.avisos)


def test_lee_la_marca_de_la_unica_columna():
    planilla = leer_planilla(construir_como_la_plantilla(filas_con_datos=2))

    assert planilla.columnas_fecha == 1
    assert all(fila.celdas[0].presente for fila in planilla.filas)


@pytest.mark.parametrize(
    "texto,esperado",
    [
        ("asistencia 02/08/2026", "2026-08-02"),
        ("02-08-2026", "2026-08-02"),
        ("2/8/26", "2026-08-02"),
        ("Asistencia", None),
        ("32/08/2026", None),
    ],
)
def test_la_fecha_se_lee_como_dia_mes_anio(texto, esperado):
    from app.vision.sheet import extraer_fecha

    # 02/08/2026 es 2 de agosto. Leerlo como 8 de febrero desfasaría medio
    # semestre de asistencias sin que nadie lo notara.
    assert extraer_fecha(texto) == esperado


@pytest.mark.parametrize("cuantos", [10, 20, 50])
def test_funciona_con_grupos_de_cualquier_tamano(cuantos):
    """
    Los grupos van de 10 a 50 estudiantes.

    Importa porque la foto se reduce a 2000 px de ancho: en una planilla de 50
    filas cada renglón queda mucho más fino que en una de 10, y el filtro que
    descarta "líneas demasiado juntas" podría comerse filas reales.
    """
    imagen = construir_como_la_plantilla(filas_con_datos=cuantos, filas_totales=cuantos + 3)
    planilla = leer_planilla(decodificar(cv2.imencode(".jpg", imagen)[1].tobytes()))

    assert len(planilla.filas) == cuantos
    assert all(fila.celdas[0].presente for fila in planilla.filas)


# ── Regresiones halladas con una planilla manuscrita real ───────────────────

def test_una_marca_fina_de_boligrafo_cuenta_como_asistencia():
    """
    El umbral de tinta estaba calibrado a ojo contra trazos gruesos de prueba y
    dejaba fuera una equis de bolígrafo real, que midió 0.0113. El sistema decía
    'no asistió' de alguien que sí fue: el error más grave posible aquí, porque
    una asistencia dada por buena no la revisa nadie.
    """
    imagen = np.full((120, 200, 3), 255, dtype=np.uint8)
    cv2.rectangle(imagen, (10, 10), (190, 110), (0, 0, 0), 1)
    # Grosor 2, como sale una equis a bolígrafo en una foto reducida.
    cv2.line(imagen, (80, 40), (120, 80), (40, 40, 90), 2)
    cv2.line(imagen, (120, 40), (80, 80), (40, 40, 90), 2)

    assert _tinta(imagen[12:108, 12:188]) >= UMBRAL_TINTA


def test_los_fragmentos_se_ordenan_como_se_leen():
    """
    El OCR devuelve los trozos en el orden en que los encuentra, no en el que
    están escritos. Estas coordenadas son las que devolvió de verdad la cabecera
    «asistencia 02/08/2026»: al agruparlas por bandas fijas, y=50 caía al otro
    lado de la frontera y la fecha salía como «/2026 asistencia 02 /08».
    """
    from app.vision.sheet import ordenar_por_lectura

    def caja(x, y, texto):
        return ([[x - 20, y - 10], [x + 20, y - 10], [x + 20, y + 10], [x - 20, y + 10]], texto, 0.9)

    desordenado = [
        caja(102.2, 52.5, "asistencia"),
        caja(292.0, 51.0, "/08"),
        caja(358.8, 50.0, "/2026"),
        caja(235.8, 55.0, "02"),
    ]

    leido = " ".join(d[1] for d in ordenar_por_lectura(desordenado, tolerancia=28))
    assert leido == "asistencia 02 /08 /2026"
    assert extraer_fecha(leido) == "2026-08-02"


def test_dos_renglones_no_se_mezclan_al_ordenar():
    """Un nombre largo que ocupa dos líneas debe leerse línea por línea."""
    from app.vision.sheet import ordenar_por_lectura

    def caja(x, y, texto):
        return ([[x - 20, y - 8], [x + 20, y - 8], [x + 20, y + 8], [x - 20, y + 8]], texto, 0.9)

    mezclado = [caja(200, 70, "Vargas"), caja(60, 30, "Juan"), caja(60, 70, "Gomez"), caja(200, 30, "David")]

    assert [d[1] for d in ordenar_por_lectura(mezclado, tolerancia=15)] == [
        "Juan", "David", "Gomez", "Vargas",
    ]
