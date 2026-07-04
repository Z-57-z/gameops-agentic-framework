import pytest

from omnigent.gameops.incident_agent import create_default_incident_agent
from omnigent.gameops.knowledge_store import load_starter_knowledge_base
from omnigent.gameops.schemas import IncidentRunbookRequest, RiskLevel, WorkflowKind


def _starter_agent():
    return create_default_incident_agent(load_starter_knowledge_base())


@pytest.mark.asyncio
async def test_incident_runbook_classifies_login_outage_and_sets_cadence() -> None:
    agent = _starter_agent()

    response = await agent.plan(
        IncidentRunbookRequest(
            incident_summary="Login failures across all servers",
            affected_services="login, matchmaking",
            impact="Players cannot enter the game",
            duration_minutes=35,
        )
    )

    assert response.workflow == WorkflowKind.INCIDENT_RUNBOOK
    assert response.severity in {"sev1", "sev2"}
    assert response.risk_level in {RiskLevel.HIGH, RiskLevel.CRITICAL}
    assert response.communication_cadence
    assert response.escalation_path
    assert response.sources
    assert "分钟" in response.communication_cadence
    assert any("状态" in action or "同步" in action for action in response.next_actions)
    assert all(
        source.title in {"事故手册", "补偿政策", "活动检查清单", "客服 FAQ", "充值返利政策"}
        for source in response.sources
    )
    assert response.execution_tasks
    assert response.execution_tasks[0].owner_role == "事故指挥官"
    assert any(task.due == "立即" for task in response.execution_tasks)


@pytest.mark.asyncio
async def test_incident_runbook_blocks_blanket_compensation_without_approval() -> None:
    agent = create_default_incident_agent()

    response = await agent.plan(
        IncidentRunbookRequest(
            incident_summary="Payment reward delivery delayed",
            affected_services="payments, rewards",
            impact="Recharge rewards are delayed for some players",
            duration_minutes=20,
            proposed_compensation="Send premium currency to all players.",
        )
    )

    assert response.compensation_guidance
    assert response.risk_level in {RiskLevel.HIGH, RiskLevel.CRITICAL}
    assert "审批" in response.compensation_guidance
    assert any("审批" in action for action in response.next_actions)
    approval_tasks = [task for task in response.execution_tasks if task.approval_required]
    assert approval_tasks
    assert approval_tasks[0].status == "waiting_approval"
    assert "补偿方案" in approval_tasks[0].evidence_required


def test_incident_runbook_request_rejects_blank_summary() -> None:
    with pytest.raises(ValueError):
        IncidentRunbookRequest(
            incident_summary="   ",
            affected_services="login",
            impact="Players cannot enter.",
        )
