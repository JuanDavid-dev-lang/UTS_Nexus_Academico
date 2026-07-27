class SyncService:
    def __init__(self, base_url: str):
        self.base_url = base_url

    def push_change(self, entity: str, payload: dict):
        return {"ok": True, "entity": entity, "payload": payload}

