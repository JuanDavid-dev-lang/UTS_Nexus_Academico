#!/usr/bin/env python3
"""Recorta las Inter empaquetadas a lo que la aplicación escribe.

Flutter **no subconjunta fuentes de texto**: `--tree-shake-icons` solo actúa
sobre las de iconos, así que un `.ttf` completo viaja entero en el APK y se
mapea en memoria al arrancar. Las Inter oficiales traen 2 852 glifos por peso
—griego, cirílico, alfabeto fonético— y esta aplicación **es solo en español**.
Sin este recorte son 1,63 MB del paquete para escribir unos 120 caracteres.

Es idempotente: volver a pasarlo sobre una fuente ya recortada da el mismo
resultado, así que se puede ejecutar sin comprobar nada antes. Ejecútalo
después de actualizar las Inter desde https://github.com/rsms/inter/releases.

    python3 flutter_app/tool/subconjuntar_fuentes.py            # recorta
    python3 flutter_app/tool/subconjuntar_fuentes.py --check    # ¿están recortadas?

Requiere `fonttools` (`pip install fonttools`).
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

FUENTES = Path(__file__).resolve().parent.parent / "assets" / "fonts"

# Latín completo, puntuación, moneda, flechas, operadores matemáticos y las
# figuras geométricas. Es más de lo que se usa hoy a propósito: un nombre
# propio con una diéresis rara o un «≥ 3,0» en una pantalla nueva no deben
# salir como un rectángulo vacío, y el margen cuesta unos pocos KB.
RANGOS = ",".join([
    "U+0000-00FF",   # latín básico y suplemento latino-1 (ñ á ¿ ¡ « » º ª)
    "U+0100-017F",   # latín extendido-A
    "U+0192", "U+02C6-02DD",
    "U+2000-206F",   # puntuación general (– — ' ' " " … • ›)
    "U+2070-209F",   # super e subíndices
    "U+20A0-20BF",   # monedas (€)
    "U+2100-214F",   # letras tipo símbolo (™ №)
    "U+2190-21BB",   # flechas (→)
    "U+2200-22FF",   # operadores matemáticos (≠ ≤ ≥ − × ÷)
    "U+2500-257F",   # dibujo de cajas
    "U+25A0-25FF",   # figuras geométricas
])

# Las que Flutter aplica por defecto más `tnum`, que es la única que la
# aplicación pide explícitamente (`FontFeature.tabularFigures`, en las horas de
# la agenda y en las columnas de notas: sin ella los dígitos bailan de ancho y
# una columna de promedios deja de estar alineada).
#
# Conservarlas todas —`--layout-features='*'`— arrastra los sets estilísticos y
# las variantes de carácter de Inter, que son 370 glifos más por peso que nadie
# pide nunca.
CARACTERISTICAS = "ccmp,liga,calt,kern,mark,mkmk,rlig,locl,tnum"

# Por encima de esto la fuente no está recortada. Una recortada ronda los 105 KB
# y la oficial los 410 KB, así que el umbral no roza ninguna de las dos.
TOPE_BYTES = 200 * 1024


def recortar(ruta: Path) -> int:
    antes = ruta.stat().st_size
    subprocess.run(
        [
            sys.executable, "-m", "fontTools.subset", str(ruta),
            f"--output-file={ruta}",
            f"--unicodes={RANGOS}",
            f"--layout-features={CARACTERISTICAS}",
            "--name-IDs=*",
            "--notdef-outline",
            "--recalc-bounds",
        ],
        check=True,
    )
    return antes - ruta.stat().st_size


def main() -> int:
    fuentes = sorted(FUENTES.glob("Inter-*.ttf"))
    if not fuentes:
        print(f"No hay fuentes en {FUENTES}", file=sys.stderr)
        return 1

    if "--check" in sys.argv:
        gordas = [f for f in fuentes if f.stat().st_size > TOPE_BYTES]
        for f in gordas:
            print(f"  sin recortar: {f.name} ({f.stat().st_size // 1024} KB)")
        if gordas:
            print("\nEjecuta: python3 flutter_app/tool/subconjuntar_fuentes.py")
            return 1
        print(f"Las {len(fuentes)} fuentes están recortadas.")
        return 0

    total = 0
    for f in fuentes:
        ahorro = recortar(f)
        total += ahorro
        print(f"  {f.name}: -{ahorro // 1024} KB  ({f.stat().st_size // 1024} KB)")
    print(f"\nAhorrados {total // 1024} KB del APK.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
