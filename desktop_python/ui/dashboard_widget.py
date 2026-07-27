from PySide6.QtWidgets import QWidget, QVBoxLayout, QLabel, QGridLayout, QFrame, QHBoxLayout, QPushButton


class StatCard(QFrame):
    def __init__(self, title: str, tone: str = "#74d3b2", hint: str = ""):
        super().__init__()
        self.setObjectName("Card")
        layout = QVBoxLayout(self)
        layout.setContentsMargins(18, 18, 18, 18)
        layout.setSpacing(4)
        title_label = QLabel(title)
        title_label.setStyleSheet("color: #9fb0bb; font-size: 12px;")
        self.value_label = QLabel("—")
        self.value_label.setStyleSheet(f"font-size: 28px; font-weight: 700; color: {tone};")
        hint_label = QLabel(hint)
        hint_label.setStyleSheet("color: #7f929d; font-size: 10px;")
        layout.addWidget(title_label)
        layout.addWidget(self.value_label)
        layout.addWidget(hint_label)
        layout.addStretch(1)

    def set_value(self, value):
        self.value_label.setText(str(value))


class DashboardWidget(QWidget):
    def __init__(self, api_client=None):
        super().__init__()
        self.api = api_client
        layout = QVBoxLayout(self)
        layout.setSpacing(16)

        header = QHBoxLayout()
        title_box = QVBoxLayout()
        title = QLabel("Panel académico")
        title.setObjectName("SectionTitle")
        subtitle = QLabel("Métricas reales de rendimiento, riesgo y asistencia")
        subtitle.setObjectName("SectionSubtitle")
        title_box.addWidget(title)
        title_box.addWidget(subtitle)
        header.addLayout(title_box)
        header.addStretch(1)
        refresh = QPushButton("Actualizar")
        refresh.clicked.connect(self.refresh_data)
        header.addWidget(refresh)
        layout.addLayout(header)

        grid = QGridLayout()
        grid.setHorizontalSpacing(14)
        grid.setVerticalSpacing(14)
        self.card_avg = StatCard("Promedio actual", hint="Sobre cortes calificados")
        self.card_approved = StatCard("Aprobados", "#8ce2c4", "Proyección al día")
        self.card_failed = StatCard("Reprobados", "#ffb86b", "En observación")
        self.card_risk = StatCard("En riesgo", "#ff8a8a", "Alertas activas")
        self.card_attendance = StatCard("Asistencia", "#8fb5ff", "Ponderada por minutos")
        self.card_students = StatCard("Estudiantes", "#74d3b2", "En tu alcance")
        grid.addWidget(self.card_avg, 0, 0)
        grid.addWidget(self.card_approved, 0, 1)
        grid.addWidget(self.card_failed, 0, 2)
        grid.addWidget(self.card_risk, 1, 0)
        grid.addWidget(self.card_attendance, 1, 1)
        grid.addWidget(self.card_students, 1, 2)
        layout.addLayout(grid)

        overview = QFrame()
        overview.setObjectName("Card")
        overview_layout = QVBoxLayout(overview)
        overview_layout.setContentsMargins(18, 18, 18, 18)
        overview_layout.addWidget(QLabel("Resumen"))
        self.overview_label = QLabel("Cargando datos del backend…")
        self.overview_label.setStyleSheet("color: #c7d4db;")
        overview_layout.addWidget(self.overview_label)
        overview_layout.addStretch(1)
        layout.addWidget(overview)
        layout.addStretch(1)

        self.refresh_data()

    def refresh_data(self):
        if not self.api:
            return
        try:
            resp = self.api.get("/analytics/dashboard")
            data = resp.json().get("summary", {})
            self.card_avg.set_value(f"{data.get('averageGrade', 0):.2f}")
            self.card_approved.set_value(data.get("approvedStudents", 0))
            self.card_failed.set_value(data.get("failedStudents", 0))
            self.card_risk.set_value(data.get("riskStudents", 0))
            self.card_attendance.set_value(f"{data.get('averageAttendance', 0):.0f}%")
            self.card_students.set_value(data.get("totalStudents", 0))
            self.overview_label.setText(
                f"{data.get('totalSubjects', 0)} materias · "
                f"{data.get('missedClasses', 0)} inasistencias · "
                f"{data.get('criticalSubjects', 0)} materias críticas. Sincronizado con Atlas."
            )
        except Exception as exc:
            self.overview_label.setText(f"No se pudo cargar el panel: {exc}")
