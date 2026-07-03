"""First-party LiveOps campaign drafting and launch review."""

from __future__ import annotations

from dataclasses import dataclass

from omnigent.gameops.knowledge_store import KnowledgeStore, load_default_knowledge_base
from omnigent.gameops.retriever import LexicalRetriever
from omnigent.gameops.schemas import (
    AuditTrail,
    CampaignDraftRequest,
    CampaignDraftResponse,
    CampaignLaunchCheck,
    ExecutionTask,
    RetrievalResult,
    RiskLevel,
)


@dataclass(frozen=True)
class GameOpsCampaignAgent:
    """Source-backed campaign draft and launch review workflow."""

    retriever: LexicalRetriever

    async def draft(self, request: CampaignDraftRequest) -> CampaignDraftResponse:
        """Draft announcement copy and review launch readiness."""
        query = (
            f"campaign launch announcement checklist rollback reward eligibility "
            f"{request.campaign_name} {request.reward_rules} {request.eligibility}"
        )
        retrieved = self.retriever.search(query, limit=4)
        missing = _missing_information(request)
        checks = _launch_checks(request)
        risk_level = _risk_for(request, missing)
        audit = AuditTrail(
            retrieved_chunk_ids=[result.chunk.chunk_id for result in retrieved],
            validation_notes=[
                "活动方案由第一方 GameOps 活动工作流生成。",
                "上线检查已对照内置活动检查清单评估。",
            ],
        )
        if missing:
            audit.validation_notes.append("仍缺少必要上线字段，暂不建议发布。")

        return CampaignDraftResponse(
            announcement_title=request.campaign_name,
            announcement_body=_announcement_body(request),
            support_faq=_support_faq(request),
            launch_checks=checks,
            risk_level=risk_level,
            sources=[result.chunk.to_source_ref() for result in retrieved],
            next_actions=_next_actions(missing, risk_level),
            execution_tasks=_execution_tasks(request, missing, risk_level),
            missing_information=missing,
            audit=audit,
        )


def create_default_campaign_agent(store: KnowledgeStore | None = None) -> GameOpsCampaignAgent:
    """Create the default campaign workflow agent."""
    knowledge_store = store or load_default_knowledge_base()
    return GameOpsCampaignAgent(retriever=LexicalRetriever(knowledge_store))


def _announcement_body(request: CampaignDraftRequest) -> str:
    window = _event_window(request)
    support_line = (
        f"\n客服备注：{request.support_notes}" if request.support_notes is not None else ""
    )
    return (
        f"{request.campaign_name} 面向 {request.audience} 开放。\n"
        f"活动时间：{window}。\n"
        f"奖励规则：{request.reward_rules}\n"
        f"参与资格：{request.eligibility}\n"
        "奖励将按已发布规则发放；如玩家无法领取，客服需先核验资格和发放日志，再做承诺。"
        f"{support_line}"
    )


def _support_faq(request: CampaignDraftRequest) -> list[str]:
    return [
        f"谁可以参与？{request.eligibility}",
        f"可以获得什么奖励？{request.reward_rules}",
        "奖励什么时候到账？以活动配置为准；承诺人工补发前必须先核验发放日志。",
        "如果配置异常怎么办？先暂停推广，执行回滚方案，并升级给运营负责人。",
    ]


def _launch_checks(request: CampaignDraftRequest) -> list[CampaignLaunchCheck]:
    return [
        CampaignLaunchCheck(
            label="活动时间",
            status="pass" if request.start_time and request.end_time else "blocker",
            detail=_event_window(request)
            if request.start_time and request.end_time
            else "上线前必须补齐开始时间和结束时间。",
        ),
        CampaignLaunchCheck(
            label="目标玩家与参与资格",
            status="pass",
            detail=f"目标玩家：{request.audience}。参与资格：{request.eligibility}",
        ),
        CampaignLaunchCheck(
            label="奖励规则",
            status="pass",
            detail=request.reward_rules,
        ),
        CampaignLaunchCheck(
            label="回滚方案",
            status="pass" if request.rollback_plan else "blocker",
            detail=request.rollback_plan or "必须补齐回滚负责人、触发条件和执行步骤。",
        ),
        CampaignLaunchCheck(
            label="客服口径",
            status="warning" if request.support_notes is None else "pass",
            detail=request.support_notes
            or "公开公告前需要先复核客服 FAQ。",
        ),
    ]


def _missing_information(request: CampaignDraftRequest) -> list[str]:
    missing: list[str] = []
    if request.start_time is None:
        missing.append("活动开始时间")
    if request.end_time is None:
        missing.append("活动结束时间")
    if request.rollback_plan is None:
        missing.append("回滚方案")
    if request.support_notes is None:
        missing.append("客服 FAQ 备注")
    return missing


def _risk_for(request: CampaignDraftRequest, missing: list[str]) -> RiskLevel:
    text = f"{request.reward_rules} {request.rollback_plan or ''}".lower()
    if "refund" in text or "rollback all" in text:
        return RiskLevel.CRITICAL
    if missing or "premium currency" in text or "gems" in text or "高级货币" in text or "宝石" in text:
        return RiskLevel.HIGH
    return RiskLevel.MEDIUM


def _next_actions(missing: list[str], risk_level: RiskLevel) -> list[str]:
    actions = [
        "对照活动配置复核公告文案和奖励规则。",
        "高价值奖励活动上线前先跑一次预发环境演练。",
    ]
    if missing:
        actions.insert(0, "发布公告前先补齐缺失的上线字段。")
    if risk_level in {RiskLevel.HIGH, RiskLevel.CRITICAL}:
        actions.append("公开上线前取得运营负责人审批。")
    return actions


def _execution_tasks(
    request: CampaignDraftRequest,
    missing: list[str],
    risk_level: RiskLevel,
) -> list[ExecutionTask]:
    tasks = [
        ExecutionTask(
            task_id="campaign-config",
            title="复核活动配置与奖励规则",
            owner_role="活动运营负责人",
            status="blocked" if _has_any_missing(missing, {"活动开始时间", "活动结束时间"}) else "pending",
            due="上线前",
            evidence_required=_missing_or_default(
                missing,
                {"活动开始时间", "活动结束时间"},
                ["活动时间", "目标玩家", "奖励规则"],
            ),
        ),
        ExecutionTask(
            task_id="rollback-readiness",
            title="确认回滚方案",
            owner_role="运营负责人",
            status="blocked" if "回滚方案" in missing else "pending",
            due="上线审批前",
            evidence_required=["回滚方案"] if "回滚方案" in missing else ["回滚方案", "触发条件", "执行负责人"],
        ),
        ExecutionTask(
            task_id="support-faq",
            title="复核客服 FAQ 与公告口径",
            owner_role="客服话术负责人",
            status="blocked" if "客服 FAQ 备注" in missing else "pending",
            due="公告发布前",
            evidence_required=["客服 FAQ 备注"] if "客服 FAQ 备注" in missing else ["客服 FAQ", "公告草稿"],
        ),
    ]
    if risk_level in {RiskLevel.HIGH, RiskLevel.CRITICAL}:
        tasks.append(
            ExecutionTask(
                task_id="approval-launch",
                title="审批上线与奖励承诺",
                owner_role="运营负责人",
                status="waiting_approval",
                due="公开上线前",
                approval_required=True,
                evidence_required=["公告草稿", "奖励配置截图", "回滚方案"],
            )
        )
    return tasks


def _has_any_missing(missing: list[str], fields: set[str]) -> bool:
    return any(item in fields for item in missing)


def _missing_or_default(missing: list[str], fields: set[str], fallback: list[str]) -> list[str]:
    selected = [item for item in missing if item in fields]
    return selected or fallback


def _event_window(request: CampaignDraftRequest) -> str:
    if request.start_time and request.end_time:
        return f"{request.start_time} 至 {request.end_time}"
    if request.start_time:
        return f"开始于 {request.start_time}，结束时间缺失"
    if request.end_time:
        return f"开始时间缺失，结束于 {request.end_time}"
    return "开始和结束时间均缺失"
