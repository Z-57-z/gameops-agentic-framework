"""First-party Player Support ticket triage workflow."""

from __future__ import annotations

from dataclasses import dataclass
import re

from omnigent.gameops.knowledge_store import KnowledgeStore, load_default_knowledge_base
from omnigent.gameops.retriever import LexicalRetriever
from omnigent.gameops.schemas import (
    AuditTrail,
    ExecutionTask,
    RiskLevel,
    TicketPriority,
    TicketTriageRequest,
    TicketTriageResponse,
)


@dataclass(frozen=True)
class GameOpsTicketTriageAgent:
    """Classify support tickets and produce source-backed handling guidance."""

    retriever: LexicalRetriever

    async def triage(self, request: TicketTriageRequest) -> TicketTriageResponse:
        category = _category_for(request.ticket_text)
        priority = _priority_for(category)
        risk_level = _risk_for(category)
        missing = _missing_information(request, category)
        query = _retrieval_query(request, category)
        retrieved = self.retriever.search(query, limit=4)
        audit = AuditTrail(
            retrieved_chunk_ids=[result.chunk.chunk_id for result in retrieved],
            validation_notes=[
                "工单由第一方 GameOps 客服分诊工作流完成分类。",
                "已在给出回复建议前检查缺失字段和升级路径。",
            ],
        )
        if missing:
            audit.validation_notes.append("缺失字段补齐前，不建议给玩家最终处理承诺。")

        return TicketTriageResponse(
            category=category,
            priority=priority,
            escalation_path=_escalation_path(category, missing),
            suggested_reply=_suggested_reply(category, missing),
            risk_level=risk_level,
            sources=[result.chunk.to_source_ref() for result in retrieved],
            next_actions=_next_actions(category, missing, risk_level),
            execution_tasks=_execution_tasks(category, missing, risk_level),
            missing_information=missing,
            audit=audit,
        )


def create_default_ticket_triage_agent(
    store: KnowledgeStore | None = None,
) -> GameOpsTicketTriageAgent:
    """Create the default support triage workflow agent."""
    knowledge_store = store or load_default_knowledge_base()
    return GameOpsTicketTriageAgent(retriever=LexicalRetriever(knowledge_store))


def _category_for(ticket_text: str) -> str:
    text = ticket_text.lower()
    if any(
        term in text
        for term in (
            "ban",
            "banned",
            "login",
            "account",
            "suspicious",
            "封禁",
            "封号",
            "登录",
            "账号",
            "异常",
        )
    ):
        return "account_access"
    if any(
        term in text
        for term in (
            "payment",
            "paid",
            "recharge",
            "rebate",
            "reward",
            "order",
            "refund",
            "支付",
            "充值",
            "返利",
            "奖励",
            "订单",
            "扣款",
            "钻石",
            "补发",
            "退款",
        )
    ):
        return "payment_reward"
    if any(term in text for term in ("event", "campaign", "quest", "mission", "活动", "任务")):
        return "event_participation"
    return "general_support"


def _priority_for(category: str) -> TicketPriority:
    if category == "account_access":
        return "urgent"
    if category == "payment_reward":
        return "high"
    if category == "event_participation":
        return "medium"
    return "low"


def _risk_for(category: str) -> RiskLevel:
    if category == "account_access":
        return RiskLevel.CRITICAL
    if category == "payment_reward":
        return RiskLevel.HIGH
    if category == "event_participation":
        return RiskLevel.MEDIUM
    return RiskLevel.LOW


def _missing_information(request: TicketTriageRequest, category: str) -> list[str]:
    missing: list[str] = []
    if request.player_id is None and not _text_has_player_id(request.ticket_text):
        missing.append("player_id")
    if request.server_id is None and not _text_has_server_id(request.ticket_text):
        missing.append("server_id")
    if (
        category == "account_access"
        and request.account_id is None
        and not _text_has_account_id(request.ticket_text)
    ):
        missing.append("account_id")
    if category == "payment_reward":
        if request.order_id is None and not _text_has_order_id(request.ticket_text):
            missing.append("order_id")
        if request.event_id is None and not _text_has_event_id(request.ticket_text):
            missing.append("event_id")
        if request.timestamp is None and not _text_has_timestamp(request.ticket_text):
            missing.append("timestamp")
    if (
        category == "event_participation"
        and request.event_id is None
        and not _text_has_event_id(request.ticket_text)
    ):
        missing.append("event_id")
    return missing


def _retrieval_query(request: TicketTriageRequest, category: str) -> str:
    if category == "payment_reward":
        return f"payment recharge rebate reward support missing {request.ticket_text}"
    if category == "account_access":
        return f"account login support escalation human review {request.ticket_text}"
    if category == "event_participation":
        return f"event campaign eligibility reward support {request.ticket_text}"
    return f"support faq player ticket {request.ticket_text}"


def _escalation_path(category: str, missing: list[str]) -> str:
    if category == "account_access":
        return "升级给账号安全专员人工复核，复核完成前不要修改账号状态。"
    if category == "payment_reward":
        return "如果订单核验显示已支付但奖励日志缺失，升级给支付/客服负责人处理。"
    if missing:
        return "先补齐工单必要信息，再给出最终客服处理结论。"
    return "客服可以基于已引用的政策依据回复玩家。"


def _suggested_reply(category: str, missing: list[str]) -> str:
    if missing:
        fields = ", ".join(missing)
        return (
            "我们正在核验该问题，但在作出最终承诺前还需要补充以下信息："
            f"{fields}。我们会先核验资格和日志记录。"
        )
    if category == "account_access":
        return "该账号访问问题会先升级给专员复核，复核完成前不会直接调整账号状态。"
    if category == "payment_reward":
        return "我们会先核验订单、活动资格和奖励发放日志，再确认是否进入补发或补偿流程。"
    return "我们会根据相关政策完成核验，并在确认后同步处理结果。"


def _next_actions(category: str, missing: list[str], risk_level: RiskLevel) -> list[str]:
    actions = []
    if missing:
        actions.append(f"补齐工单缺失字段：{', '.join(missing)}。")
    if category == "payment_reward":
        actions.append("核验订单状态、玩家资格、服务器、活动 ID 和奖励发放日志。")
        actions.append("政策依据和日志都支持前，不要承诺人工补发奖励。")
    elif category == "account_access":
        actions.append("账号状态调整前，先提交账号安全人工复核。")
        actions.append("回复玩家时不要透露内部检测规则或封禁细节。")
    else:
        actions.append("检索 GameOps 知识库，并基于引用的政策依据回复玩家。")
    if risk_level in {RiskLevel.HIGH, RiskLevel.CRITICAL}:
        actions.append("补偿、账号操作或面向玩家的例外处理前，需要负责人审批。")
    return actions


def _execution_tasks(
    category: str, missing: list[str], risk_level: RiskLevel
) -> list[ExecutionTask]:
    tasks = [
        ExecutionTask(
            task_id="ticket-intake",
            title="补齐工单必要信息",
            owner_role="客服受理人",
            status="blocked" if missing else "pending",
            due="首次处理结论前",
            evidence_required=[_field_label(item) for item in missing]
            or ["玩家 ID", "服务器 ID", "问题描述"],
        )
    ]
    if category == "payment_reward":
        tasks.append(
            ExecutionTask(
                task_id="payment-log-check",
                title="核验订单与奖励发放日志",
                owner_role="支付/客服负责人",
                status="blocked" if missing else "pending",
                due="30 分钟内",
                evidence_required=["订单状态", "活动资格", "奖励发放日志"],
            )
        )
    elif category == "account_access":
        tasks.append(
            ExecutionTask(
                task_id="account-security-review",
                title="提交账号安全人工复核",
                owner_role="账号安全专员",
                status="pending",
                due="回复账号状态前",
                evidence_required=["账号 ID", "登录记录", "安全复核结论"],
            )
        )
    elif category == "event_participation":
        tasks.append(
            ExecutionTask(
                task_id="event-eligibility-check",
                title="核验活动参与资格",
                owner_role="活动运营负责人",
                status="blocked" if missing else "pending",
                due="回复奖励结论前",
                evidence_required=["活动 ID", "资格规则", "玩家参与记录"],
            )
        )
    else:
        tasks.append(
            ExecutionTask(
                task_id="policy-reply",
                title="基于政策依据回复玩家",
                owner_role="客服受理人",
                status="pending",
                due="当班处理时段内",
                evidence_required=["引用政策", "回复草稿"],
            )
        )
    if risk_level in {RiskLevel.HIGH, RiskLevel.CRITICAL}:
        tasks.append(
            ExecutionTask(
                task_id="exception-approval",
                title="审批例外处理与玩家承诺",
                owner_role="运营负责人",
                status="waiting_approval",
                due="补偿或账号操作前",
                approval_required=True,
                evidence_required=["负责人审批记录", "政策依据", "日志截图"],
            )
        )
    return tasks


def _field_label(value: str) -> str:
    return {
        "player_id": "玩家 ID",
        "server_id": "服务器 ID",
        "account_id": "账号 ID",
        "order_id": "订单 ID",
        "event_id": "活动 ID",
        "timestamp": "发生时间",
    }.get(value, value)


def _text_has_player_id(text: str) -> bool:
    return _matches_any(
        text, (r"玩家\s*id\s*(?:是|为|[:：])?\s*[\w-]+", r"player-\d+", r"player[_-]?\w+")
    )


def _text_has_server_id(text: str) -> bool:
    return _matches_any(text, (r"服务器\s*(?:id)?\s*(?:是|为|[:：])?\s*[a-z]?\d+", r"\bs\d+\b"))


def _text_has_account_id(text: str) -> bool:
    return _matches_any(text, (r"账号\s*id\s*(?:是|为|[:：])?\s*[\w-]+", r"account-\d+"))


def _text_has_order_id(text: str) -> bool:
    return _matches_any(text, (r"订单\s*id\s*(?:是|为|[:：])?\s*[\w-]+", r"order-\d+"))


def _text_has_event_id(text: str) -> bool:
    return _matches_any(text, (r"活动\s*id\s*(?:是|为|[:：])?\s*[\w-]+", r"event-\d+"))


def _text_has_timestamp(text: str) -> bool:
    return _matches_any(
        text, (r"\d{4}[-/年]\d{1,2}[-/月]\d{1,2}", r"\d{1,2}[:：]\d{2}", r"发生时间")
    )


def _matches_any(text: str, patterns: tuple[str, ...]) -> bool:
    return any(re.search(pattern, text, re.IGNORECASE) for pattern in patterns)
