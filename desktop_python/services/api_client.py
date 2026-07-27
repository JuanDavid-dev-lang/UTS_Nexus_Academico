import requests


class ApiClient:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")
        self.access_token = None
        self.refresh_token = None

    def set_tokens(self, access_token: str | None, refresh_token: str | None = None):
        self.access_token = access_token
        self.refresh_token = refresh_token

    def _headers(self):
        headers = {"Content-Type": "application/json"}
        if self.access_token:
            headers["Authorization"] = f"Bearer {self.access_token}"
        return headers

    def get(self, path: str):
        return requests.get(f"{self.base_url}{path}", headers=self._headers(), timeout=20)

    def post(self, path: str, json=None):
        return requests.post(f"{self.base_url}{path}", json=json, headers=self._headers(), timeout=20)

    def patch(self, path: str, json=None):
        return requests.patch(f"{self.base_url}{path}", json=json, headers=self._headers(), timeout=20)

    def download(self, path: str):
        return requests.get(f"{self.base_url}{path}", headers=self._headers(), timeout=60, stream=True)
