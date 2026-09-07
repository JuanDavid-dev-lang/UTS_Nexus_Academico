# -*- coding: utf-8 -*-
"""Convierte docs/UNIPLANNER_ESTADO.md en un HTML listo para imprimir.

Conversor a mano y no una biblioteca: el markdown de ese archivo lo escribimos
aquí, así que el subconjunto es conocido y cerrado —encabezados, tablas,
listas, citas, reglas, negrita, cursiva y código—. Instalar una dependencia en
el entorno del servicio de Python para maquetar un documento habría dejado ahí
un paquete que no tiene nada que ver con el modelo de riesgo.
"""
import html as _html
import io
import os
import re

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENTRADA = os.path.join(RAIZ, 'docs', 'UNIPLANNER_ESTADO.md')
SALIDA = os.path.join(RAIZ, 'docs', 'UNIPLANNER_ESTADO.html')


def en_linea(t):
    """Código, negrita y cursiva.

    El código se aparta a un marcador ANTES de tocar los asteriscos, y no se
    convierte trozo a trozo. Convirtiendo por trozos, una negrita que envuelve
    un fragmento de código —`**`código`` dice…**`— queda con la apertura en un
    trozo y el cierre en otro: no casan, y los asteriscos salen impresos.
    """
    apartados = []

    def apartar(m):
        apartados.append(m.group(1))
        return '\x00%d\x00' % (len(apartados) - 1)

    s = re.sub(r'`([^`]+)`', apartar, t)
    s = _html.escape(s)
    s = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', s)
    s = re.sub(r'(?<!\*)\*([^*]+?)\*(?!\*)', r'<em>\1</em>', s)

    def restaurar(m):
        return '<code>%s</code>' % _html.escape(apartados[int(m.group(1))])

    return re.sub(r'\x00(\d+)\x00', restaurar, s)


def celda_alineada(especificacion):
    especificacion = especificacion.strip()
    if especificacion.endswith(':') and especificacion.startswith(':'):
        return ' style="text-align:center"'
    if especificacion.endswith(':'):
        return ' style="text-align:right"'
    return ''


def convertir(md):
    lineas = md.split('\n')
    fuera, i = [], 0
    pila_lista = []

    def cerrar_listas(hasta=0):
        while len(pila_lista) > hasta:
            fuera.append('</%s>' % pila_lista.pop())

    while i < len(lineas):
        linea = lineas[i]
        desnuda = linea.strip()

        # ── Tabla ────────────────────────────────────────────────────────────
        if desnuda.startswith('|') and i + 1 < len(lineas) and \
           re.match(r'^\|[\s:|-]+\|$', lineas[i + 1].strip()):
            cerrar_listas()
            cabecera = [c.strip() for c in desnuda.strip('|').split('|')]
            alineado = [celda_alineada(c) for c in lineas[i + 1].strip().strip('|').split('|')]
            fuera.append('<table><thead><tr>')
            for j, c in enumerate(cabecera):
                fuera.append('<th%s>%s</th>' % (alineado[j] if j < len(alineado) else '', en_linea(c)))
            fuera.append('</tr></thead><tbody>')
            i += 2
            while i < len(lineas) and lineas[i].strip().startswith('|'):
                celdas = [c.strip() for c in lineas[i].strip().strip('|').split('|')]
                fuera.append('<tr>')
                for j, c in enumerate(celdas):
                    fuera.append('<td%s>%s</td>' % (alineado[j] if j < len(alineado) else '', en_linea(c)))
                fuera.append('</tr>')
                i += 1
            fuera.append('</tbody></table>')
            continue

        # ── Cita ─────────────────────────────────────────────────────────────
        if desnuda.startswith('>'):
            cerrar_listas()
            bloque = []
            while i < len(lineas) and lineas[i].strip().startswith('>'):
                bloque.append(lineas[i].strip().lstrip('>').strip())
                i += 1
            # Se juntan los párrafos ANTES de convertir. Línea a línea, una
            # cursiva o una negrita que empieza en un renglón y acaba en el
            # siguiente no casa con nada y los asteriscos salen impresos.
            parrafos, actual = [], []
            for b in bloque:
                if b:
                    actual.append(b)
                elif actual:
                    parrafos.append(' '.join(actual))
                    actual = []
            if actual:
                parrafos.append(' '.join(actual))
            fuera.append('<blockquote>%s</blockquote>' %
                         ''.join('<p>%s</p>' % en_linea(p) for p in parrafos))
            continue

        # ── Regla ────────────────────────────────────────────────────────────
        if desnuda == '---':
            cerrar_listas()
            fuera.append('<hr>')
            i += 1
            continue

        # ── Encabezados ──────────────────────────────────────────────────────
        m = re.match(r'^(#{1,4})\s+(.*)$', desnuda)
        if m:
            cerrar_listas()
            nivel = len(m.group(1))
            fuera.append('<h%d>%s</h%d>' % (nivel, en_linea(m.group(2)), nivel))
            i += 1
            continue

        # ── Listas ───────────────────────────────────────────────────────────
        m = re.match(r'^(\s*)([-*]|\d+\.)\s+(.*)$', linea)
        if m:
            sangria = len(m.group(1))
            etiqueta = 'ol' if m.group(2)[0].isdigit() else 'ul'
            nivel = sangria // 3 + 1
            if len(pila_lista) < nivel:
                fuera.append('<%s>' % etiqueta)
                pila_lista.append(etiqueta)
            elif len(pila_lista) > nivel:
                cerrar_listas(nivel)
            cuerpo = [m.group(3)]
            i += 1
            # Continuaciones sangradas del mismo punto.
            while i < len(lineas) and lineas[i].strip() and \
                  not re.match(r'^(\s*)([-*]|\d+\.)\s+', lineas[i]) and \
                  lineas[i].startswith(' '):
                cuerpo.append(lineas[i].strip())
                i += 1
            fuera.append('<li>%s</li>' % en_linea(' '.join(cuerpo)))
            continue

        # ── Párrafo ──────────────────────────────────────────────────────────
        if desnuda:
            cerrar_listas()
            bloque = []
            while i < len(lineas) and lineas[i].strip() and \
                  not lineas[i].strip().startswith(('|', '>', '#', '---')) and \
                  not re.match(r'^(\s*)([-*]|\d+\.)\s+', lineas[i]):
                bloque.append(lineas[i].strip())
                i += 1
            fuera.append('<p>%s</p>' % en_linea(' '.join(bloque)))
            continue

        cerrar_listas()
        i += 1

    cerrar_listas()
    return '\n'.join(fuera)


ESTILO = """
@page { size: A4; margin: 18mm 16mm 20mm; }
:root {
  --marca: #144d37; --lima: #cad225; --tinta: #12271e; --tinta-suave: #5b6b61;
  --borde: #d8e2d4; --fondo-sutil: #eef3ea; --alarma: #b3261e;
}
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
body {
  margin: 0; background: #fff; color: var(--tinta);
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 10.6pt; line-height: 1.6;
}
h1, h2, h3, h4 { font-family: 'Archivo', system-ui, sans-serif; line-height: 1.15; margin: 0; }
h1 {
  font-size: 27pt; font-weight: 800; letter-spacing: -.02em;
  padding-bottom: 10px; border-bottom: 3px solid var(--marca);
  margin-bottom: 6px;
}
h2 {
  font-size: 16pt; font-weight: 700; color: var(--marca);
  margin: 22px 0 8px; break-after: avoid; break-inside: avoid;
}
h3 { font-size: 12.5pt; font-weight: 700; margin: 16px 0 6px; break-after: avoid; }
p { margin: 0 0 9px; }
hr { border: 0; border-top: 1px solid var(--borde); margin: 18px 0; }
strong { font-weight: 700; }
code {
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
  font-size: .87em; background: var(--fondo-sutil);
  border-radius: 4px; padding: 1px 4px;
  overflow-wrap: anywhere;
}
blockquote p { margin: 0 0 8px; }
blockquote p:last-child { margin-bottom: 0; }
blockquote {
  margin: 0 0 14px; padding: 12px 16px;
  background: var(--fondo-sutil);
  border-left: 3px solid var(--lima);
  border-radius: 0 6px 6px 0;
  color: var(--tinta-suave); font-size: 10pt;
  break-inside: avoid;
}
ul, ol { margin: 0 0 10px; padding-left: 1.35em; }
li { margin-bottom: 5px; break-inside: avoid; }
table {
  width: 100%; border-collapse: collapse;
  margin: 4px 0 14px; font-size: 9.4pt;
  break-inside: avoid;
}
th {
  text-align: left; font-weight: 700; font-size: 8.4pt;
  letter-spacing: .04em; text-transform: uppercase;
  color: var(--marca); background: var(--fondo-sutil);
  border-bottom: 2px solid var(--borde);
  padding: 7px 9px;
}
td { padding: 7px 9px; border-bottom: 1px solid var(--borde); vertical-align: top; }
tbody tr:last-child td { border-bottom: 0; }
"""

md = io.open(ENTRADA, encoding='utf-8').read()
cuerpo = convertir(md)

html = """<!doctype html>
<html lang="es-CO">
<head>
<meta charset="utf-8">
<title>UTS Nexus — Estado de la integración con UniPlanner</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>__ESTILO__</style>
</head>
<body>
__CUERPO__
</body>
</html>
""".replace('__ESTILO__', ESTILO).replace('__CUERPO__', cuerpo)

io.open(SALIDA, 'w', encoding='utf-8', newline='\n').write(html)
print('escrito', SALIDA, len(html), 'bytes')
