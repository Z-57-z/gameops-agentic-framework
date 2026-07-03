from fastapi import FastAPI
from fastapi.testclient import TestClient

from omnigent.server.routes.gameops import create_gameops_router


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(create_gameops_router(), prefix="/v1")
    return TestClient(app)


def test_campaign_draft_endpoint_returns_operational_payload() -> None:
    client = _client()

    response = client.post(
        "/v1/gameops/campaign/draft",
        json={
            "campaign_name": "Weekend Recharge Sprint",
            "audience": "all servers",
            "start_time": "2026-07-10 10:00 UTC",
            "end_time": "2026-07-12 23:59 UTC",
            "reward_rules": "Recharge 10 USD to receive 120 gems.",
            "eligibility": "Accounts level 10 and above.",
            "rollback_plan": "Disable the event flag and publish a correction notice.",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["announcement_title"] == "Weekend Recharge Sprint"
    assert body["workflow"] == "campaign_ops"
    assert body["launch_checks"]
    assert body["execution_tasks"]
    assert any(
        task["owner_role"] == "运营负责人"
        and task["status"] == "waiting_approval"
        and task["approval_required"]
        for task in body["execution_tasks"]
    )
    assert body["sources"]


def test_campaign_draft_endpoint_rejects_empty_name() -> None:
    client = _client()

    response = client.post(
        "/v1/gameops/campaign/draft",
        json={
            "campaign_name": "   ",
            "audience": "all servers",
            "reward_rules": "Recharge 10 USD to receive 120 gems.",
            "eligibility": "Accounts level 10 and above.",
        },
    )

    assert response.status_code == 422
