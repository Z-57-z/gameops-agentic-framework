"""LLM boundary for the GameOps business runtime."""

from __future__ import annotations

import os
from typing import Protocol

from openai import AsyncOpenAI


class LLMClient(Protocol):
    """Minimal model interface used by the first-party GameOps loop."""

    model_id: str

    async def complete(self, prompt: str) -> str:
        """Return model text for a prepared prompt."""
        ...


class DeterministicGameOpsLLMClient:
    """Offline-safe deterministic client used by tests and local evaluation."""

    model_id = "deterministic-gameops"

    async def complete(self, prompt: str) -> str:
        """Return a stable answer from the prepared evidence prompt."""
        return prompt


class OpenAICompatibleGameOpsLLMClient:
    """Thin OpenAI-compatible adapter for first-party GameOps workflows."""

    def __init__(self, *, api_key: str, model_id: str, base_url: str | None = None) -> None:
        self.model_id = model_id
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


def create_configured_gameops_llm_client() -> LLMClient | None:
    """Return a configured model client, or None when auto approval is unavailable."""
    api_key = os.getenv("LLM_API_KEY") or os.getenv("OPENAI_API_KEY")
    model_id = os.getenv("LLM_MODEL") or os.getenv("OPENAI_MODEL")
    if not api_key or not model_id:
        return None
    return OpenAICompatibleGameOpsLLMClient(
        api_key=api_key,
        model_id=model_id,
        base_url=os.getenv("LLM_BASE_URL") or os.getenv("OPENAI_BASE_URL"),
    )
