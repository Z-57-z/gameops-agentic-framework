from pathlib import Path

import pytest

from omnigent.gameops.llm_client import create_configured_gameops_llm_client
from omnigent.gameops.model_settings import GameOpsModelSettingsStore
from omnigent.gameops.schemas import ModelSettingsUpdateRequest


def _update() -> ModelSettingsUpdateRequest:
    return ModelSettingsUpdateRequest(
        provider="openai",
        model="gpt-4o-mini",
        base_url="https://api.openai.com/v1",
        api_key="sk-test-1234",
    )


def test_saved_key_is_encrypted_and_public_status_is_redacted(tmp_path: Path) -> None:
    store = GameOpsModelSettingsStore(tmp_path / "settings.db", b"x" * 32)

    store.save(_update())

    assert b"sk-test-1234" not in (tmp_path / "settings.db").read_bytes()
    assert store.public().key_suffix == "...1234"
    assert "api_key" not in store.public().model_dump()


def test_saved_key_is_retained_when_a_model_update_omits_it(tmp_path: Path) -> None:
    store = GameOpsModelSettingsStore(tmp_path / "settings.db", b"x" * 32)
    store.save(_update())

    store.save(
        ModelSettingsUpdateRequest(
            provider="deepseek",
            model="deepseek-chat",
            base_url="https://api.deepseek.com/v1",
        )
    )

    assert store.resolved() == (
        "deepseek",
        "deepseek-chat",
        "https://api.deepseek.com/v1",
        "sk-test-1234",
        2,
    )


def test_saved_configuration_is_used_when_environment_is_unset(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("LLM_MODEL", raising=False)
    monkeypatch.delenv("OPENAI_MODEL", raising=False)
    store = GameOpsModelSettingsStore(tmp_path / "settings.db", b"x" * 32)
    store.save(_update())

    client = create_configured_gameops_llm_client(store=store)

    assert client is not None
    assert client.model_id == "gpt-4o-mini"
    assert client.configuration_version == 1


def test_environment_credentials_override_saved_configuration(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    store = GameOpsModelSettingsStore(tmp_path / "settings.db", b"x" * 32)
    store.save(_update())
    monkeypatch.setenv("LLM_API_KEY", "env-key")
    monkeypatch.setenv("LLM_MODEL", "env-model")

    client = create_configured_gameops_llm_client(store=store)

    assert client is not None
    assert client.model_id == "env-model"
    assert client.configuration_version == 0
