from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QMainWindow,
    QWidget,
    QHBoxLayout,
    QVBoxLayout,
    QLabel,
    QPushButton,
    QFrame,
    QStackedWidget,
    QScrollArea,
    QSizePolicy,
)

from ui.theme import Theme
from ui.dashboard_widget import DashboardWidget
from ui.students_widget import StudentsWidget
from ui.subjects_widget import SubjectsWidget
from ui.grades_widget import GradesWidget
from ui.attendance_widget import AttendanceWidget
from ui.ai_widget import AiWidget
from ui.reports_widget import ReportsWidget
from ui.notifications_widget import NotificationsWidget
from ui.settings_widget import SettingsWidget
from services.sync_worker import SyncWorker


class NavButton(QPushButton):
    def __init__(self, text: str):
        super().__init__(text)
        self.setCheckable(True)
        self.setCursor(Qt.CursorShape.PointingHandCursor)


def wrap_scroll(widget: QWidget) -> QScrollArea:
    scroll = QScrollArea()
    scroll.setWidgetResizable(True)
    scroll.setFrameShape(QFrame.Shape.NoFrame)
    scroll.setWidget(widget)
    return scroll


class MainWindow(QMainWindow):
    def __init__(self, api_client=None, user=None):
        super().__init__()
        self.setWindowTitle("UTS Académico - Panel")
        self.resize(1600, 960)
        self.setMinimumSize(1360, 860)
        self.api = api_client
        self.user = user or {}
        self.sync = None
        # El tema (claro/oscuro) se aplica a nivel de QApplication en main.py.

        root = QWidget()
        root_layout = QHBoxLayout(root)
        root_layout.setContentsMargins(18, 18, 18, 18)
        root_layout.setSpacing(16)

        self.sidebar = QFrame()
        self.sidebar.setObjectName("Sidebar")
        self.sidebar.setFixedWidth(300)
        side_layout = QVBoxLayout(self.sidebar)
        side_layout.setContentsMargins(18, 18, 18, 18)
        side_layout.setSpacing(12)

        brand = QLabel("UTS Académico")
        brand.setObjectName("AppTitle")
        # Sin setFont: fijaba Segoe UI en duro y anulaba tanto la escala de
        # #AppTitle como la familia Inter que carga el tema.
        subtitle = QLabel("Espacio docente")
        subtitle.setStyleSheet(f"color: {Theme.TEXT_MUTED};")
        side_layout.addWidget(brand)
        side_layout.addWidget(subtitle)

        self.nav_buttons = []
        nav_items = [
            ("Panel", 0),
            ("Estudiantes", 1),
            ("Materias", 2),
            ("Notas", 3),
            ("Asistencia", 4),
            ("IA", 5),
            ("Reportes", 6),
            ("Notificaciones", 7),
            ("Configuraciones", 8),
        ]
        for text, index in nav_items:
            btn = NavButton(text)
            btn.clicked.connect(lambda _, i=index: self.set_page(i))
            btn.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
            self.nav_buttons.append(btn)
            side_layout.addWidget(btn)

        side_layout.addStretch(1)

        self.sync_status = QLabel("Sin conexión")
        self.sync_status.setStyleSheet(f"color: {Theme.TEXT_MUTED};")
        side_layout.addWidget(self.sync_status)

        connect_btn = QPushButton("Activar sincronización")
        connect_btn.setObjectName("Primary")
        connect_btn.clicked.connect(self.start_sync)
        side_layout.addWidget(connect_btn)

        self.logout_btn = QPushButton("Salir")
        self.logout_btn.clicked.connect(self.close_app)
        side_layout.addWidget(self.logout_btn)

        content = QFrame()
        content_layout = QVBoxLayout(content)
        content_layout.setContentsMargins(0, 0, 0, 0)
        content_layout.setSpacing(16)

        self.header = QFrame()
        self.header.setObjectName("TopBar")
        header_layout = QHBoxLayout(self.header)
        header_layout.setContentsMargins(20, 18, 20, 18)

        self.page_title = QLabel("Panel")
        self.page_title.setObjectName("PageTitle")
        self.page_subtitle = QLabel("Resumen académico y control operativo")
        self.page_subtitle.setObjectName("SectionSubtitle")

        title_box = QVBoxLayout()
        title_box.addWidget(self.page_title)
        title_box.addWidget(self.page_subtitle)
        header_layout.addLayout(title_box)
        header_layout.addStretch(1)

        name = self.user.get("fullName") or "Docente UTS"
        self.user_chip = QLabel(name)
        self.user_chip.setStyleSheet(
            f"padding: 10px 14px; border-radius: 14px; background: {Theme.SURFACE_ALT};"
            f" border: 1px solid {Theme.BORDER}; color: {Theme.TEXT}; font-weight: 600;"
        )
        header_layout.addWidget(self.user_chip)

        self.stack = QStackedWidget()
        self.pages = [
            wrap_scroll(DashboardWidget(api_client=self.api)),
            wrap_scroll(StudentsWidget(api_client=self.api)),
            wrap_scroll(SubjectsWidget(api_client=self.api, user=self.user)),
            wrap_scroll(GradesWidget(api_client=self.api, user=self.user)),
            wrap_scroll(AttendanceWidget(api_client=self.api, user=self.user)),
            AiWidget(api_client=self.api),
            wrap_scroll(ReportsWidget(api_client=self.api)),
            wrap_scroll(NotificationsWidget(api_client=self.api)),
            wrap_scroll(SettingsWidget(on_logout=self.close_app)),
        ]
        for page in self.pages:
            self.stack.addWidget(page)

        content_layout.addWidget(self.header)
        content_layout.addWidget(self.stack, 1)

        root_layout.addWidget(self.sidebar)
        root_layout.addWidget(content, 1)
        self.setCentralWidget(root)
        self.statusBar().showMessage("Listo")

        self.set_page(0)

    def _sync_message(self, event):
        if isinstance(event, dict):
            event_type = event.get("type")
            if event_type == "sync:connected":
                return "Sincronización conectada"
            if event_type == "sync:ready":
                return "Sincronización lista"
            if event_type == "sync:update":
                data = event.get("data", {})
                entity = data.get("entity", "dato")
                action = data.get("action", "actualizado")
                return f"Sincronización: {entity} {action}"
        return "Sincronización activa"

    def set_page(self, index: int):
        self.stack.setCurrentIndex(index)
        titles = [
            ("Panel", "Resumen académico y control operativo"),
            ("Estudiantes", "Importa, ordena y administra estudiantes"),
            ("Materias", "Gestiona materias y semestre"),
            ("Notas", "Calcula cortes y guarda calificaciones"),
            ("Asistencia", "Registra por fecha y clase"),
            ("IA", "Consulta promedios, riesgo y predicción"),
            ("Reportes", "Exporta PDF y Excel"),
            ("Notificaciones", "Alertas y recordatorios"),
            ("Configuraciones", "Tema, sincronización y sesión"),
        ]
        self.page_title.setText(titles[index][0])
        self.page_subtitle.setText(titles[index][1])
        for i, btn in enumerate(self.nav_buttons):
            btn.setChecked(i == index)

    def start_sync(self):
        if self.sync:
            self.sync_status.setText("Sincronización activa")
            return
        token = getattr(self.api, "access_token", None) if self.api else None
        self.sync = SyncWorker(
            "http://127.0.0.1:4000",
            lambda e: self.sync_status.setText(self._sync_message(e)),
            token=token,
        )
        self.sync.start()
        self.sync_status.setText("Sincronización activa")

    def close_app(self):
        if self.sync:
            self.sync.stop()
        self.close()
