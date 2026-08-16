"""
Pruebas del lector de planillas de notas.

Lo que más importa es lo que NO debe pasar: que una nota fuera de rango se
recorte en silencio (un «45» probablemente es un 4.5 sin punto), o que una
cabecera se cuele como estudiante. Una nota inventada no da error, escribe una
calificación equivocada en el consolidado de alguien.
"""

import pytest

from app.vision.grades import _lineas_a_planilla, _parsear_linea_notas


def _fila(texto: str, confianza: float = 1.0):
    return _parsear_linea_notas(texto, 0, confianza)


class TestParseoDeLineaDeNotas:
    def test_reconoce_cedula_nombre_y_varias_notas(self):
        fila = _fila("1098765432   Ana Rodríguez Peña   4,5   3.0")

        assert fila is not None
        assert fila.cedula == "1098765432"
        assert fila.nombre == "Ana Rodríguez Peña"
        assert fila.notas == [4.5, 3.0]
        assert fila.avisos == []

    def test_no_depende_del_orden_de_las_columnas(self):
        fila = _fila("Ana Rodríguez   4.0   1098765432")

        assert fila is not None
        assert fila.cedula == "1098765432"
        assert fila.notas == [4.0]
        assert "Ana Rodríguez" in fila.nombre

    def test_nota_fuera_de_rango_se_marca_no_se_recorta(self):
        fila = _fila("1098765432 Ana Rodríguez 45")

        assert fila is not None
        assert fila.notas == [None]
        assert any("fuera del rango" in aviso for aviso in fila.avisos)
        assert fila.confianza <= 0.5

    def test_la_cedula_no_se_confunde_con_una_nota(self):
        fila = _fila("1098765432 Ana Rodríguez 3,5")

        assert fila is not None
        assert fila.cedula == "1098765432"
        assert fila.notas == [3.5]

    def test_fila_sin_notas_se_marca(self):
        fila = _fila("1098765432 Ana Rodríguez Peña")

        assert fila is not None
        assert fila.notas == []
        assert any("Sin notas" in aviso for aviso in fila.avisos)

    def test_descarta_cabeceras(self):
        assert _fila("Cédula   Nombre   Nota 1") is None
        assert _fila("Página 1 de 2") is None


class TestPlanilla:
    def test_todas_las_filas_quedan_al_mismo_ancho(self):
        planilla = _lineas_a_planilla(
            [
                ("1098765432 Ana Rodríguez 4.0 3.0", 1.0),
                ("1098765431 Bruno Díaz 2.5", 1.0),
            ],
            origen="pdf-texto",
        )

        assert planilla.columnas == 2
        assert planilla.filas[1].notas == [2.5, None]

    def test_sin_filas_reconocibles_lanza_error(self):
        with pytest.raises(ValueError):
            _lineas_a_planilla([("Página 1 de 2", 1.0)], origen="pdf-texto")

    def test_las_dudosas_se_cuentan_en_los_avisos(self):
        planilla = _lineas_a_planilla(
            [
                ("1098765432 Ana Rodríguez 4.0", 0.5),
                ("1098765431 Bruno Díaz 2.5", 1.0),
            ],
            origen="ocr",
        )

        assert any("dudosas" in aviso for aviso in planilla.avisos)
