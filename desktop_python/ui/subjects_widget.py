from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QWidget,
    QVBoxLayout,
    QLabel,
    QFrame,
    QGridLayout,
    QComboBox,
    QLineEdit,
    QSpinBox,
    QPushButton,
    QListWidget,
    QMessageBox,
    QHBoxLayout,
)


class SubjectsWidget(QWidget):
    def __init__(self, api_client=None, user=None):
        super().__init__()
        self.api = api_client
        self.user = user or {}
        self.subjects = []

        root = QVBoxLayout(self)
        root.setSpacing(16)

        hero = QFrame()
        hero.setObjectName("HeroCard")
        hero_layout = QHBoxLayout(hero)
        hero_layout.setContentsMargins(20, 18, 20, 18)

        title_box = QVBoxLayout()
        title = QLabel("Materias")
        title.setObjectName("SectionTitle")
        subtitle = QLabel("Crea, edita y organiza las materias por semestre.")
        subtitle.setObjectName("SectionSubtitle")
        title_box.addWidget(title)
        title_box.addWidget(subtitle)
        hero_layout.addLayout(title_box)
        hero_layout.addStretch(1)
        hero_layout.addWidget(self._chip("Gestion docente"))
        hero_layout.addWidget(self._chip("Semestre activo"))
        root.addWidget(hero)

        stats = QHBoxLayout()
        stats.setSpacing(12)
        self.count_chip = self._metric("Materias", "0")
        self.period_chip = self._metric("Periodo", "2026-1")
        self.total_chip = self._metric("Vista", "Lista")
        stats.addWidget(self.count_chip)
        stats.addWidget(self.period_chip)
        stats.addWidget(self.total_chip)
        root.addLayout(stats)

        form = QFrame()
        form.setObjectName("FilterCard")
        grid = QGridLayout(form)
        grid.setHorizontalSpacing(12)
        grid.setVerticalSpacing(10)

        self.semester = QComboBox()
        self.semester.addItems(["2026-1", "2026-2"])
        self.semester.currentTextChanged.connect(lambda _: self.refresh_data())

        self.code = QLineEdit()
        self.code.setPlaceholderText("Ej: MAT101")
        self.name = QLineEdit()
        self.name.setPlaceholderText("Ej: Cálculo diferencial")
        self.credits = QSpinBox()
        self.credits.setRange(0, 12)

        save = QPushButton("Guardar materia")
        save.setObjectName("Primary")
        save.clicked.connect(self.save)
        refresh = QPushButton("Actualizar")
        refresh.clicked.connect(self.refresh_data)

        grid.addWidget(QLabel("Semestre"), 0, 0)
        grid.addWidget(QLabel("Codigo"), 0, 1)
        grid.addWidget(QLabel("Nombre"), 0, 2)
        grid.addWidget(QLabel("Creditos"), 0, 3)
        grid.addWidget(self.semester, 1, 0)
        grid.addWidget(self.code, 1, 1)
        grid.addWidget(self.name, 1, 2)
        grid.addWidget(self.credits, 1, 3)
        grid.addWidget(refresh, 1, 4)
        grid.addWidget(save, 1, 5)
        root.addWidget(form)

        card = QFrame()
        card.setObjectName("Card")
        card_layout = QVBoxLayout(card)
        header = QHBoxLayout()
        header.addWidget(QLabel("Listado de materias"))
        header.addStretch(1)
        self.semester_tag = QLabel("2026-1")
        self.semester_tag.setStyleSheet(
            "padding: 6px 10px; border-radius: 999px; background: #F1F5F9; border: 1px solid #E2E8F0; color: #111827;"
        )
        header.addWidget(self.semester_tag)
        card_layout.addLayout(header)

        self.listw = QListWidget()
        self.listw.setAlternatingRowColors(True)
        card_layout.addWidget(self.listw)
        root.addWidget(card)

        self.refresh_data()

    def _chip(self, text):
        chip = QLabel(text)
        chip.setStyleSheet(
            "padding: 7px 12px; border-radius: 999px; background: #F1F5F9; border: 1px solid #E2E8F0; color: #111827;"
        )
        return chip

    def _metric(self, label, value):
        card = QFrame()
        card.setObjectName("MetricCard")
        layout = QVBoxLayout(card)
        layout.setContentsMargins(16, 14, 16, 14)
        title = QLabel(label)
        title.setObjectName("MetricLabel")
        value_lbl = QLabel(value)
        value_lbl.setObjectName("MetricValue")
        layout.addWidget(title)
        layout.addWidget(value_lbl)
        layout.addStretch(1)
        card.value_lbl = value_lbl
        return card

    def refresh_data(self):
        if not self.api:
            return
        try:
            items = self.api.get("/subjects").json().get("items", [])
            current = self.semester.currentText()
            self.subjects = sorted(items, key=lambda x: (str(x.get("period", "")), str(x.get("code", "")), str(x.get("name", ""))))

            visible = [item for item in self.subjects if not current or item.get("period") == current]
            self.listw.clear()
            for item in visible:
                self.listw.addItem(f"{item.get('code', '')}  |  {item.get('name', '')}  |  {item.get('period', '')}")

            self.count_chip.value_lbl.setText(str(len(visible)))
            self.period_chip.value_lbl.setText(current or "Todos")
            self.total_chip.value_lbl.setText("Lista")
            self.semester_tag.setText(current or "Todos")
        except Exception as exc:
            QMessageBox.warning(self, "Error", str(exc))

    def save(self):
        if not self.api or not self.user:
            return
        try:
            payload = {
                "name": self.name.text().strip(),
                "code": self.code.text().strip(),
                "professorId": self.user.get("id"),
                "period": self.semester.currentText(),
                "credits": self.credits.value(),
            }
            if not payload["name"] or not payload["code"]:
                QMessageBox.warning(self, "Faltan datos", "Completa codigo y nombre.")
                return
            self.api.post("/subjects", json=payload)
            self.code.clear()
            self.name.clear()
            self.credits.setValue(0)
            self.refresh_data()
            QMessageBox.information(self, "Guardado", "Materia creada.")
        except Exception as exc:
            QMessageBox.warning(self, "Error", str(exc))
