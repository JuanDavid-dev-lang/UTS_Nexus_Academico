"""
Sistema de diseño central — UTS Nexus Académico (escritorio).

Implementa los tokens definidos en DESIGN.md: paleta institucional, tipografía,
espaciado y radios. Todo el estilo de la app se genera desde aquí para garantizar
consistencia (un color = un significado) y facilitar el modo claro/oscuro.

Uso:
    from ui.theme import Theme, build_stylesheet
    app.setStyleSheet(build_stylesheet())
    label.setStyleSheet(f"color: {Theme.TEXT_MUTED};")
"""
from __future__ import annotations


class Theme:
    """Tokens de diseño (DESIGN.md §4, §5, §7)."""

    # ── Paleta principal ──────────────────────────────────────────────
    PRIMARY = "#0057B8"        # Azul institucional
    PRIMARY_HOVER = "#0099FF"  # Azul claro (secundario / hover)
    SECONDARY = "#0099FF"
    SUCCESS = "#22C55E"        # Aprobado / riesgo bajo
    WARNING = "#FACC15"        # Riesgo medio / seguimiento
    DANGER = "#EF4444"         # Riesgo alto / reprobado / error
    INFO = "#3B82F6"           # Informativo

    # ── Neutros ───────────────────────────────────────────────────────
    BG = "#F8FAFC"             # Fondo general
    SURFACE = "#FFFFFF"        # Cards / paneles
    SURFACE_ALT = "#F1F5F9"    # Cabeceras de tabla, chips
    BORDER = "#E2E8F0"         # Bordes sutiles
    TEXT = "#111827"           # Texto principal
    TEXT_MUTED = "#6B7280"     # Texto secundario

    # Fondos suaves para badges de estado (tinte de cada color semántico)
    SUCCESS_SOFT = "#DCFCE7"
    WARNING_SOFT = "#FEF9C3"
    DANGER_SOFT = "#FEE2E2"
    INFO_SOFT = "#DBEAFE"

    # ── Tipografía (DESIGN.md §5) ─────────────────────────────────────
    FONT_FAMILY = "Inter, 'Segoe UI', Roboto, sans-serif"
    FS_H1 = 32
    FS_H2 = 26
    FS_H3 = 20
    FS_BODY = 14
    FS_CAPTION = 12

    # ── Espaciado y radios (DESIGN.md §7) ─────────────────────────────
    SPACE_PAGE = 24
    SPACE_GAP = 16
    RADIUS_CARD = 18
    RADIUS_INPUT = 12
    RADIUS_PILL = 999


def risk_palette(nivel: str) -> tuple[str, str, str]:
    """Devuelve (color, fondo_suave, emoji) para un nivel de riesgo.

    DESIGN.md §12: cada riesgo se representa con color + significado.
    """
    n = (nivel or "").upper()
    if n in ("ALTO", "HIGH"):
        return Theme.DANGER, Theme.DANGER_SOFT, "🔴"
    if n in ("MEDIO", "MEDIUM"):
        return "#B45309", Theme.WARNING_SOFT, "🟡"  # texto ámbar oscuro para contraste AA
    return Theme.SUCCESS, Theme.SUCCESS_SOFT, "🟢"


def build_stylesheet() -> str:
    """Genera el QSS completo de la aplicación desde los tokens del Theme."""
    t = Theme
    return f"""
/* ── Base ──────────────────────────────────────────────────────────── */
QMainWindow, QWidget {{
    background: {t.BG};
    color: {t.TEXT};
    font-family: {t.FONT_FAMILY};
    font-size: {t.FS_BODY}px;
}}

/* ── Contenedores ──────────────────────────────────────────────────── */
QFrame#Sidebar {{
    background: {t.SURFACE};
    border: 1px solid {t.BORDER};
    border-radius: 24px;
}}

QFrame#TopBar, QFrame#Card, QFrame#Surface,
QFrame#HeroCard, QFrame#MetricCard, QFrame#FilterCard, QFrame#ActionCard {{
    background: {t.SURFACE};
    border: 1px solid {t.BORDER};
    border-radius: {t.RADIUS_CARD}px;
}}

QFrame#MetricCard {{
    min-height: 92px;
}}

/* ── Tipografía / etiquetas ────────────────────────────────────────── */
QLabel#AppTitle {{
    font-size: {t.FS_H3}px;
    font-weight: 700;
    color: {t.PRIMARY};
}}

QLabel#SectionTitle {{
    font-size: {t.FS_H2}px;
    font-weight: 700;
    color: {t.TEXT};
}}

QLabel#SectionSubtitle {{
    color: {t.TEXT_MUTED};
    font-size: {t.FS_CAPTION}px;
}}

QLabel#MetricLabel {{
    color: {t.TEXT_MUTED};
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 1px;
}}

QLabel#MetricValue {{
    font-size: {t.FS_H3}px;
    font-weight: 800;
    color: {t.TEXT};
}}

QLabel#MetricHint {{
    color: {t.TEXT_MUTED};
    font-size: 10px;
}}

QLabel#Muted {{
    color: {t.TEXT_MUTED};
}}

/* ── Botones ───────────────────────────────────────────────────────── */
QPushButton {{
    background: {t.SURFACE};
    color: {t.TEXT};
    border: 1px solid {t.BORDER};
    padding: 10px 14px;
    border-radius: {t.RADIUS_INPUT}px;
}}

QPushButton:hover {{
    background: {t.SURFACE_ALT};
    border: 1px solid {t.PRIMARY_HOVER};
}}

QPushButton:checked {{
    background: {t.PRIMARY};
    color: #FFFFFF;
    border: 1px solid {t.PRIMARY};
    font-weight: 700;
}}

QPushButton#Primary {{
    background: {t.PRIMARY};
    color: #FFFFFF;
    border: none;
    font-weight: 700;
}}

QPushButton#Primary:hover {{
    background: {t.PRIMARY_HOVER};
}}

QPushButton#Danger {{
    background: {t.DANGER};
    color: #FFFFFF;
    border: none;
    font-weight: 700;
}}

/* ── Campos de entrada ─────────────────────────────────────────────── */
QLineEdit, QTextEdit, QTableWidget, QListWidget {{
    background: {t.SURFACE};
    color: {t.TEXT};
    border: 1px solid {t.BORDER};
    border-radius: {t.RADIUS_INPUT}px;
    padding: 10px 12px;
    selection-background-color: {t.PRIMARY};
    selection-color: #FFFFFF;
}}

QLineEdit:focus, QTextEdit:focus {{
    border: 1px solid {t.PRIMARY};
}}

QComboBox, QDateEdit, QSpinBox, QDoubleSpinBox {{
    background: {t.SURFACE};
    color: {t.TEXT};
    border: 1px solid {t.BORDER};
    border-radius: {t.RADIUS_INPUT}px;
    padding: 10px 12px;
    min-height: 18px;
}}

QComboBox:focus, QDateEdit:focus, QSpinBox:focus, QDoubleSpinBox:focus {{
    border: 1px solid {t.PRIMARY};
}}

QComboBox::drop-down {{
    border: none;
    width: 20px;
}}

QComboBox QAbstractItemView {{
    background: {t.SURFACE};
    color: {t.TEXT};
    border: 1px solid {t.BORDER};
    selection-background-color: {t.INFO_SOFT};
    selection-color: {t.TEXT};
    outline: 0;
}}

/* ── Tablas ────────────────────────────────────────────────────────── */
QTableWidget {{
    gridline-color: {t.BORDER};
    selection-background-color: {t.INFO_SOFT};
    selection-color: {t.TEXT};
}}

QHeaderView::section {{
    background: {t.SURFACE_ALT};
    color: {t.TEXT_MUTED};
    border: none;
    border-bottom: 1px solid {t.BORDER};
    padding: 10px 8px;
    font-weight: 600;
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
    background: {t.BORDER};
    border-radius: 5px;
    min-height: 30px;
}}
QScrollBar::handle:vertical:hover {{
    background: {t.TEXT_MUTED};
}}
QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {{
    height: 0;
}}

/* ── Barra de estado ───────────────────────────────────────────────── */
QStatusBar {{
    background: {t.SURFACE};
    color: {t.TEXT_MUTED};
    border-top: 1px solid {t.BORDER};
}}
"""
