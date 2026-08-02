"""
Pruebas de la lectura de planillas.

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
        cedula = f"10987654{fila:02d}"
        cv2.putText(imagen, cedula, (x_columnas[0] + 12, arriba + 40), fuente, 1.0, (0, 0, 0), 2)
        cv2.putText(imagen, f"Apellido{fila} Nombre", (x_columnas[1] + 12, arriba + 40), fuente, 0.8, (0, 0, 0), 2)

        for columna in range(fechas):
            if (fila, columna) not in marcadas:
                continue
            izq = x_columnas[2 + columna]
            # Una equis gruesa, como la que se hace a mano.
            cv2.line(imagen, (izq + 25, arriba + 15), (izq + 85, arriba + 45), (0, 0, 0), 5)
            cv2.line(imagen, (izq + 85, arriba + 15), (izq + 25, arriba + 45), (0, 0, 0), 5)

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
