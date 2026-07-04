"""First-party GameOps workflow routing."""

from __future__ import annotations

from omnigent.gameops.schemas import GameOpsMode, WorkflowKind

_CAMPAIGN_TERMS = {
    "announcement",
    "campaign",
    "checklist",
    "draft",
    "event",
    "launch",
    "localization",
    "reward table",
    "rollback",
    "weekend",
    "上线",
    "公告",
    "周末",
    "活动",
    "奖励表",
    "回滚",
}
_TICKET_TERMS = {
    "account",
    "ban",
    "order",
    "payment",
    "player ticket",
    "receipt",
    "refund",
    "support ticket",
    "ticket",
    "unban",
    "客服工单",
    "工单",
    "支付",
    "订单",
    "收据",
    "退款",
    "封禁",
    "账号",
}
_INCIDENT_TERMS = {
    "incident",
    "login outage",
    "login issue",
    "login incident",
    "outage",
    "sev1",
    "sev2",
    "severity",
    "unavailable",
    "downtime",
    "事故",
    "故障",
    "登录故障",
    "登录异常",
    "宕机",
    "不可用",
    "严重程度",
}


def route_workflow(question: str, mode: GameOpsMode | None = None) -> WorkflowKind:
    """Classify a request into a GameOps business workflow."""
    if mode == GameOpsMode.CAMPAIGN:
        return WorkflowKind.CAMPAIGN_OPS
    if mode == GameOpsMode.TICKETS:
        return WorkflowKind.TICKET_TRIAGE
    if mode == GameOpsMode.INCIDENT:
        return WorkflowKind.INCIDENT_RUNBOOK

    text = question.lower()
    if _contains_any(text, _INCIDENT_TERMS):
        return WorkflowKind.INCIDENT_RUNBOOK
    if _contains_any(text, _TICKET_TERMS):
        return WorkflowKind.TICKET_TRIAGE
    if _contains_any(text, _CAMPAIGN_TERMS):
        return WorkflowKind.CAMPAIGN_OPS
    return WorkflowKind.KNOWLEDGE_QA


def _contains_any(text: str, terms: set[str]) -> bool:
    return any(term in text for term in terms)
