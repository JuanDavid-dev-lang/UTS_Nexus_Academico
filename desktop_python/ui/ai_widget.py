from PySide6.QtWidgets import QWidget, QVBoxLayout, QLabel, QTextEdit, QPushButton, QFrame


class AiWidget(QWidget):
    def __init__(self):
        super().__init__()
        layout = QVBoxLayout(self)
        layout.setSpacing(16)

        title = QLabel("Asistente IA")
        title.setObjectName("SectionTitle")
        subtitle = QLabel("Pregunta por promedios, riesgo y asistencia")
        subtitle.setObjectName("SectionSubtitle")
        layout.addWidget(title)
        layout.addWidget(subtitle)

        card = QFrame()
        card.setObjectName("Card")
        card_layout = QVBoxLayout(card)
        self.input = QTextEdit()
        self.input.setPlaceholderText("¿Cuánto necesita Juan para aprobar?")
        self.input.setFixedHeight(140)
        ask = QPushButton("Consultar")
        ask.setObjectName("Primary")
        card_layout.addWidget(self.input)
        card_layout.addWidget(ask)
        layout.addWidget(card)
