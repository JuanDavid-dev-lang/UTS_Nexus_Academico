"""
Pruebas del lector de listados.

Se prueba el parseo de líneas, que es donde está el juicio: reconocer cada dato
por su forma en vez de por su posición. Es lo único que aguanta que el mismo
listado llegue exportado de un sistema, pegado desde Excel o fotografiado.

Lo que más importa aquí es lo que NO debe pasar: que una cabecera se cuele como
estudiante, o que una línea a medio leer se dé por buena. Una cédula inventada
no da error, crea un estudiante que no existe y lo matricula.
"""

from app.vision.roster import _lineas_a_filas, _parsear_linea


def _fila(texto: str, confianza: float = 1.0):
    return _parsear_linea(texto, 0, confianza)


class TestParseoDeLinea:
    def test_reconoce_cedula_nombre_correo_y_programa(self):
        fila = _fila("1098765432   Ana Rodríguez Peña   ana@uts.edu.co   Sistemas")

        assert fila is not None
        assert fila.cedula == "1098765432"
        assert fila.nombre == "Ana Rodríguez Peña"
        assert fila.correo == "ana@uts.edu.co"
        assert fila.programa == "Sistemas"
        assert fila.avisos == []

    def test_no_depende_del_orden_de_las_columnas(self):
        fila = _fila("ana@uts.edu.co   Ana Rodríguez   1098765432")

        assert fila is not None
        assert fila.cedula == "1098765432"
        assert fila.correo == "ana@uts.edu.co"
        assert "Ana Rodríguez" in fila.nombre

    def test_acepta_separador_de_barra_y_punto_y_coma(self):
        for separador in ("|", ";"):
            fila = _fila(f"1098765432 {separador} Ana Rodríguez {separador} Sistemas")
            assert fila is not None, separador
            assert fila.cedula == "1098765432"
            assert fila.programa == "Sistemas"

    def test_el_correo_no_se_confunde_con_el_nombre(self):
        fila = _fila("1098765432 Ana Rodríguez ana.rodriguez@correo.uts.edu.co")

        assert fila is not None
        assert fila.correo == "ana.rodriguez@correo.uts.edu.co"
        assert "@" not in fila.nombre

    def test_marca_la_fila_sin_cedula_en_vez_de_descartarla(self):
        fila = _fila("Ana Rodríguez Peña")

        # Se propone igual: el docente puede completar la cédula. Descartarla
        # en silencio haría desaparecer a un estudiante sin decir nada.
        assert fila is not None
        assert fila.cedula == ""
        assert fila.confianza <= 0.4
        assert any("cédula" in aviso.lower() for aviso in fila.avisos)

    def test_marca_el_nombre_sospechosamente_corto(self):
        fila = _fila("1098765432   Ana")

        assert fila is not None
        assert fila.confianza < 1.0
        assert fila.avisos != []

    def test_arrastra_la_confianza_del_reconocimiento(self):
        fila = _fila("1098765432   Ana Rodríguez Peña", confianza=0.55)

        assert fila is not None
        assert fila.confianza == 0.55

    def test_una_linea_sin_cedula_ni_nombre_no_es_un_estudiante(self):
        assert _fila("   ") is None
        assert _fila("---") is None

    def test_ignora_cabeceras_del_listado(self):
        for cabecera in (
            "Cédula   Nombre   Correo   Programa",
            "No.  Documento  Apellidos",
            "Página 1 de 3",
            "Total de estudiantes",
            "Firma del docente",
        ):
            assert _fila(cabecera) is None, cabecera

    def test_un_numero_corto_no_se_toma_por_cedula(self):
        fila = _fila("12   Ana Rodríguez Peña")

        assert fila is not None
        # 12 es el número de orden de la fila, no un documento.
        assert fila.cedula == ""


class TestListadoCompleto:
    def test_numera_las_filas_y_salta_las_cabeceras(self):
        lineas = [
            ("Cédula   Nombre   Programa", 1.0),
            ("1098765432   Ana Rodríguez   Sistemas", 1.0),
            ("", 1.0),
            ("1004567890   Luis Pérez   Sistemas", 1.0),
            ("Página 1 de 1", 1.0),
        ]

        filas = _lineas_a_filas(lineas)

        assert [f.cedula for f in filas] == ["1098765432", "1004567890"]
        # El índice es la posición entre los estudiantes, no en el archivo: es
        # lo que después empareja la propuesta con lo que el docente revisa.
        assert [f.indice for f in filas] == [0, 1]

    def test_un_listado_sin_estudiantes_no_inventa_ninguno(self):
        filas = _lineas_a_filas([("Cédula Nombre", 1.0), ("Total: 0", 1.0)])
        assert filas == []
