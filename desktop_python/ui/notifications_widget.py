from PySide6.QtWidgets import (
    QWidget,
    QVBoxLayout,
    QHBoxLayout,
    QLabel,
    QListWidget,
    QListWidgetItem,
    QPushButton,
    QMessageBox,
)
from PySide6.QtCore import Qt


class NotificationsWidget(QWidget):
    def __init__(self, api_client=None):
        super().__init__()
        self.api = api_client
        layout = QVBoxLayout(self)
        layout.setSpacing(12)

        header = QHBoxLayout()
        title_box = QVBoxLayout()
        title = QLabel("Notificaciones")
        title.setObjectName("SectionTitle")
        subtitle = QLabel("Alertas académicas y riesgo de estudiantes")
        subtitle.setObjectName("SectionSubtitle")
        title_box.addWidget(title)
        title_box.addWidget(subtitle)
        header.addLayout(title_box)
        header.addStretch(1)
        scan = QPushButton("Escanear riesgo")
        scan.setObjectName("Primary")
        scan.clicked.connect(self.scan_risk)
        refresh = QPushButton("Actualizar")
        refresh.clicked.connect(self.refresh_data)
        header.addWidget(scan)
        header.addWidget(refresh)
        layout.addLayout(header)

        self.listw = QListWidget()
        layout.addWidget(self.listw)

        self.refresh_data()

    def refresh_data(self):
        if not self.api:
            return
        try:
            items = self.api.get("/notifications").json().get("items", [])
            self.listw.clear()
            if not items:
                self.listw.addItem(QListWidgetItem("Sin notificaciones."))
                return
            for n in items:
                prefix = "🔴" if n.get("type") == "RISK" else "🔔"
                unread = "" if n.get("readAt") else "  •"
                text = f"{prefix} {n.get('title', '')} — {n.get('message', '')}{unread}"
                item = QListWidgetItem(text)
                item.setData(Qt.ItemDataRole.UserRole, n.get("_id"))
                self.listw.addItem(item)
        except Exception as exc:
            QMessageBox.warning(self, "Error", str(exc))

    def scan_risk(self):
        if not self.api:
            return
        try:
            resp = self.api.post("/notifications/risks/scan")
            data = resp.json()
            QMessageBox.information(
                self,
                "Escaneo de riesgo",
                f"Evaluados: {data.get('evaluados', 0)} · "
                f"En riesgo: {data.get('enRiesgo', 0)} · "
                f"Notificaciones: {data.get('notificaciones', 0)}.",
            )
            self.refresh_data()
        except Exception as exc:
            QMessageBox.warning(self, "Error", str(exc))
