"""
Estilo global de la app. Se genera desde el sistema de diseño central
(ui/theme.py) para respetar los tokens de DESIGN.md.

Se conserva el nombre APP_STYLE por compatibilidad con los imports existentes.
"""
from ui.theme import build_stylesheet

APP_STYLE = build_stylesheet()
