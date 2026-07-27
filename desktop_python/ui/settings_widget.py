"""Configuraciones: apariencia (tema claro/oscuro), sincronización y sesión."""
from PySide6.QtWidgets import (
    QWidget,
    QVBoxLayout,
    QHBoxLayout,
    QLabel,
    QCheckBox,
    QPushButton,
    QFrame,
    QApplication,
)

from ui.theme import Theme, set_mode, build_stylesheet
from services.session_store import SessionStore


class SettingsWidget(QWidget):
    def __init__(self, on_logout=None):
        super().__init__()
        self.on_logout = on_logout
        self.store = SessionStore()

        layout = QVBoxLayout(self)
        layout.setSpacing(Theme.SPACE_GAP)

        title = QLabel("Configuraciones")
        title.setObjectName("SectionTitle")
        subtitle = QLabel("Apariencia, sincronización y sesión")
        subtitle.setObjectName("SectionSubtitle")
        layout.addWidget(title)
        layout.addWidget(subtitle)

        # ── Apariencia ────────────────────────────────────────────────
        appearance = QFrame()
        appearance.setObjectName("Card")
        ap_layout = QVBoxLayout(appearance)
        ap_layout.addWidget(QLabel("Apariencia"))

        row = QHBoxLayout()
        row.addWidget(QLabel("Modo oscuro"))
        row.addStretch(1)
        self.dark_switch = QCheckBox()
        self.dark_switch.setChecked(self.store.load_dark_mode())
        self.dark_switch.toggled.connect(self._toggle_dark)
        row.addWidget(self.dark_switch)
        ap_layout.addLayout(row)

        hint = QLabel("Verde institucional en claro · verde profundo con lima en oscuro.")
        hint.setObjectName("Muted")
        ap_layout.addWidget(hint)
        layout.addWidget(appearance)

        # ── Preferencias ──────────────────────────────────────────────
        prefs = QFrame()
        prefs.setObjectName("Card")
        prefs_layout = QVBoxLayout(prefs)
        prefs_layout.addWidget(QLabel("Preferencias"))
        prefs_layout.addWidget(QCheckBox("Modo compacto"))
        prefs_layout.addWidget(QCheckBox("Notificaciones push"))
        prefs_layout.addWidget(QCheckBox("Sincronización automática"))
        layout.addWidget(prefs)

        # ── Sesión ────────────────────────────────────────────────────
        session = QFrame()
        session.setObjectName("Card")
        session_layout = QVBoxLayout(session)
        session_layout.addWidget(QLabel("Sesión"))
        logout = QPushButton("Cerrar sesión")
        logout.setObjectName("Danger")
        if self.on_logout:
            logout.clicked.connect(self.on_logout)
        session_layout.addWidget(logout)
        layout.addWidget(session)
        layout.addStretch(1)

    def _toggle_dark(self, checked: bool):
        set_mode(checked)
        app = QApplication.instance()
        if app:
            app.setStyleSheet(build_stylesheet(checked))
        self.store.save_dark_mode(checked)
