"""
Panel académico del docente (DESIGN.md §10, §11).

Responde de un vistazo: ¿cómo van mis estudiantes?, ¿quién necesita ayuda?,
¿qué materias están en riesgo? Usa métricas reales del backend y colores
semánticos (verde = bien, ámbar = seguimiento, rojo = intervención).
"""
from PySide6.QtWidgets import QWidget, QVBoxLayout, QGridLayout, QHBoxLayout, QPushButton, QLabel

from ui.theme import Theme
from ui.components import StatCard, section_header


class DashboardWidget(QWidget):
    def __init__(self, api_client=None):
        super().__init__()
        self.api = api_client
        layout = QVBoxLayout(self)
        layout.setSpacing(Theme.SPACE_GAP)

        header = QHBoxLayout()
        header.addWidget(section_header(
            "Panel académico",
            "Métricas reales de rendimiento, riesgo y asistencia",
        ))
        header.addStretch(1)
        refresh = QPushButton("Actualizar")
        refresh.setObjectName("Primary")
        refresh.clicked.connect(self.refresh_data)
        header.addWidget(refresh)
        layout.addLayout(header)

        # Tarjetas de métricas con color semántico.
        grid = QGridLayout()
        grid.setHorizontalSpacing(14)
        grid.setVerticalSpacing(14)
        self.card_avg = StatCard("Promedio actual", hint="Sobre cortes calificados")
        self.card_approved = StatCard("Aprobados", hint="Proyección al día")
        self.card_failed = StatCard("Reprobados", hint="En observación")
        self.card_risk = StatCard("En riesgo", hint="Alertas activas")
        self.card_attendance = StatCard("Asistencia", hint="Ponderada por minutos")
        self.card_students = StatCard("Estudiantes", hint="En tu alcance")

        # (card, fila, columna, color del valor)
        self._cards = [
            (self.card_avg, 0, 0, Theme.PRIMARY),
            (self.card_approved, 0, 1, Theme.SUCCESS),
            (self.card_failed, 0, 2, Theme.DANGER),
            (self.card_risk, 1, 0, Theme.WARNING),
            (self.card_attendance, 1, 1, Theme.INFO),
            (self.card_students, 1, 2, Theme.TEXT),
        ]
        for card, r, c, color in self._cards:
            card.value.setStyleSheet(f"color: {color};")
            grid.addWidget(card, r, c)
        layout.addLayout(grid)

        # Resumen textual.
        summary = section_header("Resumen")
        layout.addWidget(summary)
        self.overview_label = QLabel("Cargando datos del backend…")
        self.overview_label.setObjectName("Muted")
        self.overview_label.setWordWrap(True)
        layout.addWidget(self.overview_label)
        layout.addStretch(1)

        self.refresh_data()

    def refresh_data(self):
        if not self.api:
            self.overview_label.setText("Sin cliente de API disponible.")
            return
        self.overview_label.setText("⏳ Cargando datos del backend…")
        try:
            resp = self.api.get("/analytics/dashboard")
            data = resp.json().get("summary", {})
            self.card_avg.set_value(f"{data.get('averageGrade', 0):.2f}", color=Theme.PRIMARY)
            self.card_approved.set_value(data.get("approvedStudents", 0), color=Theme.SUCCESS)
            self.card_failed.set_value(data.get("failedStudents", 0), color=Theme.DANGER)
            self.card_risk.set_value(data.get("riskStudents", 0), color=Theme.WARNING)
            self.card_attendance.set_value(f"{data.get('averageAttendance', 0):.0f}%", color=Theme.INFO)
            self.card_students.set_value(data.get("totalStudents", 0), color=Theme.TEXT)
            self.overview_label.setText(
                f"{data.get('totalSubjects', 0)} materias · "
                f"{data.get('missedClasses', 0)} inasistencias · "
                f"{data.get('criticalSubjects', 0)} materias críticas. Sincronizado con Atlas."
            )
        except Exception as exc:
            self.overview_label.setText(f"⚠️ No se pudo cargar el panel: {exc}")
