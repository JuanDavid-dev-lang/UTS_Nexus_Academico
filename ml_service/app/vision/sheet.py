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
import re
from dataclasses import dataclass, field
from typing import Optional

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# Debajo de esta proporción de píxeles oscuros, la celda se considera vacía.
#
# Calibrado midiendo una planilla real escrita a bolígrafo, no a ojo. Los valores
# observados fueron:
#
#     celda vacía      0.0000 – 0.0001
#     equis a mano     0.0113
#     texto escrito    0.0184 – 0.0531
#
# Es decir, hay un factor de cien entre vacío y escrito. El primer valor que puse
# —0.045— caía DENTRO del rango escrito y daba por ausente a quien sí había
# asistido: el error más grave posible aquí, porque nadie revisa una asistencia
# que el sistema dio por buena. Se sitúa en 0.004, con margen amplio a ambos
# lados: casi 3× por debajo de la equis y 40× por encima del ruido del papel.
UMBRAL_TINTA = 0.004

# Entre este valor y el anterior la marca existe pero es tenue; se propone como
# presente y además se señala, para que la revisión mire ahí primero.
UMBRAL_DUDA = 0.010

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
    # Fechas leídas de la cabecera, una por columna. `None` donde no se pudo.
    # Son sugerencias: el cliente las muestra y la persona confirma.
    fechas_sugeridas: list[Optional[str]]
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


def aplanar_iluminacion(gris: np.ndarray) -> np.ndarray:
    """
    Quita la sombra de la hoja antes de buscar nada en ella.

    Se estima el fondo con un cierre morfológico de núcleo grande —que se come
    la letra y las líneas y deja solo el degradado de luz— y se divide la imagen
    por él. Lo que queda es la hoja como si estuviera iluminada de forma pareja.

    Sin esto, la sombra de una persiana atravesando el papel produce bordes tan
    marcados como las propias líneas de la tabla, y la cuadrícula se pierde: en
    la foto que motivó este cambio se detectaban 2 líneas verticales de 4.
    """
    nucleo = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (41, 41))
    fondo = cv2.morphologyEx(gris, cv2.MORPH_CLOSE, nucleo)
    return cv2.divide(gris, fondo, scale=255)


def _binarizar(gris: np.ndarray) -> np.ndarray:
    """
    Umbral adaptativo sobre la imagen ya sin sombras.

    Un umbral fijo no sirve: la foto de un salón tiene una esquina iluminada por
    la ventana y la otra en sombra, y cualquier corte global convierte media hoja
    en negro. El adaptativo decide por vecindad.
    """
    return cv2.adaptiveThreshold(
        gris, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 25, 10
    )


def _lineas(binaria: np.ndarray, horizontal: bool) -> np.ndarray:
    """
    Aísla las rectas largas de la tabla erosionando con un núcleo alargado.

    El núcleo es corto a propósito (1/40 del lado). Una plantilla de hoja de
    cálculo impresa trae líneas gris claro y discontinuas al fotografiarlas; un
    núcleo largo exige un trazo continuo que esas líneas no tienen, y la tabla
    entera se pierde.
    """
    largo = binaria.shape[1] // 40 if horizontal else binaria.shape[0] // 40
    largo = max(largo, 8)
    forma = (largo, 1) if horizontal else (1, largo)
    nucleo = cv2.getStructuringElement(cv2.MORPH_RECT, forma)
    erosionada = cv2.erode(binaria, nucleo, iterations=1)
    return cv2.dilate(erosionada, nucleo, iterations=1)


def _posiciones(proyeccion: np.ndarray, minimo: int, separacion: int = 3) -> list[int]:
    """
    Agrupa picos contiguos de una proyección en una sola coordenada.

    `separacion` es la distancia por debajo de la cual dos picos se consideran la
    misma línea. Importa más de lo que parece: una raya a bolígrafo fotografiada
    tiene grosor, y sus dos bordes se detectan como picos separados —se vieron a
    12 px de distancia— que sin agrupar convierten una columna en dos.
    """
    activos = np.where(proyeccion > minimo)[0]
    if activos.size == 0:
        return []

    grupos: list[list[int]] = [[int(activos[0])]]
    for valor in activos[1:]:
        if valor - grupos[-1][-1] <= separacion:
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
    gris = aplanar_iluminacion(_a_gris(imagen))
    binaria = _binarizar(gris)

    horizontales = _lineas(binaria, horizontal=True)
    verticales = _lineas(binaria, horizontal=False)

    # El mínimo es 1/6 del lado, no 1/3. Una raya trazada a mano sobre papel
    # arrugado se interrumpe en los pliegues, y exigir que cubra un tercio de la
    # hoja de forma continua descarta líneas que están perfectamente visibles.
    # Las dos líneas de una misma raya se funden con una separación proporcional
    # al tamaño de la imagen, no con los 3 px fijos de antes.
    separacion_h = max(imagen.shape[0] // 100, 4)
    separacion_v = max(imagen.shape[1] // 100, 4)

    filas = _posiciones(horizontales.sum(axis=1) // 255, imagen.shape[1] // 6, separacion_h)
    columnas = _posiciones(verticales.sum(axis=0) // 255, imagen.shape[0] // 6, separacion_v)
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

    # Se espera recibir un recorte de una hoja YA aplanada. Aplanar aquí, celda a
    # celda, sale peor: el núcleo de 41 px es mayor que la propia celda y en vez
    # de quitar la sombra amplifica el ruido del papel.
    binaria = _binarizar(_a_gris(interior))
    return float(np.count_nonzero(binaria) / interior.size)


def _centro(deteccion) -> Optional[tuple[float, float]]:
    """Centro (x, y) de la caja de un fragmento, o `None` si no es utilizable."""
    try:
        puntos = deteccion[0]
        xs = [float(punto[0]) for punto in puntos]
        ys = [float(punto[1]) for punto in puntos]
        return (sum(xs) / len(xs), sum(ys) / len(ys))
    except (TypeError, IndexError, ValueError):
        return None


def ordenar_por_lectura(detecciones: list, tolerancia: float) -> list:
    """
    Reordena los fragmentos reconocidos como se leerían: por renglones, y dentro
    de cada renglón de izquierda a derecha.

    Se agrupan por cercanía vertical en vez de redondear la altura a bandas
    fijas. Redondear parece equivalente y no lo es: en una cabecera real los
    fragmentos de una misma línea caían en y=50, 51, 52.5 y 55, y el borde de la
    banda pasaba justo por en medio, así que «/2026» se separaba del resto y la
    fecha salía como «/2026 asistencia 02 /08». Agrupar por distancia no tiene
    fronteras arbitrarias donde partirse.
    """
    conCentro = [(d, _centro(d)) for d in detecciones]
    utiles = [(d, c) for d, c in conCentro if c is not None]
    if not utiles:
        return detecciones

    utiles.sort(key=lambda par: par[1][1])

    renglones: list[list[tuple]] = [[utiles[0]]]
    for deteccion, centro in utiles[1:]:
        referencia = renglones[-1][0][1][1]
        if abs(centro[1] - referencia) <= tolerancia:
            renglones[-1].append((deteccion, centro))
        else:
            renglones.append([(deteccion, centro)])

    ordenado: list = []
    for renglon in renglones:
        renglon.sort(key=lambda par: par[1][0])
        ordenado.extend(deteccion for deteccion, _ in renglon)

    # Los fragmentos sin caja se conservan al final en vez de descartarlos.
    ordenado.extend(d for d, c in conCentro if c is None)
    return ordenado


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

        # El motor devuelve los fragmentos en el orden en que los encontró, que no
        # es el orden en que están escritos: «asistencia 02/08/2026» llegaba como
        # «asistencia /08 /2026 02» y la fecha se volvía ilegible. Se reordenan
        # por posición antes de unirlos. La tolerancia sale del alto del recorte:
        # una celda de una línea tiene que agruparse entera aunque la letra vaya
        # inclinada.
        ordenado = ordenar_por_lectura(resultado, tolerancia=max(recorte.shape[0] / 3, 10))

        partes = [str(linea[1]) for linea in ordenado]
        confianzas = [float(linea[2]) for linea in ordenado if len(linea) > 2]
        media = sum(confianzas) / len(confianzas) if confianzas else 0.0
        return " ".join(partes).strip(), media

    def leer_lineas(self, imagen: np.ndarray) -> list[tuple[str, float]]:
        """
        Devuelve el texto agrupado por renglones, cada uno con su confianza.

        `leer` junta toda la página en una sola cadena, que sirve para una celda
        pero no para un listado: en una lista de estudiantes el renglón ES el
        registro, y perder esa separación deja treinta cédulas y treinta nombres
        revueltos sin forma de emparejarlos.
        """
        self._cargar()
        if self._motor is None or imagen.size == 0:
            return []

        try:
            resultado, _ = self._motor(imagen)
        except Exception as error:  # pragma: no cover
            logger.warning("Fallo leyendo la imagen: %s", error)
            return []

        if not resultado:
            return []

        # La tolerancia sale del alto de la imagen: en una hoja de treinta filas
        # los renglones están mucho más juntos que en el recorte de una celda.
        tolerancia = max(imagen.shape[0] / 60, 8)
        conCentro = [(d, _centro(d)) for d in resultado]
        utiles = [(d, c) for d, c in conCentro if c is not None]
        if not utiles:
            return []

        utiles.sort(key=lambda par: par[1][1])

        renglones: list[list[tuple]] = [[utiles[0]]]
        for deteccion, centro in utiles[1:]:
            referencia = renglones[-1][0][1][1]
            if abs(centro[1] - referencia) <= tolerancia:
                renglones[-1].append((deteccion, centro))
            else:
                renglones.append([(deteccion, centro)])

        lineas: list[tuple[str, float]] = []
        for renglon in renglones:
            renglon.sort(key=lambda par: par[1][0])
            # Separador ancho entre fragmentos: es lo que después permite
            # distinguir columnas sin conocer su posición exacta.
            texto = "   ".join(str(d[1]) for d, _ in renglon).strip()
            confianzas_fila = [float(d[2]) for d, _ in renglon if len(d) > 2]
            media_fila = (
                sum(confianzas_fila) / len(confianzas_fila) if confianzas_fila else 0.0
            )
            if texto:
                lineas.append((texto, media_fila))
        return lineas


_lector = LectorTexto()


def _solo_digitos(texto: str) -> str:
    return "".join(caracter for caracter in texto if caracter.isdigit())


# Fechas como las escribe la cabecera: «asistencia 02/08/2026», «2-8-26».
_FECHA = re.compile(r"(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{2,4})")


def extraer_fecha(texto: str) -> Optional[str]:
    """
    Saca una fecha de la cabecera de una columna y la devuelve como ISO.

    Se interpreta SIEMPRE como día/mes/año, que es la convención colombiana.
    Leer «02/08/2026» como 8 de febrero en vez de 2 de agosto guardaría medio
    semestre de asistencias con seis meses de desfase, y nadie lo notaría hasta
    que los porcentajes no cuadraran.
    """
    encontrado = _FECHA.search(texto or "")
    if not encontrado:
        return None

    dia, mes, anio = (int(parte) for parte in encontrado.groups())
    if anio < 100:
        anio += 2000
    if not (1 <= dia <= 31 and 1 <= mes <= 12 and 2000 <= anio <= 2100):
        return None

    return f"{anio:04d}-{mes:02d}-{dia:02d}"


def leer_planilla(imagen: np.ndarray) -> PlanillaLeida:
    """
    Interpreta la foto completa.

    Devuelve una propuesta, nunca un hecho: cada fila lleva su confianza y sus
    avisos para que la pantalla de revisión pueda ordenar por "lo más dudoso
    primero" en vez de obligar a repasar cien filas iguales.
    """
    avisos: list[str] = []
    recta = enderezar(imagen)

    # La hoja se aplana una sola vez, a escala de página. Sobre esta versión se
    # miden las marcas: la sombra de una persiana o el relieve de un pliegue
    # dejan de contar como tinta. El OCR sigue leyendo el original, que conserva
    # el contraste del bolígrafo.
    plano = cv2.cvtColor(aplanar_iluminacion(_a_gris(recta)), cv2.COLOR_GRAY2BGR)

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

    # Cabecera: de la tercera columna en adelante lleva la fecha de cada clase.
    cabecera_arriba, cabecera_abajo = filas_y[0], filas_y[1]
    fechas_sugeridas: list[Optional[str]] = []
    for columna in range(2, len(columnas_x) - 1):
        titulo, _ = _lector.leer(
            recta[cabecera_arriba:cabecera_abajo, columnas_x[columna] : columnas_x[columna + 1]]
        )
        fechas_sugeridas.append(extraer_fecha(titulo))

    filas: list[FilaLeida] = []
    vacias = 0

    for indice in range(1, len(filas_y) - 1):
        arriba, abajo = filas_y[indice], filas_y[indice + 1]
        if abajo - arriba < 12:
            # Dos líneas demasiado juntas: es el grosor de un borde, no una fila.
            continue

        def recorte(desde: int, hasta: int) -> np.ndarray:
            return recta[arriba:abajo, columnas_x[desde] : columnas_x[hasta]]

        # Una planilla impresa trae muchas filas de más para poder añadir gente a
        # mano. Devolverlas como "sin identificar" llenaría la pantalla de
        # revisión de basura y escondería los pocos casos que sí hay que mirar.
        identidad = plano[arriba:abajo, columnas_x[0] : columnas_x[2]]
        if _tinta(identidad) < UMBRAL_TINTA / 2:
            vacias += 1
            continue

        crudo_cedula, confianza_cedula = _lector.leer(recorte(0, 1))
        crudo_nombre, confianza_nombre = _lector.leer(recorte(1, 2))

        cedula = _solo_digitos(crudo_cedula)

        # Segundo filtro de fila vacía, y el que de verdad decide: si no hay NI
        # cédula NI nombre, ahí no hay ningún estudiante.
        #
        # No basta con mirar la tinta. En una hoja arrugada un pliegue proyecta
        # sombra y llega a medir 0.0173 mientras la equis auténtica mide 0.0048:
        # la arruga tiene más tinta aparente que la marca, así que por densidad
        # es imposible distinguirlas. Preguntar por la identidad sí funciona,
        # porque una sombra no forma dígitos ni letras. Sin este filtro, una foto
        # con pliegues proponía asistencias en filas donde no hay nadie.
        if not cedula and not crudo_nombre.strip():
            vacias += 1
            continue

        fila_avisos: list[str] = []

        if not cedula:
            fila_avisos.append("No se leyó la cédula.")
        elif not (CEDULA_MIN <= len(cedula) <= CEDULA_MAX):
            fila_avisos.append(
                f"La cédula leída tiene {len(cedula)} dígitos, fuera del rango esperado."
            )

        celdas: list[Celda] = []
        for columna in range(2, len(columnas_x) - 1):
            casilla = plano[arriba:abajo, columnas_x[columna] : columnas_x[columna + 1]]
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

    if vacias:
        avisos.append(f"Se omitieron {vacias} fila(s) en blanco de la planilla.")

    sin_fecha = sum(1 for fecha in fechas_sugeridas if fecha is None)
    if sin_fecha:
        avisos.append(
            f"No se pudo leer la fecha de {sin_fecha} columna(s) en la cabecera. "
            "Hay que indicarlas a mano."
        )

    return PlanillaLeida(
        filas=filas,
        columnas_fecha=columnas_fecha,
        avisos=avisos,
        fechas_sugeridas=fechas_sugeridas,
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
