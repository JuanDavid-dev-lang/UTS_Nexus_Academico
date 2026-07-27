from PySide6.QtCore import QDate, Qt
from PySide6.QtWidgets import (
    QWidget,
    QVBoxLayout,
    QLabel,
    QFrame,
    QGridLayout,
    QComboBox,
    QDateEdit,
    QPushButton,
    QTableWidget,
    QTableWidgetItem,
    QCheckBox,
    QMessageBox,
    QHeaderView,
    QHBoxLayout,
)


class AttendanceWidget(QWidget):
    def __init__(self, api_client=None, user=None):
        super().__init__()
        self.api = api_client
        self.user = user or {}
        self.students = []
        self.subjects = []

        root = QVBoxLayout(self)
        root.setSpacing(16)

        hero = QFrame()
        hero.setObjectName("HeroCard")
        hero_layout = QHBoxLayout(hero)
        hero_layout.setContentsMargins(20, 18, 20, 18)

        title_box = QVBoxLayout()
        title = QLabel("Asistencia")
        title.setObjectName("SectionTitle")
        subtitle = QLabel("Registro por fecha, clase y semestre.")
        subtitle.setObjectName("SectionSubtitle")
        title_box.addWidget(title)
        title_box.addWidget(subtitle)
        hero_layout.addLayout(title_box)
        hero_layout.addStretch(1)
        hero_layout.addWidget(self._chip("Fecha"))
        hero_layout.addWidget(self._chip("Clase"))
        hero_layout.addWidget(self._chip("Semestre"))
        root.addWidget(hero)

        summary = QHBoxLayout()
        summary.setSpacing(12)
        self.count_chip = self._metric("Estudiantes", "0")
        self.period_chip = self._metric("Semestre", "2026-1")
        self.date_chip = self._metric("Fecha", QDate.currentDate().toString("yyyy-MM-dd"))
        self.percent_chip = self._metric("Asistencia", "0%")
        summary.addWidget(self.count_chip)
        summary.addWidget(self.period_chip)
        summary.addWidget(self.date_chip)
        summary.addWidget(self.percent_chip)
        root.addLayout(summary)

        header = QFrame()
        header.setObjectName("FilterCard")
        header_layout = QGridLayout(header)
        header_layout.setHorizontalSpacing(12)
        header_layout.setVerticalSpacing(10)

        self.semester = QComboBox()
        self.semester.addItems(["2026-1", "2026-2"])
        self.semester.currentTextChanged.connect(lambda _: self.refresh_data())
        self.subject = QComboBox()
        self.duration = QComboBox()
        self.duration.addItems(["90", "180"])
        self.date = QDateEdit()
        self.date.setCalendarPopup(True)
        self.date.setDate(QDate.currentDate())
        self.date.setDisplayFormat("yyyy-MM-dd")

        refresh = QPushButton("Cargar estudiantes")
        refresh.clicked.connect(self.refresh_data)
        all_present = QPushButton("Todos presentes")
        all_present.clicked.connect(lambda: self.set_all(True))
        all_absent = QPushButton("Todos ausentes")
        all_absent.clicked.connect(lambda: self.set_all(False))
        save = QPushButton("Guardar asistencia")
        save.setObjectName("Primary")
        save.clicked.connect(self.save)

        header_layout.addWidget(QLabel("Semestre"), 0, 0)
        header_layout.addWidget(QLabel("Materia"), 0, 1)
        header_layout.addWidget(QLabel("Duración"), 0, 2)
        header_layout.addWidget(QLabel("Fecha"), 0, 3)
        header_layout.addWidget(self.semester, 1, 0)
        header_layout.addWidget(self.subject, 1, 1)
        header_layout.addWidget(self.duration, 1, 2)
        header_layout.addWidget(self.date, 1, 3)
        header_layout.addWidget(refresh, 1, 4)
        header_layout.addWidget(all_present, 1, 5)
        header_layout.addWidget(all_absent, 1, 6)
        header_layout.addWidget(save, 1, 7)
        root.addWidget(header)

        card = QFrame()
        card.setObjectName("Card")
        card_layout = QVBoxLayout(card)

        table_header = QHBoxLayout()
        table_header.addWidget(QLabel("Lista de estudiantes"))
        table_header.addStretch(1)
        self.tip = QLabel("Marca asistente por fila y guarda.")
        self.tip.setStyleSheet("color: #6B7280;")
        table_header.addWidget(self.tip)
        card_layout.addLayout(table_header)

        self.table = QTableWidget(0, 3)
        self.table.setHorizontalHeaderLabels(["Estudiante", "Cedula", "Presente"])
        self.table.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.Stretch)
        self.table.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeMode.ResizeToContents)
        self.table.horizontalHeader().setSectionResizeMode(2, QHeaderView.ResizeMode.ResizeToContents)
        self.table.verticalHeader().setVisible(False)
        self.table.setAlternatingRowColors(True)
        self.table.setShowGrid(False)
        card_layout.addWidget(self.table)
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
            self.students = sorted(
                self.api.get("/students").json().get("items", []),
                key=lambda x: (str(x.get("code", "")), str(x.get("fullName", ""))),
            )
            self.subjects = self.api.get("/subjects").json().get("items", [])
            self.subject.clear()
            for item in self.subjects:
                if item.get("period") != self.semester.currentText():
                    continue
                self.subject.addItem(f"{item.get('code', '')} - {item.get('name', '')}", item)

            self.table.setRowCount(len(self.students))
            for row, student in enumerate(self.students):
                self.table.setItem(row, 0, QTableWidgetItem(student.get("fullName", "")))
                self.table.setItem(row, 1, QTableWidgetItem(student.get("code", "")))
                check = QCheckBox()
                check.setChecked(True)
                self.table.setCellWidget(row, 2, check)

            self.count_chip.value_lbl.setText(str(len(self.students)))
            self.period_chip.value_lbl.setText(self.semester.currentText())
            self.date_chip.value_lbl.setText(self.date.date().toString("yyyy-MM-dd"))
            self.percent_chip.value_lbl.setText(self._attendance_percent())
        except Exception as exc:
            QMessageBox.warning(self, "Error", str(exc))

    def set_all(self, present: bool):
        for row in range(self.table.rowCount()):
            check = self.table.cellWidget(row, 2)
            if check:
                check.setChecked(present)

    def save(self):
        if not self.api or not self.user:
            return
        try:
            subject = self.subject.currentData()
            if not subject:
                QMessageBox.warning(self, "Faltan datos", "Selecciona una materia.")
                return
            period = self.semester.currentText()
            date_value = self.date.date().toString("yyyy-MM-dd")
            duration_minutes = int(self.duration.currentText())
            for row, student in enumerate(self.students):
                check = self.table.cellWidget(row, 2)
                present = check.isChecked() if check else False
                self.api.post(
                    "/attendance",
                    json={
                        "studentId": student["_id"],
                        "subjectId": subject["_id"],
                        "teacherId": self.user.get("id"),
                        "period": period,
                        "date": date_value,
                        "durationMinutes": duration_minutes,
                        "present": present,
                        "notes": "",
                    },
                )
            QMessageBox.information(self, "Guardado", "Asistencia registrada.")
        except Exception as exc:
            QMessageBox.warning(self, "Error", str(exc))

    def _attendance_percent(self):
        total = self.table.rowCount()
        if total == 0:
            return "0%"
        present = 0
        for row in range(total):
            check = self.table.cellWidget(row, 2)
            if check and check.isChecked():
                present += 1
        return f"{(present / total) * 100:.0f}%"
