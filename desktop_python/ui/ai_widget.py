"""
Asistente IA (escritorio) — chat conversacional con la IA local (Ollama).

Habla con el backend en /ai/chat, que a su vez usa Ollama con el contexto
académico real del docente. La petición se hace en un hilo aparte (QThread)
para no congelar la interfaz mientras el modelo responde.
"""
from PySide6.QtCore import Qt, QThread, Signal
from PySide6.QtWidgets import (
    QWidget,
    QVBoxLayout,
    QHBoxLayout,
    QLabel,
    QTextEdit,
    QPushButton,
    QFrame,
    QScrollArea,
)

from ui.theme import Theme
from ui.components import section_header


SUGERENCIAS = [
    "¿Quiénes están en riesgo y por qué?",
    "¿Cuál es el promedio del grupo?",
    "¿Qué estudiante tiene la peor asistencia?",
    "Dame recomendaciones para los que van mal",
]


class _ChatWorker(QThread):
    """Envía la consulta a /ai/chat sin bloquear la UI."""

    done = Signal(dict)
    failed = Signal(str)

    def __init__(self, api, message, history):
        super().__init__()
        self.api = api
        self.message = message
        self.history = history

    def run(self):
        try:
            resp = self.api.post(
                "/ai/chat",
                json={"message": self.message, "history": self.history},
            )
            if resp.ok:
                self.done.emit(resp.json())
            else:
                self.failed.emit(f"{resp.status_code}: {resp.text[:200]}")
        except Exception as exc:  # noqa: BLE001
            self.failed.emit(str(exc))


class _StatusWorker(QThread):
    """Consulta /ai/status para saber si Ollama está activo."""

    ready = Signal(dict)

    def __init__(self, api):
        super().__init__()
        self.api = api

    def run(self):
        try:
            resp = self.api.get("/ai/status")
            self.ready.emit(resp.json() if resp.ok else {})
        except Exception:  # noqa: BLE001
            self.ready.emit({})


class AiWidget(QWidget):
    def __init__(self, api_client=None):
        super().__init__()
        self.api = api_client
        self.history = []  # [{role, content}]
        self._worker = None
        self._status_worker = None
        self._typing = None

        root = QVBoxLayout(self)
        root.setSpacing(Theme.SPACE_GAP)

        header = QHBoxLayout()
        header.addWidget(section_header(
            "Asistente IA",
            "Pregunta en lenguaje natural sobre notas, riesgo y asistencia",
        ))
        header.addStretch(1)
        self.clear_btn = QPushButton("Nueva conversación")
        self.clear_btn.clicked.connect(self.reset_chat)
        header.addWidget(self.clear_btn)
        root.addLayout(header)

        # Banner de estado de la IA local.
        self.status = QLabel("Verificando IA local…")
        self.status.setStyleSheet(
            f"background: {Theme.INFO_SOFT}; color: {Theme.INFO};"
            f"border-radius: 10px; padding: 8px 12px; font-weight: 600;"
        )
        root.addWidget(self.status)

        # Área de mensajes (scroll).
        self.scroll = QScrollArea()
        self.scroll.setWidgetResizable(True)
        self.scroll.setFrameShape(QFrame.Shape.NoFrame)
        self.messages_host = QWidget()
        self.messages_layout = QVBoxLayout(self.messages_host)
        self.messages_layout.setContentsMargins(4, 4, 4, 4)
        self.messages_layout.setSpacing(8)
        self.messages_layout.addStretch(1)
        self.scroll.setWidget(self.messages_host)
        root.addWidget(self.scroll, 1)

        # Sugerencias iniciales.
        suggestions = QHBoxLayout()
        suggestions.setSpacing(8)
        for s in SUGERENCIAS[:3]:
            chip = QPushButton(s)
            chip.setCursor(Qt.CursorShape.PointingHandCursor)
            chip.clicked.connect(lambda _=False, t=s: self._send(t))
            suggestions.addWidget(chip)
        root.addLayout(suggestions)

        # Barra de entrada.
        input_row = QHBoxLayout()
        self.input = QTextEdit()
        self.input.setPlaceholderText("Escribe tu pregunta…")
        self.input.setFixedHeight(64)
        self.send_btn = QPushButton("Enviar")
        self.send_btn.setObjectName("Primary")
        self.send_btn.setFixedWidth(120)
        self.send_btn.clicked.connect(lambda: self._send())
        input_row.addWidget(self.input, 1)
        input_row.addWidget(self.send_btn)
        root.addLayout(input_row)

        self._welcome()
        self._check_status()

    # ── Estado / helpers ─────────────────────────────────────────────
    def _check_status(self):
        if not self.api:
            self.status.setText("Sin conexión al backend.")
            return
        self._status_worker = _StatusWorker(self.api)
        self._status_worker.ready.connect(self._on_status)
        self._status_worker.start()

    def _on_status(self, data: dict):
        ok = data.get("available") and data.get("modelReady") and data.get("enabled")
        if ok:
            self.status.setText(f"● IA local activa · {data.get('model', '')}")
            self.status.setStyleSheet(
                f"background: {Theme.SUCCESS_SOFT}; color: {Theme.SUCCESS};"
                f"border-radius: 10px; padding: 8px 12px; font-weight: 600;"
            )
        else:
            self.status.setText("● IA local no disponible — respuestas básicas por reglas")
            self.status.setStyleSheet(
                f"background: {Theme.WARNING_SOFT}; color: #B45309;"
                f"border-radius: 10px; padding: 8px 12px; font-weight: 600;"
            )

    def _welcome(self):
        self._add_bubble(
            "¡Hola! Soy tu asistente académico. Puedo analizar el rendimiento, la "
            "asistencia y el riesgo de tus estudiantes. Pregúntame lo que quieras.",
            role="assistant",
        )

    def reset_chat(self):
        self.history = []
        while self.messages_layout.count() > 1:  # deja el stretch final
            item = self.messages_layout.takeAt(0)
            w = item.widget()
            if w:
                w.deleteLater()
        self._welcome()

    # ── Envío ────────────────────────────────────────────────────────
    def _send(self, preset=None):
        if self._worker and self._worker.isRunning():
            return
        text = (preset if isinstance(preset, str) else self.input.toPlainText()).strip()
        if not text:
            return
        if not self.api:
            self._add_bubble("⚠️ No hay conexión con el backend.", role="assistant", tone="error")
            return

        self.input.clear()
        self._add_bubble(text, role="user")
        prev_history = list(self.history)
        self.history.append({"role": "user", "content": text})

        self.send_btn.setEnabled(False)
        self.send_btn.setText("Pensando…")
        self._typing = self._add_bubble("⏳ Pensando…", role="assistant", tone="muted")

        self._worker = _ChatWorker(self.api, text, prev_history)
        self._worker.done.connect(self._on_reply)
        self._worker.failed.connect(self._on_error)
        self._worker.start()

    def _on_reply(self, data: dict):
        self._remove_typing()
        answer = data.get("answer", "(sin respuesta)")
        source = data.get("source")
        self.history.append({"role": "assistant", "content": answer})
        tone = "muted" if source == "rules" else None
        self._add_bubble(answer, role="assistant", tone=tone)
        self._restore_button()

    def _on_error(self, message: str):
        self._remove_typing()
        friendly = message
        if message.startswith("403"):
            friendly = "Este asistente es para docentes. Tu rol no tiene acceso."
        self._add_bubble(f"⚠️ {friendly}", role="assistant", tone="error")
        self._restore_button()

    def _restore_button(self):
        self.send_btn.setEnabled(True)
        self.send_btn.setText("Enviar")

    def _remove_typing(self):
        if self._typing is not None:
            self._typing.deleteLater()
            self._typing = None

    # ── Render de burbujas ───────────────────────────────────────────
    def _add_bubble(self, text: str, role: str, tone=None):
        is_user = role == "user"
        if is_user:
            bg, fg = Theme.PRIMARY, "#FFFFFF"
        elif tone == "error":
            bg, fg = Theme.DANGER_SOFT, Theme.DANGER
        elif tone == "muted":
            bg, fg = Theme.SURFACE_ALT, Theme.TEXT_MUTED
        else:
            bg, fg = Theme.SURFACE_ALT, Theme.TEXT

        bubble = QLabel(text)
        bubble.setWordWrap(True)
        bubble.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        bubble.setMaximumWidth(560)
        bubble.setStyleSheet(
            f"background: {bg}; color: {fg}; border-radius: 14px;"
            f"padding: 10px 14px; font-size: {Theme.FS_BODY}px;"
        )

        wrapper = QWidget()
        row = QHBoxLayout(wrapper)
        row.setContentsMargins(0, 0, 0, 0)
        if is_user:
            row.addStretch(1)
            row.addWidget(bubble)
        else:
            row.addWidget(bubble)
            row.addStretch(1)

        self.messages_layout.insertWidget(self.messages_layout.count() - 1, wrapper)
        self._scroll_to_bottom()
        return wrapper

    def _scroll_to_bottom(self):
        bar = self.scroll.verticalScrollBar()
        bar.setValue(bar.maximum())
