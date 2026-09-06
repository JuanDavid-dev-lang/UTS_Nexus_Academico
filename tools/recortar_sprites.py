#!/usr/bin/env python3
"""Recorta el fondo de los sprites de Rubri y los deja listos para los dos clientes.

Tres de los cuatro sprites llegaron de diseño **opacos**, con un fondo pastel
claro y una sombra bajo los pies; solo `neutral` venía recortado. En modo claro
no se notaba, y en modo oscuro tres de los cuatro estados de Rubri se veían
como un rectángulo pálido y el cuarto no. El estado de Rubri lo elige el
backend y los cuatro salen del mismo componente, así que la incoherencia
aparecía sola al cambiar de emoción.

**No es idempotente y no debe serlo**: espera la imagen original opaca de
diseño y se niega a tocar una que ya tenga transparencia. Volver a pasarlo
sobre un sprite ya recortado no tendría sentido — el color de un píxel
transparente no significa nada y la inundación arrancaría desde basura.

    python3 tools/recortar_sprites.py original.png happy

Requiere `numpy`, `scipy` y `Pillow`. Las cifras que justifican cada umbral
están en `docs/AUDITORIA_RECURSOS.md`; el porqué del recorte, en `docs/RUBRI.md`.
"""
from collections import deque
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

# Medido: por encima de 30 la inundación cruza el contorno y se lleva al
# personaje entero (el fondo salta del 54 % al 95 %). Pero 24 ya atraviesa los
# arcos del wifi de `offline`, que están dibujados translúcidos sobre el fondo,
# así que el margen real es mucho más estrecho de lo que sugiere el acantilado.
TOLERANCIA = 10

# Cuánto puede alejarse del fondo predicho un píxel para que se lo trague el
# segundo crecimiento. La sombra de `happy` y `sad` está en 16 de mediana y en
# 34 el percentil 90; los arcos del wifi, en 48 el percentil 10. 40 separa las
# dos cosas con margen por los dos lados.
TOLERANCIA_SOMBRA = 40

# Ancho en píxeles de la banda de suavizado donde se estima el alfa.
BANDA = 3

# Componentes opacos de este tamaño o menos son restos, no dibujo: el
# garabato suelto más pequeño de `offline` son 29 px.
MOTA_MAXIMA = 8


def _inundar(rgb: np.ndarray, tolerancia: int) -> np.ndarray:
    """Inundación desde las cuatro esquinas comparando con el vecino.

    Solo desde las esquinas y no desde todo el borde: en `happy` y en `sad` el
    personaje toca el borde inferior, así que sembrar el borde entero
    empezaría dentro del dibujo.
    """
    h, w, _ = rgb.shape
    fondo = np.zeros((h, w), bool)
    a = rgb.astype(np.int16)
    cola = deque()
    for y, x in ((0, 0), (0, w - 1), (h - 1, 0), (h - 1, w - 1)):
        if not fondo[y, x]:
            fondo[y, x] = True
            cola.append((y, x))
    while cola:
        y, x = cola.popleft()
        actual = a[y, x]
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= ny < h and 0 <= nx < w and not fondo[ny, nx]:
                if np.abs(a[ny, nx] - actual).max() <= tolerancia:
                    fondo[ny, nx] = True
                    cola.append((ny, nx))
    return fondo


def _modelo_de_fondo(rgb: np.ndarray, fondo: np.ndarray, grado: int = 3) -> np.ndarray:
    """Superficie polinómica que predice el color del fondo en cada punto.

    El ajuste es **robusto**: se repite descartando lo que se aleja más de
    2,5 sigma, porque la inundación se traga parte de la sombra y esos píxeles
    tirarían de la superficie hacia abajo justo donde hace falta precisión.
    Tras converger, el residuo sobre el fondo de verdad es de ~1 sobre 255.
    """
    h, w, _ = rgb.shape
    y, x = np.mgrid[0:h, 0:w]
    x = x / w
    y = y / h
    base = np.stack(
        [(x**i) * (y**j) for i in range(grado + 1) for j in range(grado + 1 - i)], -1
    )
    usar = fondo.copy()
    pred = np.zeros_like(rgb)
    for _ in range(6):
        muestras = base[usar]
        for c in range(3):
            coef, *_ = np.linalg.lstsq(muestras, rgb[..., c][usar], rcond=None)
            pred[..., c] = base @ coef
        residuo = np.abs(rgb - pred).max(-1)
        nuevo = fondo & (residuo <= max(2.5 * residuo[usar].std(), 3.0))
        if nuevo.sum() == usar.sum():
            break
        usar = nuevo
    return pred


def _crecer_por_residuo(fondo: np.ndarray, residuo: np.ndarray, tope: float) -> np.ndarray:
    """Sigue comiendo hacia fuera mientras el píxel siga siendo fondo.

    Es lo que retira el anillo de sombra que la inundación deja atrás: allí el
    color se aparta del degradado lo justo para frenar la comparación con el
    vecino, pero sigue estando a menos de 40 del fondo predicho.
    """
    h, w = fondo.shape
    fondo = fondo.copy()
    cola = deque(zip(*np.where(fondo)))
    while cola:
        y, x = cola.popleft()
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= ny < h and 0 <= nx < w and not fondo[ny, nx] and residuo[ny, nx] <= tope:
                fondo[ny, nx] = True
                cola.append((ny, nx))
    return fondo


def recortar(entrada: str, salida: str) -> dict:
    rgb = np.asarray(Image.open(entrada).convert("RGB")).astype(np.float64)

    fondo = _inundar(rgb.astype(np.uint8), TOLERANCIA)
    tras_inundar = fondo.mean()

    pred = _modelo_de_fondo(rgb, fondo)
    residuo = np.abs(rgb - pred).max(-1)
    fondo = _crecer_por_residuo(fondo, residuo, TOLERANCIA_SOMBRA)

    # El otro extremo de la rampa de suavizado: lo más oscuro del vecindario
    # que no sea fondo.
    sin_fondo = np.where(fondo[..., None], 255.0, rgb)
    trazo = np.stack(
        [ndimage.minimum_filter(sin_fondo[..., c], size=7) for c in range(3)], -1
    )
    alfa = np.clip(residuo / np.maximum(np.abs(trazo - pred).max(-1), 1.0), 0.0, 1.0)

    # El alfa solo se estima en la banda pegada al fondo. Más adentro el píxel
    # es opaco: aplicar la fórmula allí volvería translúcido cualquier relleno
    # claro del dibujo — el blanco del ojo, la malla del velo.
    banda = ndimage.binary_dilation(fondo, iterations=BANDA) & ~fondo
    alfa = np.where(fondo, 0.0, np.where(banda, alfa, 1.0))

    # Despejar el color: lo observado es alfa*trazo + (1-alfa)*fondo.
    seguro = np.maximum(alfa, 1e-3)[..., None]
    color = np.clip((rgb - (1 - alfa[..., None]) * pred) / seguro, 0, 255)
    color = np.where(banda[..., None], color, rgb)

    # Motas sueltas: uno o dos píxeles de fondo que sobrevivieron rodeados de
    # transparencia. No son dibujo —el garabato más pequeño son 29 px— y sobre
    # el tema oscuro se ven como puntos blancos.
    etiquetas, cuantos = ndimage.label(alfa > 0.15)
    if cuantos:
        tam = np.array(ndimage.sum(np.ones_like(etiquetas), etiquetas, range(1, cuantos + 1)))
        motas = np.isin(etiquetas, np.where(tam <= MOTA_MAXIMA)[0] + 1)
        alfa = np.where(motas, 0.0, alfa)

    Image.fromarray(
        np.dstack([color, alfa * 255.0]).round().astype(np.uint8), "RGBA"
    ).save(salida)
    return {"inundacion": tras_inundar, "final": (alfa == 0).mean()}


def exportar(entrada: str, salida: str, lado_maximo: int, calidad: int = 92) -> None:
    """Redimensiona y guarda en WebP.

    Premultiplica antes de escalar: el color de un píxel transparente no
    significa nada, y al interpolarlo con sus vecinos opacos tiñe el borde. Es
    la aureola que se acaba de quitar a mano, reintroducida por el escalado.
    """
    im = np.asarray(Image.open(entrada).convert("RGBA")).astype(np.float64)
    a = im[..., 3:4] / 255.0
    premultiplicado = Image.fromarray(
        np.dstack([im[..., :3] * a, im[..., 3]]).round().astype(np.uint8), "RGBA"
    )
    h, w = im.shape[:2]
    escala = lado_maximo / max(h, w)
    if escala < 1:
        premultiplicado = premultiplicado.resize(
            (round(w * escala), round(h * escala)), Image.LANCZOS
        )

    q = np.asarray(premultiplicado).astype(np.float64)
    a = np.maximum(q[..., 3:4] / 255.0, 1e-6)
    color = np.clip(q[..., :3] / a, 0, 255)
    Image.fromarray(
        np.dstack([color, q[..., 3]]).round().astype(np.uint8), "RGBA"
    ).save(salida, format="WEBP", quality=calidad, method=6)


# Los dos clientes llevan copia de los mismos sprites.
DESTINOS = (
    "flutter_app/assets/rubri",
    "desktop/src/assets/rubri",
)

# 384 px es 3x los 128 dp a los que el asistente del móvil dibuja el sprite más
# grande, y 2,4x los 160 px del escritorio.
LADO = 384


def main(argv: list[str]) -> int:
    import tempfile
    from pathlib import Path

    if len(argv) != 3:
        print(__doc__)
        return 2
    entrada, nombre = argv[1], argv[2]

    if "A" in Image.open(entrada).getbands():
        alfa = np.asarray(Image.open(entrada).convert("RGBA"))[..., 3]
        if (alfa < 255).any():
            print(f"{entrada} ya tiene transparencia; se esperaba el original opaco.")
            return 1

    with tempfile.TemporaryDirectory() as tmp:
        recortado = str(Path(tmp) / "recortado.png")
        info = recortar(entrada, recortado)
        for destino in DESTINOS:
            salida = str(Path(destino) / f"{nombre}.webp")
            exportar(recortado, salida, LADO)
            print(f"  {salida}  ({Path(salida).stat().st_size // 1024} KB)")
        print(f"  fondo retirado: {info['final'] * 100:.1f}% de la imagen")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
