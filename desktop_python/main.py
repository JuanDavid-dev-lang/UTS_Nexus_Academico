from PySide6.QtWidgets import QApplication
from ui.login_window import LoginWindow
from services.backend_bootstrap import ensure_backend_running
import sys


def main():
    ensure_backend_running()
    app = QApplication(sys.argv)
    window = LoginWindow()
    window.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
