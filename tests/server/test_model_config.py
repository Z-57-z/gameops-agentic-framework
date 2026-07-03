"""Tests for public BYO model-provider status reporting."""

from __future__ import annotations

import pytest

from omnigent.server.model_config import get_model_config_status

_MODEL_ENV_VARS = (
    "LLM_PROVIDER",
    "LLM_MODEL",
    "LLM_BASE_URL",
    "LLM_API_KEY",
    "OPENAI_MODEL",
    "OPENAI_BASE_URL",
    "OPENAI_API_KEY",
    "ANTHROPIC_MODEL",
    "ANTHROPIC_BASE_URL",
    "ANTHROPIC_API_KEY",
)


@pytest.fixture(autouse=True)
def _clear_model_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Keep status tests independent from the operator's shell env."""

    for name in _MODEL_ENV_VARS:
        monkeypatch.delenv(name, raising=False)


def test_openai_compatible_status_uses_generic_llm_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Generic LLM_* env reports a configured OpenAI-compatible provider safely."""

    monkeypatch.setenv("LLM_PROVIDER", "deepseek")
    monkeypatch.setenv("LLM_MODEL", "deepseek-chat")
    monkeypatch.setenv("LLM_BASE_URL", "https://api.deepseek.com/v1")
    monkeypatch.setenv("LLM_API_KEY", "sk-real-test")

    status = get_model_config_status()

    assert status.configured is True
    assert status.provider == "openai-compatible"
    assert status.model == "deepseek-chat"
    assert status.base_url == "https://api.deepseek.com/v1"
    assert status.base_url_host == "api.deepseek.com"
    assert status.credential_source == "env:LLM_API_KEY"
    public = status.to_public_dict()
    assert "sk-real-test" not in str(public)
    assert "api_key" not in public


def test_placeholder_key_is_not_reported_as_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    """The .env.example placeholder must not look like a working credential."""

    monkeypatch.setenv("LLM_MODEL", "gpt-4o-mini")
    monkeypatch.setenv("LLM_API_KEY", "your_api_key_here")

    status = get_model_config_status()

    assert status.configured is False
    assert status.credential_source is None
    assert "OPENAI_API_KEY or LLM_API_KEY" in status.message


def test_anthropic_status_uses_standard_provider_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Anthropic mode reports standard ANTHROPIC_* env without exposing secrets."""

    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    monkeypatch.setenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")
    monkeypatch.setenv("ANTHROPIC_BASE_URL", "https://api.anthropic.com/v1")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-real-test")

    status = get_model_config_status()

    assert status.configured is True
    assert status.provider == "anthropic"
    assert status.model == "claude-sonnet-4-6"
    assert status.base_url_host == "api.anthropic.com"
    assert status.credential_source == "env:ANTHROPIC_API_KEY"
    assert "sk-ant-real-test" not in str(status.to_public_dict())
