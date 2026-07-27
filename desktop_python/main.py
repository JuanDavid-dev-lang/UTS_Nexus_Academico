from PySide6.QtWidgets import QApplication
from ui.login_window import LoginWindow
from ui.theme import set_mode, build_stylesheet
from services.backend_bootstrap import ensure_backend_running
from services.session_store import SessionStore
import sys


def main():
    ensure_backend_running()
    app = QApplication(sys.argv)

    # Aplica el tema (claro/oscuro) guardado a toda la app.
    dark = SessionStore().load_dark_mode()
    set_mode(dark)
    app.setStyleSheet(build_stylesheet(dark))

    window = LoginWindow()
    window.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
