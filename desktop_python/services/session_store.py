from PySide6.QtCore import QSettings


class SessionStore:
    def __init__(self):
        self.settings = QSettings("UTS", "UTSAcademico")

    def save(self, access_token: str, refresh_token: str):
        self.settings.setValue("access_token", access_token)
        self.settings.setValue("refresh_token", refresh_token)

    def save_server(self, api_base_url: str):
        self.settings.setValue("api_base_url", api_base_url)

    def load(self):
        return (
            self.settings.value("access_token", ""),
            self.settings.value("refresh_token", ""),
        )

    def load_server(self):
        return self.settings.value("api_base_url", "http://127.0.0.1:4000/api/v1")

    def save_dark_mode(self, dark: bool):
        self.settings.setValue("dark_mode", "1" if dark else "0")

    def load_dark_mode(self) -> bool:
        return str(self.settings.value("dark_mode", "0")) in ("1", "true", "True")

    def clear(self):
        self.settings.remove("access_token")
        self.settings.remove("refresh_token")
