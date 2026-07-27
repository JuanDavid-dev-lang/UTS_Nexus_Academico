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
    "TITLE": "#144D37",          # Títulos / marca
    "SUCCESS": "#16A34A",
    "WARNING": "#B45309",
    "DANGER": "#DC2626",
    "INFO": "#0E7490",
    "BG": "#F4F7F1",             # Fondo general (tinte verde muy suave)
    "SURFACE": "#FFFFFF",
    "SURFACE_ALT": "#EAF0E6",
    "BORDER": "#D8E2D4",
    "TEXT": "#12271E",           # Casi negro verdoso (legible)
    "TEXT_MUTED": "#5B6B61",
    "SUCCESS_SOFT": "#DCFCE7",
    "WARNING_SOFT": "#FEF3C7",
    "DANGER_SOFT": "#FEE2E2",
    "INFO_SOFT": "#CFF4FA",
    "ACCENT_SOFT": "#F1F6CE",    # Lima suave para resaltados
}

DARK = {
    "PRIMARY": "#CAD225",        # En oscuro, la lima es el acento principal
    "PRIMARY_HOVER": "#D8E04A",
    "ON_PRIMARY": "#0F3D2B",     # Texto verde oscuro sobre lima
    "SECONDARY": "#CAD225",
    "TITLE": "#CAD225",          # Lettering lima sobre verde
    "SUCCESS": "#4ADE80",
    "WARNING": "#FBBF24",
    "DANGER": "#F87171",
    "INFO": "#38BDF8",
    "BG": "#0F3D2B",             # Verde profundo (dominante)
    "SURFACE": "#164D38",        # Verde institucional como superficie
    "SURFACE_ALT": "#1E5B44",
    "BORDER": "#2E6B51",
    "TEXT": "#E9F2D3",           # Lima muy claro (letra legible)
    "TEXT_MUTED": "#9FB89F",
    "SUCCESS_SOFT": "#14532D",
    "WARNING_SOFT": "#4D3B12",
    "DANGER_SOFT": "#4C1D1D",
    "INFO_SOFT": "#0C4A6E",
    "ACCENT_SOFT": "#26361A",
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
    TITLE = LIGHT["TITLE"]
    SUCCESS = LIGHT["SUCCESS"]
    WARNING = LIGHT["WARNING"]
    DANGER = LIGHT["DANGER"]
    INFO = LIGHT["INFO"]
    BG = LIGHT["BG"]
    SURFACE = LIGHT["SURFACE"]
    SURFACE_ALT = LIGHT["SURFACE_ALT"]
    BORDER = LIGHT["BORDER"]
    TEXT = LIGHT["TEXT"]
    TEXT_MUTED = LIGHT["TEXT_MUTED"]
    SUCCESS_SOFT = LIGHT["SUCCESS_SOFT"]
    WARNING_SOFT = LIGHT["WARNING_SOFT"]
    DANGER_SOFT = LIGHT["DANGER_SOFT"]
    INFO_SOFT = LIGHT["INFO_SOFT"]
    ACCENT_SOFT = LIGHT["ACCENT_SOFT"]

    # Tipografía (DESIGN.md §5)
    FONT_FAMILY = "Inter, 'Segoe UI', Roboto, sans-serif"
    FS_H1 = 32
    FS_H2 = 26
    FS_H3 = 20
    FS_BODY = 14
    FS_CAPTION = 12

    # Espaciado y radios (DESIGN.md §7)
    SPACE_PAGE = 24
    SPACE_GAP = 16
    RADIUS_CARD = 18
    RADIUS_INPUT = 12
    RADIUS_PILL = 999


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
    border-radius: 24px;
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
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 1px;
}}

QLabel#MetricValue {{
    font-size: {Theme.FS_H3}px;
    font-weight: 800;
    color: {p['TEXT']};
}}

QLabel#MetricHint {{
    color: {p['TEXT_MUTED']};
    font-size: 10px;
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
