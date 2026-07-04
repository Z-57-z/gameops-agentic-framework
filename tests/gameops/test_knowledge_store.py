from pathlib import Path

from pytest import MonkeyPatch

from omnigent.gameops.knowledge_store import (
    load_default_knowledge_base,
    load_starter_knowledge_base,
)


def test_default_knowledge_store_is_empty_without_enterprise_dir(
    monkeypatch: MonkeyPatch,
) -> None:
    monkeypatch.delenv("GAMEOPS_KNOWLEDGE_DIR", raising=False)

    store = load_default_knowledge_base()

    assert store.chunks() == []


def test_default_knowledge_store_loads_configured_enterprise_dir(
    tmp_path: Path,
    monkeypatch: MonkeyPatch,
) -> None:
    knowledge_file = tmp_path / "policy.md"
    knowledge_file.write_text(
        "# Policy\n\n## Review\nConfigured policy content.", encoding="utf-8"
    )
    monkeypatch.setenv("GAMEOPS_KNOWLEDGE_DIR", str(tmp_path))

    store = load_default_knowledge_base()

    chunks = store.chunks()

    assert len(chunks) == 1
    assert chunks[0].source_id == "policy"
    assert chunks[0].path == str(knowledge_file)


def test_loads_starter_gameops_documents_with_stable_source_metadata() -> None:
    store = load_starter_knowledge_base()

    chunks = store.chunks()

    assert len(chunks) >= 5
    assert {chunk.source_id for chunk in chunks} >= {
        "event_rebate_policy",
        "compensation_policy",
        "support_faq",
        "incident_runbook",
        "campaign_checklist",
    }
    assert all(chunk.title for chunk in chunks)
    assert all(chunk.path.startswith("omnigent/gameops/data/") for chunk in chunks)


def test_compensation_policy_mentions_approval_limits() -> None:
    store = load_starter_knowledge_base()

    text = "\n".join(
        chunk.text for chunk in store.chunks() if chunk.source_id == "compensation_policy"
    )

    assert "Premium currency compensation above 500 gems requires ops lead approval" in text
