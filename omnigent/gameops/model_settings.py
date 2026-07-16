"""Encrypted local persistence for the active GameOps model configuration."""

from __future__ import annotations

import base64
import hashlib
import sqlite3
from pathlib import Path
from urllib.parse import urlparse

from cryptography.fernet import Fernet

from omnigent.gameops.schemas import ModelSettingsPublic, ModelSettingsUpdateRequest


class GameOpsModelSettingsStore:
    def __init__(self, path: str | Path, encryption_key: bytes) -> None:
        self._path = Path(path)
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._cipher = Fernet(base64.urlsafe_b64encode(hashlib.sha256(encryption_key).digest()))
        with sqlite3.connect(self._path) as connection:
            connection.execute("CREATE TABLE IF NOT EXISTS gameops_model_settings (id INTEGER PRIMARY KEY CHECK (id = 1), provider TEXT NOT NULL, model TEXT NOT NULL, base_url TEXT, encrypted_key TEXT NOT NULL, version INTEGER NOT NULL)")

    def save(self, request: ModelSettingsUpdateRequest) -> ModelSettingsPublic:
        with sqlite3.connect(self._path) as connection:
            current = connection.execute(
                "SELECT encrypted_key, version FROM gameops_model_settings WHERE id = 1"
            ).fetchone()
            if request.base_url:
                validate_base_url(request.base_url)
            if not request.api_key and current is None:
                raise ValueError("api_key is required for the first saved model configuration")
            encrypted = (
                self._cipher.encrypt(request.api_key.encode()).decode()
                if request.api_key
                else current[0]
            )
            version = (current[1] if current else 0) + 1
            connection.execute(
                "INSERT OR REPLACE INTO gameops_model_settings VALUES (1, ?, ?, ?, ?, ?)",
                (request.provider, request.model, request.base_url, encrypted, version),
            )
        return self.public()

    def public(self) -> ModelSettingsPublic:
        with sqlite3.connect(self._path) as connection:
            row = connection.execute("SELECT provider, model, base_url, encrypted_key, version FROM gameops_model_settings WHERE id = 1").fetchone()
        if row is None:
            return ModelSettingsPublic(configured=False, source="none")
        key = self._cipher.decrypt(row[3].encode()).decode()
        return ModelSettingsPublic(provider=row[0], model=row[1], base_url=row[2], configured=True, key_suffix=f"...{key[-4:]}", source="saved", version=row[4])

    def resolved(self) -> tuple[str, str, str | None, str, int] | None:
        with sqlite3.connect(self._path) as connection:
            row = connection.execute("SELECT provider, model, base_url, encrypted_key, version FROM gameops_model_settings WHERE id = 1").fetchone()
        if row is None:
            return None
        return row[0], row[1], row[2], self._cipher.decrypt(row[3].encode()).decode(), row[4]


def validate_base_url(base_url: str) -> None:
    parsed = urlparse(base_url)
    loopback_hosts = {"localhost", "127.0.0.1", "::1"}
    if not parsed.scheme or not parsed.netloc:
        raise ValueError("base_url must be an absolute URL")
    if parsed.scheme == "https" or (parsed.scheme == "http" and parsed.hostname in loopback_hosts):
        return
    raise ValueError("base_url must use HTTPS unless it targets loopback")
