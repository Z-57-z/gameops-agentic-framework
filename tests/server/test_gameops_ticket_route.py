from fastapi import FastAPI
from fastapi.testclient import TestClient

from omnigent.server.routes.gameops import create_gameops_router


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(create_gameops_router(), prefix="/v1")
    return TestClient(app)


def test_ticket_triage_endpoint_returns_operational_payload() -> None:
    client = _client()

    response = client.post(
        "/v1/gameops/tickets/triage",
        json={
            "ticket_text": "Payment succeeded but the recharge rebate reward is missing.",
            "player_id": "player-123",
            "server_id": "s1",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["workflow"] == "ticket_triage"
    assert body["category"] == "payment_reward"
    assert body["priority"] in {"high", "urgent"}
    assert body["risk_level"] in {"high", "critical"}
    assert body["sources"]
    assert body["execution_tasks"]
    assert body["execution_tasks"][0]["owner_role"] == "客服受理人"
    assert any(task["status"] == "blocked" for task in body["execution_tasks"])
    assert any(task["approval_required"] for task in body["execution_tasks"])
    assert "order_id" in body["missing_information"]


def test_ticket_triage_endpoint_rejects_empty_ticket() -> None:
    client = _client()

    response = client.post("/v1/gameops/tickets/triage", json={"ticket_text": "   "})

    assert response.status_code == 422


def test_ticket_triage_endpoint_recognizes_chinese_payment_ticket_body() -> None:
    client = _client()

    response = client.post(
        "/v1/gameops/tickets/triage",
        json={
            "ticket_text": (
                "玩家反馈：我在周末充值返利活动期间完成了 30 美元充值，支付页面显示成功，"
                "银行卡也已经扣款，但游戏内没有收到返利钻石和活动奖励。"
                "玩家 ID 是 player-7788，服务器是 s12。玩家情绪比较激动，"
                "说如果今天不给补发就要退款并投诉客服。"
            )
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["category"] == "payment_reward"
    assert body["priority"] == "high"
    assert body["risk_level"] == "high"
    assert "player_id" not in body["missing_information"]
    assert "server_id" not in body["missing_information"]
    assert "order_id" in body["missing_information"]
    assert any(task["approval_required"] for task in body["execution_tasks"])
