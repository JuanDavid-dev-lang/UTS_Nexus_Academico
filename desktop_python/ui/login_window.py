from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QWidget,
    QVBoxLayout,
    QLabel,
    QLineEdit,
    QPushButton,
    QMessageBox,
)

from services.backend_bootstrap import ensure_backend_running
from services.api_client import ApiClient
from services.session_store import SessionStore
from ui.main_window import MainWindow


def _normalize_api_url(value: str) -> str:
    value = value.strip().rstrip("/")
    if value.endswith("/api/v1"):
        return value
    return f"{value}/api/v1"


class LoginWindow(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("UTS Académico - Acceso")
        self.store = SessionStore()
        self.api = ApiClient(self.store.load_server())

        layout = QVBoxLayout(self)
        layout.setSpacing(10)
        layout.setContentsMargins(24, 24, 24, 24)

        title = QLabel("UTS Académico")
        title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(title)

        self.api_url = QLineEdit()
        self.api_url.setPlaceholderText("http://127.0.0.1:4000")
        self.api_url.setText(self.store.load_server().replace("/api/v1", ""))

        self.email = QLineEdit()
        self.email.setPlaceholderText("Correo")
        self.email.setText("docente@uts.edu.co")

        self.password = QLineEdit()
        self.password.setPlaceholderText("Contraseña")
        self.password.setEchoMode(QLineEdit.EchoMode.Password)
        self.password.setText("Uts12345!")

        self.status = QLabel("Listo")
        self.status.setAlignment(Qt.AlignmentFlag.AlignCenter)

        btn_save = QPushButton("Guardar servidor")
        btn_save.clicked.connect(self.save_server)

        btn = QPushButton("Entrar")
        btn.clicked.connect(self.open_main)

        layout.addWidget(self.api_url)
        layout.addWidget(btn_save)
        layout.addWidget(self.email)
        layout.addWidget(self.password)
        layout.addWidget(self.status)
        layout.addWidget(btn)

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
