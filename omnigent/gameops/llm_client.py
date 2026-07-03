"""LLM boundary for the GameOps business runtime."""

from __future__ import annotations

from typing import Protocol


class LLMClient(Protocol):
    """Minimal model interface used by the first-party GameOps loop."""

    async def complete(self, prompt: str) -> str:
        """Return model text for a prepared prompt."""
        ...


class DeterministicGameOpsLLMClient:
    """Offline-safe fallback used by tests and local demos."""

    async def complete(self, prompt: str) -> str:
        """Return a stable answer from the prepared evidence prompt."""
        return prompt
