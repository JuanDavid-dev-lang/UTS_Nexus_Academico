"""El lector de horarios asigna día por columna y materia por banda.

No se genera un PDF en la prueba: lo que puede fallar es la geometría
—qué columna es cada día, dónde termina la zona de materias, a qué bloque
pertenece cada franja— y eso se prueba directo sobre los fragmentos.
"""
from app.vision.schedule import (
    Fragmento,
    SesionLeida,
    _columnas_de_dias,
    _parsear_pagina,
)


def _fragmentos_ejemplo() -> list[Fragmento]:
    # Dos columnas de día (Lunes x=120, Martes x=170) y dos materias.
    # Las celdas del lunes empiezan a la IZQUIERDA del encabezado (x=112),
    # que es el caso real que rompía el borde ingenuo.
    return [
        Fragmento("Lunes", 120, 500),
        Fragmento("Martes", 170, 500),
        # Materia 1
        Fragmento("DCB030", 60, 480),
        Fragmento("ESTADISTICA", 55, 472),
        Fragmento("Grupo : A194", 50, 464),
        Fragmento("06:00-07:29", 112, 478),
        Fragmento("202 C", 116, 470),
        Fragmento("DO", 118, 462),
        # Materia 2
        Fragmento("DDI012", 60, 440),
        Fragmento("INGLES", 55, 432),
        Fragmento("III Grupo : A194", 48, 424),
        Fragmento("07:30-08:59", 162, 438),
        Fragmento("201 C", 166, 430),
    ]


def test_columnas_por_encabezado():
    columnas = _columnas_de_dias(_fragmentos_ejemplo())
    assert columnas == {1: 120, 2: 170}


def test_dia_por_columna_y_materia_por_banda():
    fragmentos = _fragmentos_ejemplo()
    columnas = _columnas_de_dias(fragmentos)
    sesiones: list[SesionLeida] = []
    _parsear_pagina(fragmentos, columnas, sesiones, [])

    assert len(sesiones) == 2
    estadistica, ingles = sesiones[0], sesiones[1]
    if estadistica.codigo != "DCB030":
        estadistica, ingles = ingles, estadistica

    # La celda a la izquierda del encabezado del lunes sigue siendo del lunes,
    # no un pedazo del nombre de la materia.
    assert estadistica.dia == 1
    assert estadistica.hora_inicio == "06:00"
    assert estadistica.aula == "202 C"
    assert estadistica.grupo == "A194"
    assert "06:00" not in estadistica.nombre

    assert ingles.codigo == "DDI012"
    assert ingles.dia == 2
    assert ingles.hora_fin == "08:59"
    # El «III» del nombre partido por el salto de línea vuelve al nombre.
    assert "III" in ingles.nombre


def test_leyendas_no_son_aulas():
    fragmentos = _fragmentos_ejemplo()
    columnas = _columnas_de_dias(fragmentos)
    sesiones: list[SesionLeida] = []
    _parsear_pagina(fragmentos, columnas, sesiones, [])
    for sesion in sesiones:
        assert "DO" not in sesion.aula.split()
