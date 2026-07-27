from PySide6.QtWidgets import (
    QWidget,
    QVBoxLayout,
    QLabel,
    QFrame,
    QFormLayout,
    QDoubleSpinBox,
    QComboBox,
    QPushButton,
    QGridLayout,
    QMessageBox,
    QHBoxLayout,
)
from PySide6.QtCore import Qt

from ui.theme import Theme

# Mapeo fijo: cada spinbox de un corte corresponde a un componente canónico del backend.
COMPONENTES = ["TRABAJOS", "PARCIALES", "AUTOEVALUACION"]


class GradesWidget(QWidget):
    def __init__(self, api_client=None, user=None):
        super().__init__()
        self.api = api_client
        self.user = user or {}
        self.subjects = []
        self.groups = []
        self.corte_fields = []

        root = QVBoxLayout(self)
        root.setSpacing(16)

        hero = QFrame()
        hero.setObjectName("HeroCard")
        hero_layout = QHBoxLayout(hero)
        hero_layout.setContentsMargins(20, 18, 20, 18)

        title_box = QVBoxLayout()
        title = QLabel("Notas")
        title.setObjectName("SectionTitle")
        subtitle = QLabel("Cortes 33% / 33% / 34% con trabajos 30%, parciales 60% y autoevaluacion 10%.")
        subtitle.setObjectName("SectionSubtitle")
        title_box.addWidget(title)
        title_box.addWidget(subtitle)
        hero_layout.addLayout(title_box)
        hero_layout.addStretch(1)
        hero_layout.addWidget(self._chip("Motor de notas del backend"))
        hero_layout.addWidget(self._chip("Guardado en Atlas"))
        root.addWidget(hero)

        top = QFrame()
        top.setObjectName("FilterCard")
        top_layout = QGridLayout(top)
        top_layout.setHorizontalSpacing(12)
        top_layout.setVerticalSpacing(10)

        self.semester = QComboBox()
        self.semester.addItems(["2026-1", "2026-2"])
        self.semester.currentTextChanged.connect(lambda _: self.refresh_data())
        self.subject = QComboBox()
        self.subject.currentIndexChanged.connect(lambda _: self.load_groups())
        self.group = QComboBox()
        self.group.currentIndexChanged.connect(lambda _: self.load_students())
        self.student = QComboBox()
        self.student.currentIndexChanged.connect(lambda _: self.load_student_grades())
        self.final_preview = QLabel("0.00")
        self.final_preview.setStyleSheet(f"font-size: 30px; font-weight: 800; color: {Theme.PRIMARY};")

        top_layout.addWidget(QLabel("Semestre"), 0, 0)
        top_layout.addWidget(QLabel("Materia"), 0, 1)
        top_layout.addWidget(QLabel("Grupo"), 0, 2)
        top_layout.addWidget(QLabel("Estudiante"), 0, 3)
        top_layout.addWidget(QLabel("Nota final (backend)"), 0, 4)
        top_layout.addWidget(self.semester, 1, 0)
        top_layout.addWidget(self.subject, 1, 1)
        top_layout.addWidget(self.group, 1, 2)
        top_layout.addWidget(self.student, 1, 3)
        top_layout.addWidget(self.final_preview, 1, 4)
        root.addWidget(top)

        info_row = QHBoxLayout()
        info_row.setSpacing(12)
        info_row.addWidget(self._metric("Corte 1", "33%"))
        info_row.addWidget(self._metric("Corte 2", "33%"))
        info_row.addWidget(self._metric("Corte 3", "34%"))
        root.addLayout(info_row)

        card = QFrame()
        card.setObjectName("Card")
        form = QFormLayout(card)
        form.setLabelAlignment(Qt.AlignmentFlag.AlignLeft)
        form.setFormAlignment(Qt.AlignmentFlag.AlignTop)
        form.setVerticalSpacing(12)

        for corte in ["Corte 1", "Corte 2", "Corte 3"]:
            wrap = QFrame()
            wrap.setObjectName("Surface")
            wrap_layout = QGridLayout(wrap)
            wrap_layout.setHorizontalSpacing(12)
            wrap_layout.setVerticalSpacing(8)

            grade_style = f"font-weight: 800; color: {Theme.PRIMARY}; font-size: 18px;"
            inp1 = self._spin()
            inp2 = self._spin()
            inp3 = self._spin()
            score = QLabel("0.00")
            score.setStyleSheet(grade_style)

            wrap_layout.addWidget(QLabel(corte), 0, 0, 1, 2)
            wrap_layout.addWidget(QLabel("Trabajos 30%"), 1, 0)
            wrap_layout.addWidget(inp1, 1, 1)
            wrap_layout.addWidget(QLabel("Parciales 60%"), 2, 0)
            wrap_layout.addWidget(inp2, 2, 1)
            wrap_layout.addWidget(QLabel("Autoevaluacion 10%"), 3, 0)
            wrap_layout.addWidget(inp3, 3, 1)
            wrap_layout.addWidget(QLabel("Nota del corte"), 0, 2)
            wrap_layout.addWidget(score, 1, 2)

            # inputs alineados con COMPONENTES: [TRABAJOS, PARCIALES, AUTOEVALUACION]
            self.corte_fields.append((corte, [inp1, inp2, inp3], score))
            for inp in (inp1, inp2, inp3):
                inp.valueChanged.connect(self.calculate)
            form.addRow(wrap)

        actions = QFrame()
        actions.setObjectName("ActionCard")
        actions_layout = QGridLayout(actions)
        actions_layout.setHorizontalSpacing(12)
        actions_layout.setVerticalSpacing(10)
        calc = QPushButton("Calcular (previsualizacion)")
        calc.clicked.connect(self.calculate)
        save = QPushButton("Guardar en base")
        save.setObjectName("Primary")
        save.clicked.connect(self.save)
        actions_layout.addWidget(calc, 0, 2)
        actions_layout.addWidget(save, 0, 3)
        form.addRow(actions)
        root.addWidget(card)

        self.refresh_data()
        self.calculate()

    def _spin(self):
        spin = QDoubleSpinBox()
        spin.setRange(0, 5)
        spin.setDecimals(2)
        spin.setSingleStep(0.1)
        return spin

    def _chip(self, text):
        chip = QLabel(text)
        chip.setStyleSheet(
            f"padding: 7px 12px; border-radius: 999px; background: {Theme.SURFACE_ALT}; border: 1px solid {Theme.BORDER}; color: {Theme.TEXT};"
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
        return card

    def refresh_data(self):
        if not self.api:
            return
        try:
            subjects = self.api.get("/subjects").json().get("items", [])
            groups = self.api.get("/groups").json().get("items", [])
            self.subjects = subjects
            self.groups = groups
            period = self.semester.currentText()
            self.subject.blockSignals(True)
            self.subject.clear()
            for item in subjects:
                if period and item.get("period") != period:
                    continue
                self.subject.addItem(f"{item.get('code', '')} - {item.get('name', '')}", item)
            self.subject.blockSignals(False)
            self.load_groups()
        except Exception:
            pass

    def load_groups(self):
        subject = self.subject.currentData()
        period = self.semester.currentText()
        self.group.blockSignals(True)
        self.group.clear()
        for item in self.groups:
            if subject and item.get("subjectId") != subject.get("_id"):
                continue
            if period and item.get("period") != period:
                continue
            self.group.addItem(item.get("name", "Grupo"), item)
        self.group.blockSignals(False)
        self.load_students()

    def load_students(self):
        self.student.blockSignals(True)
        self.student.clear()
        group = self.group.currentData()
        if not self.api or not group:
            self.student.blockSignals(False)
            return
        try:
            resp = self.api.get(f"/enrollments?groupId={group['_id']}").json()
            enrollments = resp.get("items", [])
            # El estudiante viene poblado (code, fullName). Orden: cedula, nombres.
            rows = []
            for en in enrollments:
                st = en.get("studentId") or {}
                if isinstance(st, dict):
                    rows.append(st)
            for st in sorted(rows, key=lambda x: (str(x.get("code", "")), str(x.get("fullName", "")))):
                self.student.addItem(f"{st.get('code', '')} - {st.get('fullName', '')}", st)
        except Exception:
            pass
        self.student.blockSignals(False)
        self.load_student_grades()

    def load_student_grades(self):
        """Precarga las notas existentes del estudiante y muestra la nota consolidada real."""
        for _corte, inputs, score_lbl in self.corte_fields:
            for inp in inputs:
                inp.blockSignals(True)
                inp.setValue(0)
                inp.blockSignals(False)
            score_lbl.setText("0.00")
        self.final_preview.setText("0.00")

        student = self.student.currentData()
        subject = self.subject.currentData()
        if not self.api or not student or not subject:
            return
        period = self.semester.currentText()
        try:
            params = f"?studentId={student['_id']}&subjectId={subject['_id']}&period={period}"
            grades = self.api.get(f"/grades{params}").json().get("items", [])
            for g in grades:
                corte = g.get("corte")
                ctype = g.get("componentType")
                if corte in (1, 2, 3) and ctype in COMPONENTES:
                    inp = self.corte_fields[corte - 1][1][COMPONENTES.index(ctype)]
                    inp.blockSignals(True)
                    inp.setValue(float(g.get("score", 0)))
                    inp.blockSignals(False)
            self.calculate()
            # Nota final autoritativa desde el backend.
            cons = self.api.get(f"/grades/consolidado{params}").json().get("items", [])
            if cons:
                self.final_preview.setText(f"{cons[0].get('notaFinal', 0):.2f}")
        except Exception:
            pass

    def calculate(self):
        """Previsualización local (misma fórmula del backend). El valor oficial lo da el backend."""
        cortes_peso = [0.33, 0.33, 0.34]
        total = 0.0
        for idx, (_corte, inputs, score_lbl) in enumerate(self.corte_fields):
            corte_score = (inputs[0].value() * 0.30) + (inputs[1].value() * 0.60) + (inputs[2].value() * 0.10)
            score_lbl.setText(f"{corte_score:.2f}")
            total += corte_score * cortes_peso[idx]
        self.final_preview.setText(f"{total:.2f}")

    def save(self):
        if not self.api or not self.user:
            return
        try:
            student = self.student.currentData()
            subject = self.subject.currentData()
            group = self.group.currentData()
            if not student or not subject or not group:
                QMessageBox.warning(self, "Faltan datos", "Selecciona materia, grupo y estudiante.")
                return
            period = self.semester.currentText()
            errores = []
            for idx, (_corte, inputs, _score_lbl) in enumerate(self.corte_fields):
                corte_num = idx + 1
                for c_idx, component_type in enumerate(COMPONENTES):
                    resp = self.api.post(
                        "/grades",
                        json={
                            "studentId": student["_id"],
                            "subjectId": subject["_id"],
                            "groupId": group["_id"],
                            "teacherId": self.user.get("id"),
                            "corte": corte_num,
                            "componentType": component_type,
                            "label": "Nota",
                            "score": round(inputs[c_idx].value(), 2),
                            "maxScore": 5,
                            "period": period,
                        },
                    )
                    if resp.status_code >= 400:
                        errores.append(f"C{corte_num} {component_type}: {resp.text}")
            if errores:
                QMessageBox.warning(self, "Guardado parcial", "\n".join(errores[:5]))
            else:
                QMessageBox.information(self, "Guardado", "Notas guardadas correctamente.")
                self.load_student_grades()
        except Exception as exc:
            QMessageBox.warning(self, "Error", str(exc))
