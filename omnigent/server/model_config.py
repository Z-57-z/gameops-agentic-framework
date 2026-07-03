"""Safe BYO model-provider configuration status for local deployments.

This module reads the deployment-facing environment variables used by the
Docker quickstart and reports only non-secret model routing metadata. It never
returns API keys or bearer tokens.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from urllib.parse import urlsplit

_OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1"
_ANTHROPIC_DEFAULT_BASE_URL = "https://api.anthropic.com/v1"

_PROVIDER_ALIASES: dict[str, str] = {
    "openai": "openai-compatible",
    "openai-compatible": "openai-compatible",
    "deepseek": "openai-compatible",
    "dashscope": "openai-compatible",
    "qwen": "openai-compatible",
    "moonshot": "openai-compatible",
    "siliconflow": "openai-compatible",
    "openrouter": "openai-compatible",
    "ollama": "openai-compatible",
    "lmstudio": "openai-compatible",
    "lm-studio": "openai-compatible",
    "vllm": "openai-compatible",
    "anthropic": "anthropic",
    "claude": "anthropic",
}

_SECRET_PLACEHOLDERS = {
    "",
    "change-me",
    "change-me-please",
    "your_api_key_here",
    "your-api-key-here",
    "sk-your-key-here",
}


@dataclass(frozen=True)
class ModelConfigStatus:
    """Public, non-secret status of the configured model provider."""

    provider: str
    model: str | None
    base_url: str | None
    base_url_host: str | None
    configured: bool
    credential_source: str | None
    message: str

    def to_public_dict(self) -> dict[str, str | bool | None]:
        """Return a JSON-serializable shape safe for unauthenticated probes."""

        return {
            "provider": self.provider,
            "model": self.model,
            "base_url": self.base_url,
            "base_url_host": self.base_url_host,
            "configured": self.configured,
            "credential_source": self.credential_source,
            "message": self.message,
        }


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _has_secret(value: str | None) -> bool:
    cleaned = _clean(value)
    return cleaned is not None and cleaned.lower() not in _SECRET_PLACEHOLDERS


def _base_url_host(base_url: str | None) -> str | None:
    if base_url is None:
        return None
    try:
        parsed = urlsplit(base_url)
    except ValueError:
        return None
    return parsed.netloc or parsed.path or None


def _credential_source(*names: str) -> str | None:
    for name in names:
        if _has_secret(os.environ.get(name)):
            return f"env:{name}"
    return None


def _provider() -> str:
    raw = _clean(os.environ.get("LLM_PROVIDER"))
    if raw is None:
        if _has_secret(os.environ.get("ANTHROPIC_API_KEY")) and not _has_secret(
            os.environ.get("OPENAI_API_KEY")
        ):
            return "anthropic"
        return "openai-compatible"
    return _PROVIDER_ALIASES.get(raw.lower(), raw.lower())


def get_model_config_status() -> ModelConfigStatus:
    """Resolve local BYO LLM configuration without exposing secrets.

    The local Docker app accepts generic ``LLM_*`` variables and the standard
    provider variables used by existing harnesses. OpenAI-compatible vendors
    all share the ``base_url + api_key + model`` shape.
    """

    provider = _provider()
    if provider == "anthropic":
        model = _clean(os.environ.get("LLM_MODEL")) or _clean(os.environ.get("ANTHROPIC_MODEL"))
        base_url = (
            _clean(os.environ.get("LLM_BASE_URL"))
            or _clean(os.environ.get("ANTHROPIC_BASE_URL"))
            or _ANTHROPIC_DEFAULT_BASE_URL
        )
        credential_source = _credential_source("ANTHROPIC_API_KEY", "LLM_API_KEY")
        missing = []
        if credential_source is None:
            missing.append("ANTHROPIC_API_KEY or LLM_API_KEY")
        if model is None:
            missing.append("LLM_MODEL or ANTHROPIC_MODEL")
        configured = not missing
        message = (
            "Anthropic model API is configured."
            if configured
            else "Missing " + ", ".join(missing)
        )
        return ModelConfigStatus(
            provider=provider,
            model=model,
            base_url=base_url,
            base_url_host=_base_url_host(base_url),
            configured=configured,
            credential_source=credential_source,
            message=message,
        )

    model = _clean(os.environ.get("LLM_MODEL")) or _clean(os.environ.get("OPENAI_MODEL"))
    base_url = (
        _clean(os.environ.get("LLM_BASE_URL"))
        or _clean(os.environ.get("OPENAI_BASE_URL"))
        or _OPENAI_DEFAULT_BASE_URL
    )
    credential_source = _credential_source("OPENAI_API_KEY", "LLM_API_KEY")
    missing = []
    if credential_source is None:
        missing.append("OPENAI_API_KEY or LLM_API_KEY")
    if model is None:
        missing.append("LLM_MODEL or OPENAI_MODEL")
    configured = not missing
    message = (
        "OpenAI-compatible model API is configured."
        if configured
        else "Missing " + ", ".join(missing)
    )
    return ModelConfigStatus(
        provider="openai-compatible" if provider in _PROVIDER_ALIASES.values() else provider,
        model=model,
        base_url=base_url,
        base_url_host=_base_url_host(base_url),
        configured=configured,
        credential_source=credential_source,
        message=message,
    )
