import socketio
import threading


class SyncWorker(threading.Thread):
    daemon = True

    def __init__(self, ws_url: str, on_event, token: str | None = None):
        super().__init__()
        self.ws_url = ws_url
        self.on_event = on_event
        self.token = token
        self._should_stop = False
        self.sio = socketio.Client(reconnection=True, logger=False, engineio_logger=False)

        @self.sio.event
        def connect():
            self.on_event({"type": "sync:connected"})

        @self.sio.on("sync:ready")
        def ready(data):
            self.on_event({"type": "sync:ready", "data": data})

        @self.sio.on("sync:update")
        def update(data):
            self.on_event({"type": "sync:update", "data": data})

    def run(self):
        # El backend exige JWT en el handshake (salas por usuario).
        auth = {"token": self.token} if self.token else None
        self.sio.connect(self.ws_url, transports=["websocket"], auth=auth)
        while not self._should_stop:
            self.sio.sleep(1)

    def stop(self):
        self._should_stop = True
        if self.sio.connected:
            self.sio.disconnect()
