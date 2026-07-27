from PySide6.QtWidgets import QWidget, QVBoxLayout, QLabel, QCheckBox, QPushButton, QFrame


class SettingsWidget(QWidget):
    def __init__(self, on_logout=None):
        super().__init__()
        self.on_logout = on_logout
        layout = QVBoxLayout(self)

        title = QLabel("Configuraciones")
        title.setObjectName("SectionTitle")
        subtitle = QLabel("Apariencia, sincronización y sesión")
        subtitle.setObjectName("SectionSubtitle")
        layout.addWidget(title)
        layout.addWidget(subtitle)

        card = QFrame()
        card.setObjectName("Card")
        card_layout = QVBoxLayout(card)
        card_layout.addWidget(QCheckBox("Modo compacto"))
        card_layout.addWidget(QCheckBox("Notificaciones push"))
        card_layout.addWidget(QCheckBox("Sincronización automática"))
        logout = QPushButton("Cerrar sesión")
        logout.setObjectName("Primary")
        if self.on_logout:
            logout.clicked.connect(self.on_logout)
        card_layout.addWidget(logout)
        layout.addWidget(card)

