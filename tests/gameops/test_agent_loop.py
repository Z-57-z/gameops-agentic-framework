import pytest

from omnigent.gameops.agent_loop import create_default_gameops_agent
from omnigent.gameops.schemas import GameOpsAskRequest, GameOpsMode, RiskLevel, WorkflowKind


def test_request_defaults_to_knowledge_mode() -> None:
    request = GameOpsAskRequest(question="Can support promise a rebate replacement?")

    assert request.mode == GameOpsMode.KNOWLEDGE
    assert request.question == "Can support promise a rebate replacement?"


def test_risk_levels_are_ordered_for_ui_display() -> None:
    assert [level.value for level in RiskLevel] == ["low", "medium", "high", "critical"]


@pytest.mark.asyncio
async def test_agent_answers_with_sources_and_actions() -> None:
    agent = create_default_gameops_agent()

    response = await agent.ask(
        GameOpsAskRequest(
            question="A player missed the recharge rebate reward. What can support promise?"
        )
    )

    assert response.workflow == WorkflowKind.KNOWLEDGE_QA
    assert response.sources
    assert response.sources[0].source_id == "event_rebate_policy"
    assert response.answer
    assert response.next_actions
    assert response.confidence > 0


@pytest.mark.asyncio
async def test_agent_answers_chinese_rebate_question_in_chinese_with_sources() -> None:
    agent = create_default_gameops_agent()

    response = await agent.ask(GameOpsAskRequest(question="玩家错过了充值返利奖励，客服可以承诺什么？"))

    assert response.workflow == WorkflowKind.KNOWLEDGE_QA
    assert response.sources
    assert response.sources[0].source_id == "event_rebate_policy"
    assert "客服" in response.answer
    assert "资格" in response.answer
    assert any("玩家 ID" in action or "玩家id" in action.lower() for action in response.next_actions)


@pytest.mark.asyncio
async def test_agent_flags_high_risk_compensation_request() -> None:
    agent = create_default_gameops_agent()

    response = await agent.ask(
        GameOpsAskRequest(
            question="Can we compensate all players with premium currency after a 30 minute login issue?"
        )
    )

    assert response.risk_level in {RiskLevel.HIGH, RiskLevel.CRITICAL}
    assert any("审批" in action for action in response.next_actions)
    assert response.sources


@pytest.mark.asyncio
async def test_agent_flags_chinese_compensation_request_with_chinese_approval_action() -> None:
    agent = create_default_gameops_agent()

    response = await agent.ask(
        GameOpsAskRequest(question="登录故障持续 30 分钟后，能不能给全服发高级货币补偿？")
    )

    assert response.risk_level in {RiskLevel.HIGH, RiskLevel.CRITICAL}
    assert response.sources
    assert "不要直接承诺" in response.answer
    assert any("审批" in action for action in response.next_actions)


@pytest.mark.asyncio
async def test_agent_marks_missing_information_when_sources_are_empty() -> None:
    agent = create_default_gameops_agent()

    response = await agent.ask(
        GameOpsAskRequest(question="How should guild housing auction tax be tuned?")
    )

    assert response.sources == []
    assert response.missing_information
    assert response.confidence == 0
