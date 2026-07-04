from fastapi import FastAPI
from fastapi.testclient import TestClient

from omnigent.gameops.agent_loop import create_default_gameops_agent
from omnigent.gameops.knowledge_store import load_starter_knowledge_base
from omnigent.server.routes.gameops import create_gameops_router


def _client(*, use_starter_knowledge: bool = False) -> TestClient:
    app = FastAPI()
    agent = (
        create_default_gameops_agent(load_starter_knowledge_base())
        if use_starter_knowledge
        else None
    )
    app.include_router(create_gameops_router(agent=agent), prefix="/v1")
    return TestClient(app)


def test_gameops_ask_endpoint_degrades_when_enterprise_knowledge_is_not_configured() -> None:
    client = _client()

    response = client.post(
        "/v1/gameops/ask",
        json={"question": "What should ops check before launching a weekend event?"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["workflow"] in {"knowledge_qa", "campaign_ops"}
    assert body["answer"]
    assert body["sources"] == []
    assert body["missing_information"]
    assert body["risk_level"] in {"low", "medium", "high", "critical"}


def test_gameops_ask_endpoint_can_use_configured_knowledge_source() -> None:
    client = _client(use_starter_knowledge=True)

    response = client.post(
        "/v1/gameops/ask",
        json={"question": "What should ops check before launching a weekend event?"},
    )

    assert response.status_code == 200
    assert response.json()["sources"]


def test_gameops_ask_endpoint_rejects_empty_question() -> None:
    client = _client()

    response = client.post("/v1/gameops/ask", json={"question": "   "})

    assert response.status_code == 422
