from fastapi import FastAPI
from fastapi.testclient import TestClient

from omnigent.server.routes.gameops import create_gameops_router


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(create_gameops_router(), prefix="/v1")
    return TestClient(app)


def test_gameops_ask_endpoint_returns_structured_answer() -> None:
    client = _client()

    response = client.post(
        "/v1/gameops/ask",
        json={"question": "What should ops check before launching a weekend event?"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["workflow"] in {"knowledge_qa", "campaign_ops"}
    assert body["answer"]
    assert body["sources"]
    assert body["risk_level"] in {"low", "medium", "high", "critical"}


def test_gameops_ask_endpoint_rejects_empty_question() -> None:
    client = _client()

    response = client.post("/v1/gameops/ask", json={"question": "   "})

    assert response.status_code == 422
