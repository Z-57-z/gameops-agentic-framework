from fastapi import FastAPI
from fastapi.testclient import TestClient

from omnigent.server.routes.gameops import create_gameops_router


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(create_gameops_router(), prefix="/v1")
    return TestClient(app)


def test_incident_runbook_endpoint_returns_operational_payload() -> None:
    client = _client()

    response = client.post(
        "/v1/gameops/incidents/runbook",
        json={
            "incident_summary": "Login failures across all servers",
            "affected_services": "login, matchmaking",
            "impact": "Players cannot enter the game",
            "duration_minutes": 35,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["workflow"] == "incident_runbook"
    assert body["severity"] in {"sev1", "sev2"}
    assert body["communication_cadence"]
    assert body["escalation_path"]
    assert body["sources"]
    assert body["execution_tasks"]
    assert body["execution_tasks"][0]["owner_role"] == "事故指挥官"
    assert any(task["status"] == "waiting_approval" for task in body["execution_tasks"])


def test_incident_runbook_endpoint_rejects_empty_summary() -> None:
    client = _client()

    response = client.post(
        "/v1/gameops/incidents/runbook",
        json={
            "incident_summary": "   ",
            "affected_services": "login",
            "impact": "Players cannot enter.",
        },
    )

    assert response.status_code == 422
