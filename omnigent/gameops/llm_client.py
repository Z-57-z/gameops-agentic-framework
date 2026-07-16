"""LLM boundary for the GameOps business runtime."""

from __future__ import annotations

import os
from typing import TYPE_CHECKING, Protocol

from openai import AsyncOpenAI

if TYPE_CHECKING:
    from omnigent.gameops.model_settings import GameOpsModelSettingsStore


class LLMClient(Protocol):
    """Minimal model interface used by the first-party GameOps loop."""

    model_id: str
    configuration_version: int

    async def complete(self, prompt: str) -> str:
        """Return model text for a prepared prompt."""
        ...


class DeterministicGameOpsLLMClient:
    """Offline-safe deterministic client used by tests and local evaluation."""

    model_id = "deterministic-gameops"
    configuration_version = 0

    async def complete(self, prompt: str) -> str:
        """Return a stable answer from the prepared evidence prompt."""
        return prompt


class OpenAICompatibleGameOpsLLMClient:
    """Thin OpenAI-compatible adapter for first-party GameOps workflows."""

    def __init__(
        self,
        *,
        api_key: str,
        model_id: str,
        base_url: str | None = None,
        configuration_version: int = 0,
    ) -> None:
        self.model_id = model_id
        self.configuration_version = configuration_version
        self._client = AsyncOpenAI(api_key=api_key, base_url=base_url)

    async def complete(self, prompt: str) -> str:
        response = await self._client.chat.completions.create(
            model=self.model_id,
            temperature=0,
            messages=[{"role": "user", "content": prompt}],
        )
        content = response.choices[0].message.content if response.choices else None
        if not content:
            raise RuntimeError("GameOps model returned no content")
        return content


def create_configured_gameops_llm_client(
    *, store: "GameOpsModelSettingsStore | None" = None
) -> LLMClient | None:
    """Return a configured model client, or None when auto approval is unavailable."""
    api_key = os.getenv("LLM_API_KEY") or os.getenv("OPENAI_API_KEY")
    model_id = os.getenv("LLM_MODEL") or os.getenv("OPENAI_MODEL")
    base_url = os.getenv("LLM_BASE_URL") or os.getenv("OPENAI_BASE_URL")
    configuration_version = 0
    if not api_key or not model_id:
        resolved = store.resolved() if store else None
        if resolved is None:
            return None
        _provider, model_id, base_url, api_key, configuration_version = resolved
    return OpenAICompatibleGameOpsLLMClient(
        api_key=api_key,
        model_id=model_id,
        base_url=base_url,
        configuration_version=configuration_version,
    )


async def test_gameops_model_connection(
    *, api_key: str, model_id: str, base_url: str | None
) -> None:
    """Make a minimal provider request without persisting or logging a credential."""
    client = OpenAICompatibleGameOpsLLMClient(
        api_key=api_key, model_id=model_id, base_url=base_url
    )
    await client.complete("Reply with CONNECTED only.")
