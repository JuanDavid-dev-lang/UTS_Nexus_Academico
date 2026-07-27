from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QWidget,
    QVBoxLayout,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QPushButton,
    QFrame,
    QMessageBox,
)

from services.backend_bootstrap import ensure_backend_running
from services.api_client import ApiClient
from services.session_store import SessionStore
from ui.main_window import MainWindow
from ui.theme import Theme


def _normalize_api_url(value: str) -> str:
    value = value.strip().rstrip("/")
    if value.endswith("/api/v1"):
        return value
    return f"{value}/api/v1"


class LoginWindow(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("UTS Nexus Académico — Acceso")
        self.resize(960, 640)
        self.store = SessionStore()
        self.api = ApiClient(self.store.load_server())

        # Fondo general + tarjeta centrada (DESIGN.md §9).
        outer = QHBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.addStretch(1)

        center = QVBoxLayout()
        center.addStretch(1)

        card = QFrame()
        card.setObjectName("Card")
        card.setFixedWidth(420)
        layout = QVBoxLayout(card)
        layout.setSpacing(12)
        layout.setContentsMargins(32, 32, 32, 32)

        brand = QLabel("UTS Nexus Académico")
        brand.setObjectName("AppTitle")
        brand.setAlignment(Qt.AlignmentFlag.AlignCenter)
        subtitle = QLabel("Accede a tu espacio docente")
        subtitle.setObjectName("SectionSubtitle")
        subtitle.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(brand)
        layout.addWidget(subtitle)
        layout.addSpacing(8)

        self.api_url = QLineEdit()
        self.api_url.setPlaceholderText("http://127.0.0.1:4000")
        self.api_url.setText(self.store.load_server().replace("/api/v1", ""))

        self.email = QLineEdit()
        self.email.setPlaceholderText("Correo")
        self.email.setText("docente@uts.edu.co")

        self.password = QLineEdit()
        self.password.setPlaceholderText("Contraseña")
        self.password.setEchoMode(QLineEdit.EchoMode.Password)
        self.password.setText("(la que genere el seed)")
        self.password.returnPressed.connect(self.open_main)

        self.status = QLabel("Listo")
        self.status.setObjectName("Muted")
        self.status.setAlignment(Qt.AlignmentFlag.AlignCenter)

        btn_save = QPushButton("Guardar servidor")
        btn_save.clicked.connect(self.save_server)

        btn = QPushButton("Entrar")
        btn.setObjectName("Primary")
        btn.setCursor(Qt.CursorShape.PointingHandCursor)
        btn.clicked.connect(self.open_main)

        layout.addWidget(QLabel("Servidor"))
        layout.addWidget(self.api_url)
        layout.addWidget(btn_save)
        layout.addSpacing(6)
        layout.addWidget(QLabel("Correo"))
        layout.addWidget(self.email)
        layout.addWidget(QLabel("Contraseña"))
        layout.addWidget(self.password)
        layout.addWidget(btn)
        layout.addWidget(self.status)

        center.addWidget(card)
        center.addStretch(1)
        outer.addLayout(center)
        outer.addStretch(1)

    def save_server(self):
        api_base = _normalize_api_url(self.api_url.text())
        self.store.save_server(api_base)
        self.api = ApiClient(api_base)
        self.status.setText("Servidor guardado")

    def open_main(self):
        try:
            self.status.setText("Conectando...")
            ensure_backend_running(timeout_seconds=15)
            api_base = _normalize_api_url(self.api_url.text())
            self.store.save_server(api_base)
            self.api = ApiClient(api_base)
            response = self.api.post(
                "/auth/login",
                json={
                    "email": self.email.text().strip(),
                    "password": self.password.text().strip(),
                    "device": "desktop",
                },
            )
            if response.ok:
                data = response.json()
                self.store.save(data["accessToken"], data["refreshToken"])
                self.api.set_tokens(data["accessToken"], data["refreshToken"])
                self.window = MainWindow(api_client=self.api, user=data["user"])
                self.window.show()
                self.close()
                return
            self.status.setText(f"Login falló: {response.status_code}")
            QMessageBox.warning(self, "Login falló", f"{response.status_code}: {response.text}")
        except Exception as exc:
            self.status.setText(f"Login falló: {exc}")
            QMessageBox.critical(self, "Login falló", str(exc))
