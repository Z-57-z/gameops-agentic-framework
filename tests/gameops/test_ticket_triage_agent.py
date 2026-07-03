import pytest

from omnigent.gameops.schemas import RiskLevel, TicketTriageRequest, WorkflowKind
from omnigent.gameops.ticket_triage_agent import create_default_ticket_triage_agent


@pytest.mark.asyncio
async def test_ticket_triage_identifies_missing_reward_case() -> None:
    agent = create_default_ticket_triage_agent()

    response = await agent.triage(
        TicketTriageRequest(
            ticket_text=(
                "Player says payment succeeded during the weekend recharge event, "
                "but the rebate reward did not arrive."
            ),
            player_id="player-123",
            server_id="s1",
        )
    )

    assert response.workflow == WorkflowKind.TICKET_TRIAGE
    assert response.category == "payment_reward"
    assert response.priority in {"high", "urgent"}
    assert response.risk_level in {RiskLevel.HIGH, RiskLevel.CRITICAL}
    assert response.sources
    assert "order_id" in response.missing_information
    assert response.execution_tasks
    assert response.execution_tasks[0].owner_role == "客服受理人"
    assert any(task.status == "blocked" for task in response.execution_tasks)
    approval_tasks = [task for task in response.execution_tasks if task.approval_required]
    assert approval_tasks
    assert approval_tasks[0].status == "waiting_approval"
    assert "负责人审批记录" in approval_tasks[0].evidence_required
    assert any("订单" in action for action in response.next_actions)
    assert response.escalation_path
    assert response.suggested_reply
    assert "核验" in response.suggested_reply or "提供" in response.suggested_reply


@pytest.mark.asyncio
async def test_ticket_triage_escalates_account_ban_cases_to_human_review() -> None:
    agent = create_default_ticket_triage_agent()

    response = await agent.triage(
        TicketTriageRequest(
            ticket_text="Player claims the account was banned after a suspicious login.",
            player_id="player-999",
            server_id="s2",
        )
    )

    assert response.category == "account_access"
    assert response.priority == "urgent"
    assert response.risk_level == RiskLevel.CRITICAL
    assert any(task.owner_role == "账号安全专员" for task in response.execution_tasks)
    assert any("人工" in action or "复核" in action for action in response.next_actions)


@pytest.mark.asyncio
async def test_ticket_triage_recognizes_chinese_recharge_reward_ticket_body() -> None:
    agent = create_default_ticket_triage_agent()

    response = await agent.triage(
        TicketTriageRequest(
            ticket_text=(
                "玩家反馈：我在周末充值返利活动期间完成了 30 美元充值，支付页面显示成功，"
                "银行卡也已经扣款，但游戏内没有收到返利钻石和活动奖励。"
                "玩家 ID 是 player-7788，服务器是 s12。玩家情绪比较激动，"
                "说如果今天不给补发就要退款并投诉客服。"
            )
        )
    )

    assert response.category == "payment_reward"
    assert response.priority == "high"
    assert response.risk_level == RiskLevel.HIGH
    assert "player_id" not in response.missing_information
    assert "server_id" not in response.missing_information
    assert "order_id" in response.missing_information
    assert "event_id" in response.missing_information
    assert any(task.status == "blocked" for task in response.execution_tasks)
    assert any(task.approval_required for task in response.execution_tasks)
    assert "支付/客服负责人" in response.escalation_path


def test_ticket_triage_request_rejects_blank_ticket() -> None:
    with pytest.raises(ValueError):
        TicketTriageRequest(ticket_text="   ")
