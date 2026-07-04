"""First-party incident runbook workflow for GameOps operators."""

from __future__ import annotations

from dataclasses import dataclass

from omnigent.gameops.knowledge_store import KnowledgeStore, load_default_knowledge_base
from omnigent.gameops.retriever import LexicalRetriever
from omnigent.gameops.schemas import (
    AuditTrail,
    ExecutionTask,
    IncidentRunbookRequest,
    IncidentRunbookResponse,
    IncidentSeverity,
    RiskLevel,
)


@dataclass(frozen=True)
class GameOpsIncidentAgent:
    """Plan incident response steps with local policy and retrieved sources."""

    retriever: LexicalRetriever

    async def plan(self, request: IncidentRunbookRequest) -> IncidentRunbookResponse:
        """Create severity, communication, escalation, and compensation guidance."""
        severity = _severity_for(request)
        risk_level = _risk_for(request, severity)
        missing = _missing_information(request)
        retrieved = self.retriever.search(_retrieval_query(request), limit=4)
        audit = AuditTrail(
            retrieved_chunk_ids=[result.chunk.chunk_id for result in retrieved],
            validation_notes=[
                "事故由第一方 GameOps 事故工作流完成定级。",
                "已根据已配置事故手册校验通信节奏、升级路径和补偿建议。",
            ],
        )
        if _requires_approval(request):
            audit.validation_notes.append("补偿设想在对玩家沟通前需要先完成审批。")
        if missing:
            audit.validation_notes.append("事故记录仍缺少复盘所需字段。")

        return IncidentRunbookResponse(
            severity=severity,
            communication_cadence=_communication_cadence(severity),
            escalation_path=_escalation_path(request, severity),
            compensation_guidance=_compensation_guidance(request),
            risk_level=risk_level,
            sources=[result.chunk.to_source_ref() for result in retrieved],
            next_actions=_next_actions(request, severity, risk_level, missing),
            execution_tasks=_execution_tasks(request, severity, risk_level, missing),
            missing_information=missing,
            audit=audit,
        )


def create_default_incident_agent(store: KnowledgeStore | None = None) -> GameOpsIncidentAgent:
    """Create the default incident runbook workflow agent."""
    knowledge_store = store or load_default_knowledge_base()
    return GameOpsIncidentAgent(retriever=LexicalRetriever(knowledge_store))


def _severity_for(request: IncidentRunbookRequest) -> IncidentSeverity:
    text = _combined_text(request)
    duration = request.duration_minutes or 0
    has_core_outage = any(
        term in text
        for term in (
            "all servers",
            "cannot enter",
            "unavailable",
            "outage",
            "login failure",
            "login failures",
            "payment down",
            "core gameplay",
        )
    )
    has_payment_or_login = any(term in text for term in ("login", "payment", "recharge", "order"))
    if has_core_outage and (duration >= 30 or has_payment_or_login):
        return "sev1"
    if (
        has_payment_or_login
        or duration >= 15
        or any(term in text for term in ("degraded", "delayed", "major"))
    ):
        return "sev2"
    return "sev3"


def _risk_for(request: IncidentRunbookRequest, severity: IncidentSeverity) -> RiskLevel:
    text = _combined_text(request)
    if severity == "sev1" or any(
        term in text for term in ("payment loss", "refund", "all players")
    ):
        return RiskLevel.CRITICAL
    if severity == "sev2" or _requires_approval(request):
        return RiskLevel.HIGH
    return RiskLevel.MEDIUM


def _missing_information(request: IncidentRunbookRequest) -> list[str]:
    missing: list[str] = []
    if request.duration_minutes is None:
        missing.append("持续分钟数")
    if request.detected_at is None:
        missing.append("发现时间")
    if request.proposed_compensation is None:
        missing.append("补偿设想")
    return missing


def _retrieval_query(request: IncidentRunbookRequest) -> str:
    return (
        "incident runbook severity communication cadence escalation compensation "
        f"{request.incident_summary} {request.affected_services} {request.impact} "
        f"{request.proposed_compensation or ''}"
    )


def _communication_cadence(severity: IncidentSeverity) -> str:
    if severity == "sev1":
        return "确认事故后 10 分钟内发送首次内部同步；稳定前每 15 分钟更新一次状态。"
    if severity == "sev2":
        return "确认事故后 10 分钟内发送首次内部同步；稳定前每 30 分钟更新一次状态。"
    return "先发送内部确认通知；状态变化或确认临时方案后再更新。"


def _escalation_path(request: IncidentRunbookRequest, severity: IncidentSeverity) -> str:
    if severity == "sev1":
        return "立即指定事故指挥官、服务端排查负责人、客服话术负责人和补偿方案负责人。"
    if _requires_approval(request):
        return "公开沟通前，先把事故负责人和补偿方案提交给运营负责人审批。"
    return "指定事故负责人和客服话术负责人；如果影响范围或持续时间扩大，立即升级。"


def _compensation_guidance(request: IncidentRunbookRequest) -> str:
    if _requires_approval(request):
        return "暂时不要承诺高级货币、退款或全账号补偿。先整理书面补偿方案，并取得事故指挥官或运营负责人审批。"
    if request.duration_minutes is None:
        return "先补齐持续时间和可量化玩家损失数据，再决定仅公告说明还是进入补偿流程。"
    if request.duration_minutes < 15:
        return "若日志没有确认可量化玩家损失，优先发布说明，不直接承诺补偿。"
    if request.duration_minutes <= 60:
        return "准备补偿方案并提交运营负责人审批，审批完成前不要对玩家作出承诺。"
    return "事故持续超过 60 分钟，补偿方案需要升级给事故指挥官审批。"


def _next_actions(
    request: IncidentRunbookRequest,
    severity: IncidentSeverity,
    risk_level: RiskLevel,
    missing: list[str],
) -> list[str]:
    actions = [
        "开启事故群，并同步当前状态、受影响服务、玩家影响和负责人。",
        f"在恢复确认前，按照 {severity.upper()} 通信节奏持续同步状态。",
    ]
    if missing:
        actions.append(f"补齐事故字段：{', '.join(missing)}。")
    if severity in {"sev1", "sev2"}:
        actions.append("指定服务端排查、客服话术和玩家损失评估负责人。")
    if _requires_approval(request) or risk_level in {RiskLevel.HIGH, RiskLevel.CRITICAL}:
        actions.append("公开提及补偿、回滚、退款或高级货币前，必须先完成审批。")
    actions.append("缓解后记录根因、时间线、玩家影响和后续预防事项。")
    return actions


def _execution_tasks(
    request: IncidentRunbookRequest,
    severity: IncidentSeverity,
    risk_level: RiskLevel,
    missing: list[str],
) -> list[ExecutionTask]:
    tasks = [
        ExecutionTask(
            task_id="incident-room",
            title="开启事故群并同步初始状态",
            owner_role="事故指挥官",
            status="pending",
            due="立即",
            evidence_required=["事故群链接", "当前状态摘要"],
        ),
        ExecutionTask(
            task_id="impact-assessment",
            title="确认影响范围与玩家损失",
            owner_role="服务端排查负责人",
            status="pending",
            due="30 分钟内",
            evidence_required=["受影响服务清单", "玩家影响数据", "日志截图"],
        ),
        ExecutionTask(
            task_id="support-message",
            title="准备客服同步口径",
            owner_role="客服话术负责人",
            status="pending",
            due="首次对外沟通前",
            evidence_required=["客服 FAQ", "玩家沟通口径"],
        ),
    ]
    if missing:
        tasks.append(
            ExecutionTask(
                task_id="incident-fields",
                title="补齐事故记录字段",
                owner_role="事故指挥官",
                status="pending",
                due="复盘前",
                evidence_required=missing,
            )
        )
    if _requires_approval(request) or risk_level in {RiskLevel.HIGH, RiskLevel.CRITICAL}:
        tasks.append(
            ExecutionTask(
                task_id="approval-compensation",
                title="审批补偿与公告口径",
                owner_role="运营负责人",
                status="waiting_approval",
                due="对外公告前",
                approval_required=True,
                evidence_required=["补偿方案", "影响范围", "公告草稿"],
            )
        )
    if severity in {"sev1", "sev2"}:
        tasks.append(
            ExecutionTask(
                task_id="postmortem",
                title="完成事故复盘和预防事项",
                owner_role="事故指挥官",
                status="pending",
                due="恢复后 24 小时内",
                evidence_required=["时间线", "根因分析", "预防事项"],
            )
        )
    return tasks


def _requires_approval(request: IncidentRunbookRequest) -> bool:
    text = f"{request.proposed_compensation or ''} {_combined_text(request)}".lower()
    return any(
        term in text
        for term in (
            "premium currency",
            "gems",
            "refund",
            "all players",
            "server-wide",
            "account-wide",
            "rollback",
        )
    )


def _combined_text(request: IncidentRunbookRequest) -> str:
    return (
        f"{request.incident_summary} {request.affected_services} {request.impact} "
        f"{request.proposed_compensation or ''}"
    ).lower()
