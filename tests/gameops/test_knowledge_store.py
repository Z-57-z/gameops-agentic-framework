from omnigent.gameops.knowledge_store import load_default_knowledge_base


def test_loads_demo_gameops_documents_with_stable_source_metadata() -> None:
    store = load_default_knowledge_base()

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
    store = load_default_knowledge_base()

    text = "\n".join(chunk.text for chunk in store.chunks() if chunk.source_id == "compensation_policy")

    assert "Premium currency compensation above 500 gems requires ops lead approval" in text
