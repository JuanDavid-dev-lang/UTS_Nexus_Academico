"""
Lectura de una planilla de asistencia fotografiada.

La hoja tiene esta forma: primera columna la cédula, segunda el nombre, y de la
tercera en adelante una columna por fecha de clase. Las filas van ordenadas por
primer apellido.

Decisión central: la identidad sale de la CÉDULA, no del nombre. Reconocer
apellidos manuscritos falla mucho —y falla peor justo con los apellidos poco
frecuentes, que son los que más importa no confundir—; un número de siete a diez
dígitos se lee mejor y además se puede contrastar contra la matrícula, que ya
existe en la base. El nombre se lee igual, pero solo como segunda opinión: si la
cédula leída y el nombre leído apuntan a personas distintas, eso es una alerta
que una sola señal nunca habría detectado.

Las columnas de fecha no se leen como texto: se mide cuánta tinta hay en cada
celda. Distinguir un check de una equis de un garabato es un problema abierto;
distinguir "hay algo escrito" de "está vacío" es fiable.

Nada de lo que sale de aquí se guarda. Este módulo devuelve una propuesta con su
nivel de confianza, y es el docente quien la confirma o la corrige.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Optional

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# Debajo de esta proporción de píxeles oscuros, la celda se considera vacía.
# Calibrado en alto: una sombra o el pliegue del papel manchan poco, y preferimos
# proponer "no asistió" —que el docente corrige de un clic— antes que inventar
# una asistencia que nadie revisó.
UMBRAL_TINTA = 0.045

# Por debajo de esto, la celda es ambigua y se marca para revisión obligatoria.
UMBRAL_DUDA = 0.075

# Una cédula colombiana tiene entre 6 y 10 dígitos. Fuera de ese rango, el OCR
# se equivocó o esa fila no es un estudiante (una cabecera, un total).
CEDULA_MIN, CEDULA_MAX = 6, 10


@dataclass
class Celda:
    """Una casilla de asistencia ya interpretada."""

    columna: int
    presente: bool
    tinta: float
    dudosa: bool


@dataclass
class FilaLeida:
    """Una fila de la planilla tal como se leyó, antes de cruzarla con la base."""

    indice: int
    cedula: str
    cedula_confianza: float
    nombre: str
    nombre_confianza: float
    celdas: list[Celda] = field(default_factory=list)
    avisos: list[str] = field(default_factory=list)


@dataclass
class PlanillaLeida:
    filas: list[FilaLeida]
    columnas_fecha: int
    avisos: list[str]
    # Alto y ancho tras enderezar, para que el cliente pueda dibujar encima.
    alto: int
    ancho: int


def _a_gris(imagen: np.ndarray) -> np.ndarray:
    if imagen.ndim == 3:
        return cv2.cvtColor(imagen, cv2.COLOR_BGR2GRAY)
    return imagen


def enderezar(imagen: np.ndarray) -> np.ndarray:
    """
    Corrige la perspectiva de la foto.

    Una planilla fotografiada con el celular en la mano nunca sale de frente: sale
    en trapecio. Si no se corrige, las líneas de la tabla dejan de ser rectas y la
    detección de la cuadrícula falla por completo. Se busca el contorno
    cuadrilátero más grande —el borde de la hoja— y se rectifica.

    Si no aparece un cuadrilátero razonable se devuelve la imagen tal cual: es
    preferible intentar leerla algo torcida que rechazar la foto.
    """
    gris = _a_gris(imagen)
    borroso = cv2.GaussianBlur(gris, (5, 5), 0)
    bordes = cv2.Canny(borroso, 60, 180)
    bordes = cv2.dilate(bordes, np.ones((3, 3), np.uint8), iterations=1)

    contornos, _ = cv2.findContours(bordes, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contornos:
        return imagen

    area_imagen = imagen.shape[0] * imagen.shape[1]
    mayor = max(contornos, key=cv2.contourArea)
    if cv2.contourArea(mayor) < area_imagen * 0.25:
        # El contorno hallado es demasiado pequeño para ser la hoja.
        return imagen

    perimetro = cv2.arcLength(mayor, True)
    aprox = cv2.approxPolyDP(mayor, 0.02 * perimetro, True)
    if len(aprox) != 4:
        return imagen

    puntos = aprox.reshape(4, 2).astype(np.float32)
    ordenados = _ordenar_esquinas(puntos)
    (sup_izq, sup_der, inf_der, inf_izq) = ordenados

    ancho = int(max(np.linalg.norm(sup_der - sup_izq), np.linalg.norm(inf_der - inf_izq)))
    alto = int(max(np.linalg.norm(inf_izq - sup_izq), np.linalg.norm(inf_der - sup_der)))
    if ancho < 200 or alto < 200:
        return imagen

    destino = np.array(
        [[0, 0], [ancho - 1, 0], [ancho - 1, alto - 1], [0, alto - 1]], dtype=np.float32
    )
    matriz = cv2.getPerspectiveTransform(ordenados, destino)
    return cv2.warpPerspective(imagen, matriz, (ancho, alto))


def _ordenar_esquinas(puntos: np.ndarray) -> np.ndarray:
    """Ordena cuatro esquinas como superior-izq, superior-der, inferior-der, inferior-izq."""
    suma = puntos.sum(axis=1)
    diferencia = np.diff(puntos, axis=1).ravel()
    return np.array(
        [
            puntos[np.argmin(suma)],
            puntos[np.argmin(diferencia)],
            puntos[np.argmax(suma)],
            puntos[np.argmax(diferencia)],
        ],
        dtype=np.float32,
    )


def _binarizar(gris: np.ndarray) -> np.ndarray:
    """
    Umbral adaptativo.

    Un umbral fijo no sirve: la foto de un salón tiene una esquina iluminada por
    la ventana y la otra en sombra, y cualquier corte global convierte media hoja
    en negro. El adaptativo decide por vecindad.
    """
    return cv2.adaptiveThreshold(
        gris, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 25, 10
    )


def _lineas(binaria: np.ndarray, horizontal: bool) -> np.ndarray:
    """Aísla las rectas largas de la tabla erosionando con un núcleo alargado."""
    largo = binaria.shape[1] // 25 if horizontal else binaria.shape[0] // 25
    largo = max(largo, 10)
    forma = (largo, 1) if horizontal else (1, largo)
    nucleo = cv2.getStructuringElement(cv2.MORPH_RECT, forma)
    erosionada = cv2.erode(binaria, nucleo, iterations=1)
    return cv2.dilate(erosionada, nucleo, iterations=1)


def _posiciones(proyeccion: np.ndarray, minimo: int) -> list[int]:
    """Agrupa picos contiguos de una proyección en una sola coordenada."""
    activos = np.where(proyeccion > minimo)[0]
    if activos.size == 0:
        return []

    grupos: list[list[int]] = [[int(activos[0])]]
    for valor in activos[1:]:
        if valor - grupos[-1][-1] <= 3:
            grupos[-1].append(int(valor))
        else:
            grupos.append([int(valor)])
    return [int(np.mean(grupo)) for grupo in grupos]


def detectar_rejilla(imagen: np.ndarray) -> tuple[list[int], list[int]]:
    """
    Devuelve las coordenadas de las líneas horizontales y verticales de la tabla.

    Se apoya en que la planilla está impresa con cuadrícula. Si la hoja no tiene
    líneas, esto devuelve listas cortas y el llamador debe rechazar la foto en vez
    de inventarse una tabla que no existe.
    """
    gris = _a_gris(imagen)
    binaria = _binarizar(gris)

    horizontales = _lineas(binaria, horizontal=True)
    verticales = _lineas(binaria, horizontal=False)

    filas = _posiciones(horizontales.sum(axis=1) // 255, minimo=imagen.shape[1] // 3)
    columnas = _posiciones(verticales.sum(axis=0) // 255, minimo=imagen.shape[0] // 3)
    return filas, columnas


def _tinta(celda: np.ndarray) -> float:
    """
    Proporción de píxeles escritos dentro de una celda.

    Se recorta un margen antes de medir: los bordes de la celda son las propias
    líneas de la tabla, y contarlas haría que toda casilla pareciera marcada.
    """
    alto, ancho = celda.shape[:2]
    margen_v, margen_h = max(alto // 6, 2), max(ancho // 6, 2)
    interior = celda[margen_v : alto - margen_v, margen_h : ancho - margen_h]
    if interior.size == 0:
        return 0.0

    binaria = _binarizar(_a_gris(interior))
    return float(np.count_nonzero(binaria) / interior.size)


class LectorTexto:
    """
    Envoltura del OCR.

    Se carga una sola vez y de forma perezosa: el modelo tarda en inicializar y
    la mayoría de los arranques del servicio no van a leer ninguna planilla.
    Si el paquete no está instalado, el lector queda inactivo y la planilla se
    devuelve con las casillas leídas pero sin cédulas: el docente tendrá que
    escribirlas, que es peor experiencia pero no un fallo del servicio.
    """

    def __init__(self) -> None:
        self._motor = None
        self._intentado = False

    @property
    def disponible(self) -> bool:
        self._cargar()
        return self._motor is not None

    def _cargar(self) -> None:
        if self._intentado:
            return
        self._intentado = True
        try:
            from rapidocr_onnxruntime import RapidOCR

            self._motor = RapidOCR()
        except Exception as error:  # pragma: no cover - depende del entorno
            logger.warning("OCR no disponible, se leerán solo las marcas: %s", error)
            self._motor = None

    def leer(self, recorte: np.ndarray) -> tuple[str, float]:
        """Devuelve el texto reconocido y su confianza media (0 a 1)."""
        self._cargar()
        if self._motor is None or recorte.size == 0:
            return "", 0.0

        try:
            resultado, _ = self._motor(recorte)
        except Exception as error:  # pragma: no cover
            logger.warning("Fallo leyendo un recorte: %s", error)
            return "", 0.0

        if not resultado:
            return "", 0.0

        partes = [str(linea[1]) for linea in resultado]
        confianzas = [float(linea[2]) for linea in resultado if len(linea) > 2]
        media = sum(confianzas) / len(confianzas) if confianzas else 0.0
        return " ".join(partes).strip(), media


_lector = LectorTexto()


def _solo_digitos(texto: str) -> str:
    return "".join(caracter for caracter in texto if caracter.isdigit())


def leer_planilla(imagen: np.ndarray) -> PlanillaLeida:
    """
    Interpreta la foto completa.

    Devuelve una propuesta, nunca un hecho: cada fila lleva su confianza y sus
    avisos para que la pantalla de revisión pueda ordenar por "lo más dudoso
    primero" en vez de obligar a repasar cien filas iguales.
    """
    avisos: list[str] = []
    recta = enderezar(imagen)
    filas_y, columnas_x = detectar_rejilla(recta)

    if len(filas_y) < 3 or len(columnas_x) < 4:
        raise ValueError(
            "No se reconoció la cuadrícula de la planilla. "
            "Asegúrate de que la hoja salga completa, bien iluminada y sin dobleces."
        )

    # La primera fila detectada es la cabecera con las fechas; los estudiantes
    # empiezan en la siguiente.
    columnas_fecha = len(columnas_x) - 3
    if columnas_fecha < 1:
        raise ValueError("La planilla no tiene ninguna columna de fechas.")

    filas: list[FilaLeida] = []

    for indice in range(1, len(filas_y) - 1):
        arriba, abajo = filas_y[indice], filas_y[indice + 1]
        if abajo - arriba < 12:
            # Dos líneas demasiado juntas: es el grosor de un borde, no una fila.
            continue

        def recorte(desde: int, hasta: int) -> np.ndarray:
            return recta[arriba:abajo, columnas_x[desde] : columnas_x[hasta]]

        crudo_cedula, confianza_cedula = _lector.leer(recorte(0, 1))
        crudo_nombre, confianza_nombre = _lector.leer(recorte(1, 2))

        cedula = _solo_digitos(crudo_cedula)
        fila_avisos: list[str] = []

        if not cedula:
            fila_avisos.append("No se leyó la cédula.")
        elif not (CEDULA_MIN <= len(cedula) <= CEDULA_MAX):
            fila_avisos.append(
                f"La cédula leída tiene {len(cedula)} dígitos, fuera del rango esperado."
            )

        celdas: list[Celda] = []
        for columna in range(2, len(columnas_x) - 1):
            casilla = recta[arriba:abajo, columnas_x[columna] : columnas_x[columna + 1]]
            tinta = _tinta(casilla)
            celdas.append(
                Celda(
                    columna=columna - 2,
                    presente=tinta >= UMBRAL_TINTA,
                    tinta=round(tinta, 4),
                    dudosa=UMBRAL_TINTA <= tinta < UMBRAL_DUDA,
                )
            )

        filas.append(
            FilaLeida(
                indice=indice - 1,
                cedula=cedula,
                cedula_confianza=round(confianza_cedula, 3),
                nombre=crudo_nombre.strip(),
                nombre_confianza=round(confianza_nombre, 3),
                celdas=celdas,
                avisos=fila_avisos,
            )
        )

    if not _lector.disponible:
        avisos.append(
            "El reconocimiento de texto no está instalado en el servidor: se leyeron "
            "las marcas de asistencia, pero las cédulas hay que escribirlas a mano."
        )

    if not filas:
        raise ValueError("Se reconoció una tabla, pero ninguna fila con estudiantes.")

    return PlanillaLeida(
        filas=filas,
        columnas_fecha=columnas_fecha,
        avisos=avisos,
        alto=recta.shape[0],
        ancho=recta.shape[1],
    )


def decodificar(contenido: bytes) -> np.ndarray:
    """Convierte los bytes subidos en una imagen utilizable."""
    buffer = np.frombuffer(contenido, dtype=np.uint8)
    imagen = cv2.imdecode(buffer, cv2.IMREAD_COLOR)
    if imagen is None:
        raise ValueError("El archivo no es una imagen que podamos abrir.")

    # Una foto de 12 megapíxeles no mejora el reconocimiento y multiplica el
    # tiempo de proceso; por encima de 2000 px de ancho se reduce.
    if imagen.shape[1] > 2000:
        escala = 2000 / imagen.shape[1]
        nuevo = (2000, int(imagen.shape[0] * escala))
        imagen = cv2.resize(imagen, nuevo, interpolation=cv2.INTER_AREA)

    return imagen
