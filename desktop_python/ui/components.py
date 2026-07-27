"""
Componentes reutilizables del sistema de diseño (DESIGN.md §8, §12, §18).

Piezas visuales consistentes para toda la app de escritorio:
- Card / StatCard: superficies con radius 18px.
- RiskBadge: riesgo con COLOR + MOTIVO (nunca solo color).
- StateView: estados loading / empty / error / offline.
"""
from __future__ import annotations

from PySide6.QtCore import Qt
from PySide6.QtGui import QFont
from PySide6.QtWidgets import (
    QFrame,
    QLabel,
    QVBoxLayout,
    QHBoxLayout,
    QWidget,
    QSizePolicy,
)

from ui.theme import Theme, risk_palette


class Card(QFrame):
    """Superficie blanca con borde sutil y esquinas redondeadas."""

    def __init__(self, object_name: str = "Card"):
        super().__init__()
        self.setObjectName(object_name)
        self.body = QVBoxLayout(self)
        self.body.setContentsMargins(18, 18, 18, 18)
        self.body.setSpacing(10)

    def add(self, widget: QWidget):
        self.body.addWidget(widget)
        return widget


class StatCard(Card):
    """Tarjeta de métrica: etiqueta, valor grande y pista opcional."""

    def __init__(self, label: str, value: str = "—", hint: str = ""):
        super().__init__("MetricCard")
        self.body.setSpacing(4)

        self.label = QLabel(label.upper())
        self.label.setObjectName("MetricLabel")

        self.value = QLabel(value)
        self.value.setObjectName("MetricValue")

        self.hint = QLabel(hint)
        self.hint.setObjectName("MetricHint")

        self.body.addWidget(self.label)
        self.body.addWidget(self.value)
        self.body.addWidget(self.hint)

    def set_value(self, value: str, hint: str | None = None, color: str | None = None):
        self.value.setText(str(value))
        if hint is not None:
            self.hint.setText(hint)
        if color:
            self.value.setStyleSheet(f"color: {color};")


class RiskBadge(QLabel):
    """Insignia de riesgo con color + motivo (DESIGN.md §12).

    Nunca comunica el riesgo solo con color: incluye emoji, nivel y motivo.
    """

    def __init__(self, nivel: str = "BAJO", motivo: str = ""):
        super().__init__()
        self.setWordWrap(True)
        self.set_risk(nivel, motivo)

    def set_risk(self, nivel: str, motivo: str = ""):
        color, soft, emoji = risk_palette(nivel)
        etiqueta = {"ALTO": "Riesgo Alto", "MEDIO": "Riesgo Medio", "BAJO": "Sin riesgo"}.get(
            (nivel or "BAJO").upper(), "Sin riesgo"
        )
        texto = f"{emoji}  {etiqueta}"
        if motivo:
            texto += f" — {motivo}"
        self.setText(texto)
        self.setStyleSheet(
            f"background: {soft}; color: {color}; border-radius: {Theme.RADIUS_PILL}px;"
            f"padding: 6px 12px; font-weight: 600; font-size: {Theme.FS_CAPTION}px;"
        )


class Badge(QLabel):
    """Etiqueta de estado genérica (aprobado, pendiente, etc.)."""

    def __init__(self, text: str, tone: str = "info"):
        super().__init__(text)
        tones = {
            "success": (Theme.SUCCESS, Theme.SUCCESS_SOFT),
            "warning": ("#B45309", Theme.WARNING_SOFT),
            "danger": (Theme.DANGER, Theme.DANGER_SOFT),
            "info": (Theme.INFO, Theme.INFO_SOFT),
        }
        color, soft = tones.get(tone, tones["info"])
        self.setStyleSheet(
            f"background: {soft}; color: {color}; border-radius: {Theme.RADIUS_PILL}px;"
            f"padding: 4px 10px; font-weight: 600; font-size: {Theme.FS_CAPTION}px;"
        )
        self.setAlignment(Qt.AlignmentFlag.AlignCenter)


class StateView(QFrame):
    """Vista de estado: loading / empty / error / offline (DESIGN.md §18).

    Evita pantallas en blanco: siempre comunica qué está pasando.
    """

    def __init__(self):
        super().__init__()
        self.setObjectName("Card")
        layout = QVBoxLayout(self)
        layout.setContentsMargins(24, 40, 24, 40)
        layout.setSpacing(10)
        layout.setAlignment(Qt.AlignmentFlag.AlignCenter)

        self.icon = QLabel("")
        self.icon.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.icon.setFont(QFont(Theme.FONT_FAMILY, 34))

        self.title = QLabel("")
        self.title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.title.setStyleSheet(f"font-size: {Theme.FS_H3}px; font-weight: 700;")

        self.message = QLabel("")
        self.message.setObjectName("Muted")
        self.message.setWordWrap(True)
        self.message.setAlignment(Qt.AlignmentFlag.AlignCenter)

        layout.addWidget(self.icon)
        layout.addWidget(self.title)
        layout.addWidget(self.message)
        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)

    def _show(self, icon: str, title: str, message: str):
        self.icon.setText(icon)
        self.title.setText(title)
        self.message.setText(message)
        self.show()

    def loading(self, message: str = "Cargando información..."):
        self._show("⏳", "Un momento", message)

    def empty(self, message: str = "No hay datos para mostrar todavía."):
        self._show("📭", "Sin datos", message)

    def error(self, message: str = "Ocurrió un problema al cargar."):
        self._show("⚠️", "Error", message)

    def offline(self, message: str = "Sin conexión con el servidor."):
        self._show("🔌", "Sin conexión", message)


def section_header(title: str, subtitle: str = "") -> QWidget:
    """Encabezado de sección reutilizable (título H2 + subtítulo)."""
    box = QWidget()
    layout = QVBoxLayout(box)
    layout.setContentsMargins(0, 0, 0, 0)
    layout.setSpacing(2)

    h = QLabel(title)
    h.setObjectName("SectionTitle")
    layout.addWidget(h)

    if subtitle:
        s = QLabel(subtitle)
        s.setObjectName("SectionSubtitle")
        layout.addWidget(s)
    return box
