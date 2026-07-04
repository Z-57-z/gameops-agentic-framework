from omnigent.gameops.knowledge_store import load_starter_knowledge_base
from omnigent.gameops.retriever import LexicalRetriever


def test_retriever_finds_rebate_policy_for_missed_recharge_reward() -> None:
    retriever = LexicalRetriever(load_starter_knowledge_base())

    results = retriever.search(
        "A player missed the recharge rebate reward. What can support promise?", limit=3
    )

    assert results[0].chunk.source_id == "event_rebate_policy"
    assert results[0].score > 0


def test_retriever_returns_no_results_for_uncovered_topic() -> None:
    retriever = LexicalRetriever(load_starter_knowledge_base())

    results = retriever.search("How do we configure a guild housing auction tax?", limit=3)

    assert results == []
