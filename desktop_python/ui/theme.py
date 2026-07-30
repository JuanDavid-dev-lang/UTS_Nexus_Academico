"""
Sistema de diseño central — UTS Nexus Académico (escritorio).

Paleta institucional UTS: verde #144D37 como color dominante y lima #CAD225
como acento / lettering. Soporta modo claro y oscuro.

El estilo se genera desde estos tokens para garantizar consistencia
(un color = un significado).

Uso:
    from ui.theme import Theme, build_stylesheet, set_mode
    set_mode(dark=False)                 # fija la paleta activa
    app.setStyleSheet(build_stylesheet(dark=False))
    label.setStyleSheet(f"color: {Theme.TEXT_MUTED};")
"""
from __future__ import annotations


# ── Paletas (DESIGN.md §4) ────────────────────────────────────────────────
# Marca: verde #144D37 (dominante) + lima #CAD225 (acento / letra).
LIGHT = {
    "PRIMARY": "#144D37",        # Verde institucional (dominante)
    "PRIMARY_HOVER": "#1C6B4C",
    "ON_PRIMARY": "#FFFFFF",     # Texto sobre el verde
    "SECONDARY": "#CAD225",      # Lima (acento)
    "ACCENT_SECONDARY": "#999E3C",  # Oliva: hover secundario, iconos inactivos
    "TITLE": "#144D37",          # Títulos / marca
    "SUCCESS": "#16A34A",
    "WARNING": "#B45309",        # Ámbar oscuro: el #D97706 de marca no da AA
    "DANGER": "#DC2626",
    "INFO": "#0E7490",
    "BG": "#F4F7F1",             # Fondo general (tinte verde muy suave)
    "SURFACE": "#FFFFFF",
    "SURFACE_ALT": "#EAF0E6",
    "BORDER": "#D8E2D4",
    "BORDER_STRONG": "#B9CBB2",
    "TEXT": "#12271E",           # Casi negro verdoso (legible)
    "TEXT_MUTED": "#5B6B61",
    "SUCCESS_SOFT": "#DCFCE7",
    "WARNING_SOFT": "#FEF3C7",
    "DANGER_SOFT": "#FEE2E2",
    "INFO_SOFT": "#CFF4FA",
    "ACCENT_SOFT": "#F1F6CE",    # Lima suave para resaltados
}

# Escala oliva de DESIGN.md §4. El modo oscuro anterior pintaba las superficies
# con el verde institucional y la letra en lima: las capas no se distinguían y
# el texto competía con los botones. Ahora las superficies son oliva neutro y la
# lima queda reservada a la interacción.
#
# La elevación la marca el contraste tonal, nunca el acento:
# BG → SURFACE → SURFACE_ALT → BORDER.
DARK = {
    "PRIMARY": "#CAD225",        # En oscuro, la lima es el acento principal
    "PRIMARY_HOVER": "#D8E04A",
    "ON_PRIMARY": "#232922",     # Texto oliva oscuro sobre lima
    "SECONDARY": "#CAD225",
    "ACCENT_SECONDARY": "#999E3C",
    # Los títulos NO van en lima (§4 regla 4): compiten con los CTAs.
    "TITLE": "#EDEFDD",
    # Los hex canónicos de §4 están calibrados para texto sobre blanco; sobre
    # #33332A caen a 2.4–4.0:1, por debajo del 4.5:1 que exigen §4 regla 5
    # y §15. Se aclaran conservando el significado.
    "SUCCESS": "#4ADE80",
    "WARNING": "#FBBF24",
    "DANGER": "#F87171",
    "INFO": "#38BDF8",
    "BG": "#232922",             # Fondo base
    "SURFACE": "#33332A",        # Cards / paneles (elevación 1)
    "SURFACE_ALT": "#37382C",    # Flotantes / cabeceras (elevación 2)
    "BORDER": "#43442F",         # #696B3E al 30% sobre la superficie de card
    "BORDER_STRONG": "#696B3E",
    "TEXT": "#EDEFDD",           # Crema-lima, no lima puro
    "TEXT_MUTED": "#A6AA8A",
    "SUCCESS_SOFT": "#1C3B23",
    "WARNING_SOFT": "#40320F",
    "DANGER_SOFT": "#43201D",
    "INFO_SOFT": "#123A44",
    "ACCENT_SOFT": "#3A3D1C",
}


class Theme:
    """Tokens de diseño. Los colores reflejan la paleta ACTIVA (ver set_mode).

    Se inicializan en modo claro; llama a set_mode() para cambiarlos.
    """

    # Colores (se sobrescriben en set_mode)
    PRIMARY = LIGHT["PRIMARY"]
    PRIMARY_HOVER = LIGHT["PRIMARY_HOVER"]
    ON_PRIMARY = LIGHT["ON_PRIMARY"]
    SECONDARY = LIGHT["SECONDARY"]
    ACCENT_SECONDARY = LIGHT["ACCENT_SECONDARY"]
    TITLE = LIGHT["TITLE"]
    SUCCESS = LIGHT["SUCCESS"]
    WARNING = LIGHT["WARNING"]
    DANGER = LIGHT["DANGER"]
    INFO = LIGHT["INFO"]
    BG = LIGHT["BG"]
    SURFACE = LIGHT["SURFACE"]
    SURFACE_ALT = LIGHT["SURFACE_ALT"]
    BORDER = LIGHT["BORDER"]
    BORDER_STRONG = LIGHT["BORDER_STRONG"]
    TEXT = LIGHT["TEXT"]
    TEXT_MUTED = LIGHT["TEXT_MUTED"]
    SUCCESS_SOFT = LIGHT["SUCCESS_SOFT"]
    WARNING_SOFT = LIGHT["WARNING_SOFT"]
    DANGER_SOFT = LIGHT["DANGER_SOFT"]
    INFO_SOFT = LIGHT["INFO_SOFT"]
    ACCENT_SOFT = LIGHT["ACCENT_SOFT"]

    # Tipografía (DESIGN.md §5). Inter primero, Roboto como respaldo declarado.
    # load_fonts() la registra desde assets/, así que la familia resuelve aunque
    # no esté instalada en el sistema.
    FONT_FAMILY = "Inter, Roboto, 'Segoe UI', sans-serif"
    FS_H1 = 36      # Título de página
    FS_H2 = 30      # Sección principal
    FS_H3 = 24      # Subsección / título de tarjeta
    FS_BODY = 16    # Texto general
    FS_CAPTION = 13  # Metadatos, etiquetas, notas al pie

    # Espaciado y radios (DESIGN.md §7)
    SPACE_PAGE = 24
    SPACE_GAP = 16
    RADIUS_CARD = 18
    RADIUS_INPUT = 12
    RADIUS_PILL = 999


def load_fonts() -> bool:
    """Registra Inter desde assets/ para que la familia resuelva de verdad.

    Sin esto `FONT_FAMILY` es una declaración muerta: Qt cae al primer nombre
    que exista en el sistema, que en Windows es Segoe UI. Se empaqueta en vez de
    depender de una instalación previa porque la app se usa en equipos del
    campus donde nadie instala tipografías.

    Devuelve True si se registró al menos un peso. Si no, la app sigue
    funcionando con el respaldo del sistema — una fuente ausente no es motivo
    para no arrancar.
    """
    import sys
    from pathlib import Path

    from PySide6.QtGui import QFontDatabase

    # Empaquetado con PyInstaller los datos viven en _MEIPASS, no junto al
    # fuente; ejecutando desde el repositorio, dos niveles por encima de ui/.
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent.parent))
    fonts_dir = base / "assets" / "fonts"
    loaded = 0
    for path in sorted(fonts_dir.glob("Inter-*.ttf")):
        if QFontDatabase.addApplicationFont(str(path)) != -1:
            loaded += 1
    return loaded > 0


def set_mode(dark: bool) -> None:
    """Fija la paleta activa (actualiza los atributos de Theme)."""
    palette = DARK if dark else LIGHT
    for key, value in palette.items():
        setattr(Theme, key, value)


def risk_palette(nivel: str) -> tuple[str, str, str]:
    """(color, fondo_suave, emoji) para un nivel de riesgo (DESIGN.md §12)."""
    n = (nivel or "").upper()
    if n in ("ALTO", "HIGH"):
        return Theme.DANGER, Theme.DANGER_SOFT, "🔴"
    if n in ("MEDIO", "MEDIUM"):
        return Theme.WARNING, Theme.WARNING_SOFT, "🟡"
    return Theme.SUCCESS, Theme.SUCCESS_SOFT, "🟢"


def build_stylesheet(dark: bool = False) -> str:
    """Genera el QSS completo de la aplicación para la paleta indicada."""
    p = DARK if dark else LIGHT
    return f"""
/* ── Base ──────────────────────────────────────────────────────────── */
QMainWindow, QWidget {{
    background: {p['BG']};
    color: {p['TEXT']};
    font-family: {Theme.FONT_FAMILY};
    font-size: {Theme.FS_BODY}px;
}}

/* ── Contenedores ──────────────────────────────────────────────────── */
QFrame#Sidebar {{
    background: {p['SURFACE']};
    border: 1px solid {p['BORDER']};
    border-radius: {Theme.RADIUS_CARD}px;
}}

QFrame#TopBar, QFrame#Card, QFrame#Surface,
QFrame#HeroCard, QFrame#MetricCard, QFrame#FilterCard, QFrame#ActionCard {{
    background: {p['SURFACE']};
    border: 1px solid {p['BORDER']};
    border-radius: {Theme.RADIUS_CARD}px;
}}

QFrame#MetricCard {{
    min-height: 92px;
}}

/* ── Tipografía / etiquetas ────────────────────────────────────────── */
QLabel#AppTitle {{
    font-size: {Theme.FS_H3}px;
    font-weight: 700;
    color: {p['TITLE']};
}}

/* Título de la página activa (§5 H1). Solo hay uno por pantalla. */
QLabel#PageTitle {{
    font-size: {Theme.FS_H1}px;
    font-weight: 800;
    color: {p['TITLE']};
}}

/* Encabezado de una sección dentro de la página (§5 H2). */
QLabel#SectionTitle {{
    font-size: {Theme.FS_H2}px;
    font-weight: 700;
    color: {p['TITLE']};
}}

QLabel#SectionSubtitle {{
    color: {p['TEXT_MUTED']};
    font-size: {Theme.FS_CAPTION}px;
}}

QLabel#MetricLabel {{
    color: {p['TEXT_MUTED']};
    font-size: {Theme.FS_CAPTION}px;
    text-transform: uppercase;
    letter-spacing: 1px;
}}

QLabel#MetricValue {{
    font-size: {Theme.FS_H2}px;
    font-weight: 800;
    color: {p['TEXT']};
}}

QLabel#MetricHint {{
    color: {p['TEXT_MUTED']};
    font-size: {Theme.FS_CAPTION}px;
}}

QLabel#Muted {{
    color: {p['TEXT_MUTED']};
}}

/* ── Botones ───────────────────────────────────────────────────────── */
QPushButton {{
    background: {p['SURFACE']};
    color: {p['TEXT']};
    border: 1px solid {p['BORDER']};
    padding: 10px 14px;
    border-radius: {Theme.RADIUS_INPUT}px;
}}

QPushButton:hover {{
    background: {p['SURFACE_ALT']};
    border: 1px solid {p['PRIMARY']};
}}

QPushButton:checked {{
    background: {p['PRIMARY']};
    color: {p['ON_PRIMARY']};
    border: 1px solid {p['PRIMARY']};
    font-weight: 700;
}}

QPushButton#Primary {{
    background: {p['PRIMARY']};
    color: {p['ON_PRIMARY']};
    border: none;
    font-weight: 700;
}}

QPushButton#Primary:hover {{
    background: {p['PRIMARY_HOVER']};
}}

QPushButton#Danger {{
    background: {p['DANGER']};
    color: #FFFFFF;
    border: none;
    font-weight: 700;
}}

/* ── Campos de entrada ─────────────────────────────────────────────── */
QLineEdit, QTextEdit, QTableWidget, QListWidget {{
    background: {p['SURFACE']};
    color: {p['TEXT']};
    border: 1px solid {p['BORDER']};
    border-radius: {Theme.RADIUS_INPUT}px;
    padding: 10px 12px;
    selection-background-color: {p['PRIMARY']};
    selection-color: {p['ON_PRIMARY']};
}}

QLineEdit:focus, QTextEdit:focus {{
    border: 1px solid {p['PRIMARY']};
}}

QComboBox, QDateEdit, QSpinBox, QDoubleSpinBox {{
    background: {p['SURFACE']};
    color: {p['TEXT']};
    border: 1px solid {p['BORDER']};
    border-radius: {Theme.RADIUS_INPUT}px;
    padding: 10px 12px;
    min-height: 18px;
}}

QComboBox:focus, QDateEdit:focus, QSpinBox:focus, QDoubleSpinBox:focus {{
    border: 1px solid {p['PRIMARY']};
}}

QComboBox::drop-down {{
    border: none;
    width: 20px;
}}

QComboBox QAbstractItemView {{
    background: {p['SURFACE']};
    color: {p['TEXT']};
    border: 1px solid {p['BORDER']};
    selection-background-color: {p['ACCENT_SOFT']};
    selection-color: {p['TEXT']};
    outline: 0;
}}

/* ── Tablas ────────────────────────────────────────────────────────── */
QTableWidget {{
    gridline-color: {p['BORDER']};
    selection-background-color: {p['ACCENT_SOFT']};
    selection-color: {p['TEXT']};
}}

QHeaderView::section {{
    background: {p['SURFACE_ALT']};
    color: {p['TEXT_MUTED']};
    border: none;
    border-bottom: 1px solid {p['BORDER']};
    padding: 10px 8px;
    font-weight: 600;
}}

QCheckBox {{
    color: {p['TEXT']};
    spacing: 8px;
}}

/* ── Scroll ────────────────────────────────────────────────────────── */
QScrollArea {{
    border: none;
    background: transparent;
}}

QScrollBar:vertical {{
    background: transparent;
    width: 10px;
    margin: 4px;
}}
QScrollBar::handle:vertical {{
    background: {p['BORDER']};
    border-radius: 5px;
    min-height: 30px;
}}
QScrollBar::handle:vertical:hover {{
    background: {p['TEXT_MUTED']};
}}
QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {{
    height: 0;
}}

/* ── Barra de estado ───────────────────────────────────────────────── */
QStatusBar {{
    background: {p['SURFACE']};
    color: {p['TEXT_MUTED']};
    border-top: 1px solid {p['BORDER']};
}}
"""
