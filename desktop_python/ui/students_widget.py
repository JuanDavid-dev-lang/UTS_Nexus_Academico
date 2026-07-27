import csv
from PySide6.QtWidgets import (
    QWidget,
    QVBoxLayout,
    QLabel,
    QTableWidget,
    QTableWidgetItem,
    QFrame,
    QLineEdit,
    QPushButton,
    QFileDialog,
    QMessageBox,
    QHBoxLayout,
    QComboBox,
)


class StudentsWidget(QWidget):
    def __init__(self, api_client=None):
        super().__init__()
        self.api = api_client
        self.students = []
        layout = QVBoxLayout(self)
        layout.setSpacing(16)

        title = QLabel("Estudiantes")
        title.setObjectName("SectionTitle")
        subtitle = QLabel("Importa, ordena y administra estudiantes")
        subtitle.setObjectName("SectionSubtitle")
        layout.addWidget(title)
        layout.addWidget(subtitle)

        top = QFrame()
        top.setObjectName("Card")
        top_layout = QHBoxLayout(top)
        self.search = QLineEdit()
        self.search.setPlaceholderText("Buscar por cédula o nombre")
        self.search.textChanged.connect(self.refresh_data)
        self.group = QComboBox()
        self.group.setMinimumWidth(220)
        import_btn = QPushButton("Importar CSV")
        import_btn.setObjectName("Primary")
        import_btn.clicked.connect(self.import_csv)
        refresh_btn = QPushButton("Actualizar")
        refresh_btn.clicked.connect(self.refresh_data)
        top_layout.addWidget(self.search, 1)
        top_layout.addWidget(QLabel("Matricular en grupo:"))
        top_layout.addWidget(self.group)
        top_layout.addWidget(import_btn)
        top_layout.addWidget(refresh_btn)
        layout.addWidget(top)

        card = QFrame()
        card.setObjectName("Card")
        card_layout = QVBoxLayout(card)
        self.table = QTableWidget(0, 4)
        self.table.setHorizontalHeaderLabels(["Cédula", "Nombres", "Correo", "Programa"])
        self.table.verticalHeader().setVisible(False)
        self.table.setAlternatingRowColors(True)
        self.table.setShowGrid(False)
        card_layout.addWidget(self.table)
        layout.addWidget(card)

        self.load_groups()
        self.refresh_data()

    def load_groups(self):
        if not self.api:
            return
        try:
            groups = self.api.get("/groups").json().get("items", [])
            current = self.group.currentData()
            self.group.blockSignals(True)
            self.group.clear()
            self.group.addItem("— Solo importar (sin matricular) —", None)
            for g in groups:
                self.group.addItem(f"{g.get('name', 'Grupo')} · {g.get('period', '')}", g)
            self.group.blockSignals(False)
            if current:
                idx = self.group.findData(current)
                if idx >= 0:
                    self.group.setCurrentIndex(idx)
        except Exception:
            pass

    def refresh_data(self):
        if not self.api:
            return
        try:
            items = self.api.get("/students").json().get("items", [])
            q = self.search.text().strip().lower()
            if q:
                items = [
                    item for item in items
                    if q in str(item.get("code", "")).lower() or q in str(item.get("fullName", "")).lower()
                ]
            self.students = sorted(items, key=lambda x: (str(x.get("code", "")), str(x.get("fullName", ""))))
            self.table.setRowCount(len(self.students))
            for row, item in enumerate(self.students):
                self.table.setItem(row, 0, QTableWidgetItem(str(item.get("code", ""))))
                self.table.setItem(row, 1, QTableWidgetItem(str(item.get("fullName", ""))))
                self.table.setItem(row, 2, QTableWidgetItem(str(item.get("email", ""))))
                self.table.setItem(row, 3, QTableWidgetItem(str(item.get("program", ""))))
        except Exception as exc:
            QMessageBox.warning(self, "Error", str(exc))

    def import_csv(self):
        path, _ = QFileDialog.getOpenFileName(self, "Importar estudiantes", "", "CSV Files (*.csv)")
        if not path:
            return
        try:
            imported = []
            with open(path, newline="", encoding="utf-8-sig") as handle:
                reader = csv.DictReader(handle)
                for row in reader:
                    code = (row.get("cedula") or row.get("code") or "").strip()
                    name = (row.get("nombres") or row.get("fullName") or "").strip()
                    if not code or not name:
                        continue
                    payload = {
                        "code": code,
                        "fullName": name,
                        "email": (row.get("correo") or f"{code}@uts.edu.co").strip(),
                        "program": (row.get("programa") or "Sin asignar").strip(),
                        "photoUrl": None,
                    }
                    imported.append(payload)

            imported.sort(key=lambda x: (x["code"], x["fullName"]))
            group = self.group.currentData()
            if group:
                # Crea/actualiza estudiantes y los matricula en el grupo seleccionado.
                resp = self.api.post(
                    "/enrollments/bulk",
                    json={"groupId": group["_id"], "students": imported},
                )
                if resp.status_code >= 400:
                    QMessageBox.warning(self, "Error", resp.text)
                    return
                count = resp.json().get("count", len(imported))
                msg = f"Importados y matriculados {count} estudiantes en {group.get('name', 'el grupo')}."
            else:
                self.api.post("/students/bulk", json=imported)
                msg = f"Importados {len(imported)} estudiantes (sin matricular)."
            self.refresh_data()
            QMessageBox.information(self, "Importación", msg)
        except Exception as exc:
            QMessageBox.warning(self, "Error", str(exc))
