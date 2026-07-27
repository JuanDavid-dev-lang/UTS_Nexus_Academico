from PySide6.QtCore import QDate, Qt
from PySide6.QtWidgets import (
    QWidget,
    QVBoxLayout,
    QLabel,
    QPushButton,
    QFrame,
    QHBoxLayout,
    QComboBox,
    QFileDialog,
    QMessageBox,
    QGridLayout,
    QDateEdit,
    QSizePolicy,
)


class ReportsWidget(QWidget):
    def __init__(self, api_client=None):
        super().__init__()
        self.api = api_client
        self.students = []
        self.subjects = []
        self.groups = []
        self.metric_values = {}

        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(14)
        root.setAlignment(Qt.AlignmentFlag.AlignTop)

        hero = QFrame()
        hero.setObjectName("HeroCard")
        hero_layout = QHBoxLayout(hero)
        hero_layout.setContentsMargins(20, 18, 20, 18)
        hero_layout.setSpacing(18)

        title_box = QVBoxLayout()
        title = QLabel("Reportes")
        title.setObjectName("SectionTitle")
        subtitle = QLabel("Exporta notas, asistencia y reportes completos con filtros por persona, grupo y fecha.")
        subtitle.setObjectName("SectionSubtitle")
        title_box.addWidget(title)
        title_box.addWidget(subtitle)
        hero_layout.addLayout(title_box, 3)

        pill_box = QHBoxLayout()
        pill_box.setSpacing(10)
        for text in ("PDF", "Excel", "Semestre", "Sincronizado"):
            pill = QLabel(text)
            pill.setStyleSheet(
                "padding: 7px 12px; border-radius: 999px; background: #F1F5F9; border: 1px solid #E2E8F0; color: #111827;"
            )
            pill_box.addWidget(pill)
        pill_box.addStretch(1)
        hero_layout.addLayout(pill_box, 2)
        root.addWidget(hero)

        metrics = QHBoxLayout()
        metrics.setSpacing(12)
        metrics.addWidget(self._metric_card("mode", "Modo", "General", "Vista actual"))
        metrics.addWidget(self._metric_card("filter", "Filtro", "Todos", "Persona, grupo o materia"))
        metrics.addWidget(self._metric_card("range", "Rango", "30 días", "Desde y hasta"))
        metrics.addWidget(self._metric_card("output", "Salida", "PDF / Excel", "Descarga directa"))
        root.addLayout(metrics)

        card = QFrame()
        card.setObjectName("FilterCard")
        card_layout = QVBoxLayout(card)
        card_layout.setContentsMargins(18, 18, 18, 18)
        card_layout.setSpacing(14)

        header = QHBoxLayout()
        label_box = QVBoxLayout()
        h_title = QLabel("Filtros")
        h_title.setObjectName("SectionTitle")
        h_sub = QLabel("Selecciona el alcance y exporta con un solo clic.")
        h_sub.setObjectName("SectionSubtitle")
        label_box.addWidget(h_title)
        label_box.addWidget(h_sub)
        header.addLayout(label_box)
        header.addStretch(1)
        card_layout.addLayout(header)

        grid = QGridLayout()
        grid.setHorizontalSpacing(12)
        grid.setVerticalSpacing(10)

        self.scope = QComboBox()
        self.scope.addItems(["General", "Por persona", "Por materia", "Por grupo", "Personalizado"])
        self.scope.currentTextChanged.connect(self.apply_scope)

        self.semester = QComboBox()
        self.semester.addItems(["2026-1", "2026-2"])
        self.semester.currentTextChanged.connect(lambda _: self.refresh_data())

        self.kind = QComboBox()
        self.kind.addItems(["Completo", "Notas", "Asistencia", "Consolidado"])

        self.student = QComboBox()
        self.subject = QComboBox()
        self.group = QComboBox()

        self.date_from = QDateEdit()
        self.date_from.setCalendarPopup(True)
        self.date_from.setDate(QDate.currentDate().addMonths(-1))
        self.date_from.setDisplayFormat("yyyy-MM-dd")

        self.date_to = QDateEdit()
        self.date_to.setCalendarPopup(True)
        self.date_to.setDate(QDate.currentDate())
        self.date_to.setDisplayFormat("yyyy-MM-dd")

        self.kind.currentTextChanged.connect(self._sync_mode_labels)
        self.student.currentTextChanged.connect(lambda _: self._refresh_metrics())
        self.subject.currentTextChanged.connect(lambda _: self._refresh_metrics())
        self.group.currentTextChanged.connect(lambda _: self._refresh_metrics())
        self.date_from.dateChanged.connect(lambda _: self._refresh_metrics())
        self.date_to.dateChanged.connect(lambda _: self._refresh_metrics())

        grid.addWidget(QLabel("Modo"), 0, 0)
        grid.addWidget(QLabel("Semestre"), 0, 1)
        grid.addWidget(QLabel("Tipo"), 0, 2)
        grid.addWidget(QLabel("Persona"), 0, 3)
        grid.addWidget(QLabel("Materia"), 0, 4)
        grid.addWidget(QLabel("Grupo"), 0, 5)
        grid.addWidget(QLabel("Desde"), 0, 6)
        grid.addWidget(QLabel("Hasta"), 0, 7)

        for widget in (self.scope, self.semester, self.kind, self.student, self.subject, self.group, self.date_from, self.date_to):
            widget.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
            widget.setMinimumHeight(40)

        grid.addWidget(self.scope, 1, 0)
        grid.addWidget(self.semester, 1, 1)
        grid.addWidget(self.kind, 1, 2)
        grid.addWidget(self.student, 1, 3)
        grid.addWidget(self.subject, 1, 4)
        grid.addWidget(self.group, 1, 5)
        grid.addWidget(self.date_from, 1, 6)
        grid.addWidget(self.date_to, 1, 7)
        card_layout.addLayout(grid)

        action_row = QHBoxLayout()
        action_row.setSpacing(12)
        action_row.addStretch(1)

        refresh = QPushButton("Actualizar")
        refresh.clicked.connect(self.refresh_data)

        pdf = QPushButton("Exportar PDF")
        pdf.setObjectName("Primary")
        pdf.clicked.connect(self.export_pdf)

        excel = QPushButton("Exportar Excel")
        excel.clicked.connect(self.export_excel)

        action_row.addWidget(refresh)
        action_row.addWidget(pdf)
        action_row.addWidget(excel)
        card_layout.addLayout(action_row)
        root.addWidget(card)

        self.apply_scope(self.scope.currentText())
        self._toggle_date_fields()
        self.refresh_data()

    def _metric_card(self, key, label, value, hint):
        card = QFrame()
        card.setObjectName("MetricCard")
        layout = QVBoxLayout(card)
        layout.setContentsMargins(16, 14, 16, 14)
        layout.setSpacing(4)

        l1 = QLabel(label)
        l1.setObjectName("MetricLabel")
        v = QLabel(value)
        v.setObjectName("MetricValue")
        h = QLabel(hint)
        h.setObjectName("MetricHint")
        self.metric_values[key] = v

        layout.addWidget(l1)
        layout.addWidget(v)
        layout.addWidget(h)
        return card

    def _sync_mode_labels(self, _value):
        self._toggle_date_fields()
        self._refresh_metrics()

    def _toggle_date_fields(self):
        active = self.kind.currentText() == "Asistencia" or self.scope.currentText() == "Personalizado"
        self.date_from.setEnabled(active)
        self.date_to.setEnabled(active)

    def _refresh_metrics(self):
        if not hasattr(self, "student") or not hasattr(self, "subject") or not hasattr(self, "group"):
            return
        values = {
            "mode": self.scope.currentText(),
            "filter": self._current_filter_label(),
            "range": self._current_range_label(),
            "output": self.kind.currentText(),
        }
        for key, text in values.items():
            label = self.metric_values.get(key)
            if label:
                label.setText(text)

    def _current_filter_label(self):
        parts = []
        student = self.student.currentText().strip()
        subject = self.subject.currentText().strip()
        group = self.group.currentText().strip()
        if self.scope.currentText() in ("Por persona", "Personalizado") and student:
            parts.append(student)
        if self.scope.currentText() in ("Por materia", "Personalizado") and subject:
            parts.append(subject)
        if self.scope.currentText() in ("Por grupo", "Personalizado") and group:
            parts.append(group)
        return " / ".join(parts) if parts else "Todos"

    def _current_range_label(self):
        if self.kind.currentText() != "Asistencia" and self.scope.currentText() != "Personalizado":
            return "30 días"
        return f"{self.date_from.date().toString('yyyy-MM-dd')} → {self.date_to.date().toString('yyyy-MM-dd')}"

    def apply_scope(self, value):
        if value == "General":
            self.student.setEnabled(False)
            self.subject.setEnabled(False)
            self.group.setEnabled(False)
        elif value == "Por persona":
            self.student.setEnabled(True)
            self.subject.setEnabled(False)
            self.group.setEnabled(False)
        elif value == "Por materia":
            self.student.setEnabled(False)
            self.subject.setEnabled(True)
            self.group.setEnabled(False)
        elif value == "Por grupo":
            self.student.setEnabled(False)
            self.subject.setEnabled(False)
            self.group.setEnabled(True)
        else:
            self.student.setEnabled(True)
            self.subject.setEnabled(True)
            self.group.setEnabled(True)
        self._toggle_date_fields()
        self._refresh_metrics()

    def refresh_data(self):
        if not self.api:
            return
        try:
            students = self.api.get("/students").json().get("items", [])
            subjects = self.api.get("/subjects").json().get("items", [])
            groups = self.api.get("/groups").json().get("items", [])

            self.students = sorted(students, key=lambda x: (str(x.get("code", "")), str(x.get("fullName", ""))))
            self.subjects = sorted(subjects, key=lambda x: (str(x.get("period", "")), str(x.get("code", ""))))
            self.groups = sorted(groups, key=lambda x: (str(x.get("period", "")), str(x.get("name", ""))))

            current_student = self.student.currentData()
            current_subject = self.subject.currentData()
            current_group = self.group.currentData()

            self.student.blockSignals(True)
            self.subject.blockSignals(True)
            self.group.blockSignals(True)

            self.student.clear()
            self.subject.clear()
            self.group.clear()
            self.student.addItem("Todos", None)
            self.subject.addItem("Todas", None)
            self.group.addItem("Todos", None)

            for item in self.students:
                self.student.addItem(f"{item.get('code', '')} - {item.get('fullName', '')}", item)

            for item in self.subjects:
                if item.get("period") == self.semester.currentText():
                    self.subject.addItem(f"{item.get('code', '')} - {item.get('name', '')}", item)

            for item in self.groups:
                if item.get("period") == self.semester.currentText():
                    self.group.addItem(f"{item.get('name', '')}", item)

            self._restore_combo(self.student, current_student)
            self._restore_combo(self.subject, current_subject)
            self._restore_combo(self.group, current_group)

            self.student.blockSignals(False)
            self.subject.blockSignals(False)
            self.group.blockSignals(False)
            self._toggle_date_fields()
            self._refresh_metrics()
        except Exception as exc:
            QMessageBox.warning(self, "Error", str(exc))

    def _restore_combo(self, combo, previous):
        if not previous:
            return
        for index in range(combo.count()):
            data = combo.itemData(index)
            if data and data.get("_id") == previous.get("_id"):
                combo.setCurrentIndex(index)
                break

    def _query(self, include_dates=False):
        params = [f"period={self.semester.currentText()}"]
        student = self.student.currentData()
        subject = self.subject.currentData()
        group = self.group.currentData()
        if student:
            params.append(f"studentId={student['_id']}")
        if subject:
            params.append(f"subjectId={subject['_id']}")
        if group:
            params.append(f"groupId={group['_id']}")
        if include_dates:
            params.append(f"dateFrom={self.date_from.date().toString('yyyy-MM-dd')}")
            params.append(f"dateTo={self.date_to.date().toString('yyyy-MM-dd')}")
        return "&".join(params)

    def _selected_route(self, mode, output):
        routes = {
            ("Completo", "pdf"): "/reports/pdf/combined",
            ("Notas", "pdf"): "/reports/pdf/grades",
            ("Asistencia", "pdf"): "/reports/pdf/attendance",
            ("Completo", "excel"): "/reports/excel/combined",
            ("Notas", "excel"): "/reports/excel/grades",
            ("Asistencia", "excel"): "/reports/excel/attendance",
            ("Consolidado", "pdf"): "/reports/pdf/consolidado",
            ("Consolidado", "excel"): "/reports/excel/consolidado",
        }
        return routes[(mode, output)]

    def export_pdf(self):
        if not self.api:
            return
        route = self._selected_route(self.kind.currentText(), "pdf")
        route = f"{route}?{self._query(include_dates=self.kind.currentText() == 'Asistencia')}"
        path, _ = QFileDialog.getSaveFileName(self, "Guardar PDF", "", "PDF Files (*.pdf)")
        if not path:
            return
        try:
            response = self.api.download(route)
            response.raise_for_status()
            with open(path, "wb") as handle:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        handle.write(chunk)
            QMessageBox.information(self, "Exportado", "PDF generado correctamente.")
        except Exception as exc:
            QMessageBox.warning(self, "Error", str(exc))

    def export_excel(self):
        if not self.api:
            return
        route = self._selected_route(self.kind.currentText(), "excel")
        route = f"{route}?{self._query(include_dates=self.kind.currentText() == 'Asistencia')}"
        path, _ = QFileDialog.getSaveFileName(self, "Guardar Excel", "", "Excel Files (*.xlsx)")
        if not path:
            return
        try:
            response = self.api.download(route)
            response.raise_for_status()
            with open(path, "wb") as handle:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        handle.write(chunk)
            QMessageBox.information(self, "Exportado", "Excel generado correctamente.")
        except Exception as exc:
            QMessageBox.warning(self, "Error", str(exc))
