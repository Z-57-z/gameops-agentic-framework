import pytest

from omnigent.gameops.campaign_agent import create_default_campaign_agent
from omnigent.gameops.schemas import CampaignDraftRequest, RiskLevel


@pytest.mark.asyncio
async def test_campaign_agent_drafts_announcement_and_launch_checks() -> None:
    agent = create_default_campaign_agent()

    response = await agent.draft(
        CampaignDraftRequest(
            campaign_name="Weekend Recharge Sprint",
            audience="all servers",
            start_time="2026-07-10 10:00 UTC",
            end_time="2026-07-12 23:59 UTC",
            reward_rules="Recharge 10 USD to receive 120 gems and a stamina pack.",
            eligibility="Accounts level 10 and above, one claim per account.",
            rollback_plan="Disable the event flag and publish a correction notice.",
        )
    )

    assert response.announcement_title == "Weekend Recharge Sprint"
    assert "2026-07-10 10:00 UTC" in response.announcement_body
    assert "Recharge 10 USD" in response.announcement_body
    assert response.support_faq
    assert any(check.label == "活动时间" and check.status == "pass" for check in response.launch_checks)
    assert response.sources
    assert response.risk_level == RiskLevel.HIGH
    assert any("审批" in action for action in response.next_actions)
    assert any(
        task.owner_role == "运营负责人"
        and task.status == "waiting_approval"
        and task.approval_required
        for task in response.execution_tasks
    )
    approval_task = next(task for task in response.execution_tasks if task.task_id == "approval-launch")
    assert "公告草稿" in approval_task.evidence_required
    assert "奖励配置截图" in approval_task.evidence_required
    assert "回滚方案" in approval_task.evidence_required


@pytest.mark.asyncio
async def test_campaign_agent_outputs_chinese_business_artifacts() -> None:
    agent = create_default_campaign_agent()

    response = await agent.draft(
        CampaignDraftRequest(
            campaign_name="周末充值冲刺",
            audience="全部服务器",
            start_time="周五 10:00",
            end_time="周日 23:59",
            reward_rules="充值 68 元可领取 120 宝石和体力礼包。",
            eligibility="10 级及以上账号，每个账号限领一次。",
            rollback_plan="关闭活动开关并发布更正公告。",
            support_notes="客服需先核验充值记录和领取日志。",
        )
    )

    assert response.announcement_title == "周末充值冲刺"
    assert "活动时间：周五 10:00 至 周日 23:59" in response.announcement_body
    assert "奖励规则：充值 68 元可领取 120 宝石和体力礼包。" in response.announcement_body
    assert response.support_faq[0].startswith("谁可以参与？")
    assert any(check.label == "活动时间" and check.status == "pass" for check in response.launch_checks)
    assert any("运营负责人审批" in action for action in response.next_actions)


@pytest.mark.asyncio
async def test_campaign_agent_flags_missing_launch_inputs() -> None:
    agent = create_default_campaign_agent()

    response = await agent.draft(
        CampaignDraftRequest(
            campaign_name="Mystery Bonus",
            audience="new players",
            reward_rules="Login to receive a bonus.",
            eligibility="Created account after July 1.",
        )
    )

    assert response.risk_level == RiskLevel.HIGH
    assert "活动开始时间" in response.missing_information
    assert "活动结束时间" in response.missing_information
    assert "回滚方案" in response.missing_information
    assert any(check.status == "blocker" for check in response.launch_checks)
    assert any(task.status == "blocked" for task in response.execution_tasks)
    blocked_evidence = {
        item
        for task in response.execution_tasks
        if task.status == "blocked"
        for item in task.evidence_required
    }
    assert "活动开始时间" in blocked_evidence
    assert "活动结束时间" in blocked_evidence
    assert "回滚方案" in blocked_evidence
