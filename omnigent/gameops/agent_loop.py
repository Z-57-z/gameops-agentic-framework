"""Bounded first-party GameOps business loop."""

from __future__ import annotations

from dataclasses import dataclass

from omnigent.gameops.knowledge_store import KnowledgeStore, load_default_knowledge_base
from omnigent.gameops.llm_client import DeterministicGameOpsLLMClient, LLMClient
from omnigent.gameops.retriever import LexicalRetriever
from omnigent.gameops.schemas import (
    AuditTrail,
    GameOpsAskRequest,
    GameOpsAskResponse,
    RetrievalResult,
    RiskLevel,
    WorkflowKind,
)
from omnigent.gameops.workflow_router import route_workflow

_HIGH_RISK_TERMS = {
    "account action",
    "all players",
    "ban",
    "compensate all",
    "compensation",
    "gems",
    "premium currency",
    "public announcement",
    "refund",
    "rollback",
    "全服",
    "公告",
    "回滚",
    "宝石",
    "封禁",
    "补偿",
    "退款",
    "高级货币",
}
_CRITICAL_RISK_TERMS = {"payment loss", "refund", "rollback", "sev1", "支付损失", "退款", "全量回滚"}


@dataclass(frozen=True)
class GameOpsAgentLoop:
    """Single-pass source-backed GameOps agent loop."""

    retriever: LexicalRetriever
    llm_client: LLMClient

    async def ask(self, request: GameOpsAskRequest) -> GameOpsAskResponse:
        """Answer a GameOps request with evidence, risk, and audit data."""
        workflow = route_workflow(request.question, request.mode)
        retrieved = self.retriever.search(request.question, limit=4)
        risk_level = _risk_for(request.question, workflow)
        audit = AuditTrail(
            retrieved_chunk_ids=[result.chunk.chunk_id for result in retrieved],
            validation_notes=[],
        )

        if not retrieved:
            audit.validation_notes.append("未命中可引用知识片段，回答已降级。")
            return GameOpsAskResponse(
                answer=(
                    "当前内置 GameOps 知识库不足以安全回答这个问题。请先补齐相关政策或操作手册，"
                    "再对玩家做任何明确承诺。"
                ),
                workflow=workflow,
                risk_level=risk_level,
                sources=[],
                next_actions=["先补充或定位相关 GameOps 政策，再回复玩家。"],
                missing_information=["没有命中内置知识来源。"],
                confidence=0,
                audit=audit,
            )

        prompt = _build_evidence_prompt(request.question, workflow, retrieved)
        model_text = await self.llm_client.complete(prompt)
        answer = _compose_answer(request.question, workflow, retrieved, model_text)
        sources = [result.chunk.to_source_ref() for result in retrieved]
        next_actions = _next_actions_for(request.question, workflow, risk_level)
        missing = _missing_information_for(request.question, workflow)
        audit.validation_notes.append("所有返回来源均来自本次检索到的知识片段。")
        if risk_level in {RiskLevel.HIGH, RiskLevel.CRITICAL}:
            audit.validation_notes.append("高风险回复在面向玩家承诺前需要审批。")

        return GameOpsAskResponse(
            answer=answer,
            workflow=workflow,
            risk_level=risk_level,
            sources=sources,
            next_actions=next_actions,
            missing_information=missing,
            confidence=0.82 if missing else 0.9,
            audit=audit,
        )


def create_default_gameops_agent(store: KnowledgeStore | None = None) -> GameOpsAgentLoop:
    """Create the default local-demo GameOps agent runtime."""
    knowledge_store = store or load_default_knowledge_base()
    return GameOpsAgentLoop(
        retriever=LexicalRetriever(knowledge_store),
        llm_client=DeterministicGameOpsLLMClient(),
    )


def _risk_for(question: str, workflow: WorkflowKind) -> RiskLevel:
    text = question.lower()
    if any(term in text for term in _CRITICAL_RISK_TERMS):
        return RiskLevel.CRITICAL
    if any(term in text for term in _HIGH_RISK_TERMS):
        return RiskLevel.HIGH
    if workflow in {WorkflowKind.CAMPAIGN_OPS, WorkflowKind.INCIDENT_RUNBOOK, WorkflowKind.TICKET_TRIAGE}:
        return RiskLevel.MEDIUM
    return RiskLevel.LOW


def _build_evidence_prompt(
    question: str,
    workflow: WorkflowKind,
    retrieved: list[RetrievalResult],
) -> str:
    evidence = "\n\n".join(
        f"[{result.chunk.chunk_id}] {result.chunk.title} / {result.chunk.section}\n{result.chunk.text}"
        for result in retrieved
    )
    return f"Workflow: {workflow.value}\nQuestion: {question}\nEvidence:\n{evidence}"


def _compose_answer(
    question: str,
    workflow: WorkflowKind,
    retrieved: list[RetrievalResult],
    model_text: str,
) -> str:
    top = retrieved[0].chunk
    text = question.lower()
    if ("missed" in text and "rebate" in text) or ("错过" in text and "返利" in text):
        return (
            "客服在承诺补发前，应先核验玩家 ID、服务器 ID、账号 ID、活动 ID、充值时间和发奖日志。"
            "如果日志确认玩家符合资格且确实发生发放失败，可以按来源政策承诺在 1 个工作日内人工补发。"
            f"本回答依据：{top.title}。"
        )
    if (
        "compensate" in text
        or "premium currency" in text
        or "gems" in text
        or "补偿" in text
        or "高级货币" in text
        or "宝石" in text
    ):
        return (
            "不要直接承诺发放高级货币补偿。应先整理补偿方案、影响范围、发放数量和风险说明，"
            "提交运营负责人或事故负责人审批；审批记录完成前，对玩家只能使用条件性说明。"
        )
    if workflow == WorkflowKind.CAMPAIGN_OPS:
        return (
            "活动上线前需要确认活动时间、目标服务器、参与资格、奖励表、本地化文案、公告文案、"
            "客服 FAQ、回滚方案和监控看板。"
        )
    if workflow == WorkflowKind.TICKET_TRIAGE:
        return (
            "工单分诊时先收集玩家 ID、服务器 ID、活动或订单 ID、关键时间点、截图或支付凭证；"
            "涉及支付、退款或账号处理的情况需要升级处理。"
        )
    if workflow == WorkflowKind.INCIDENT_RUNBOOK:
        return (
            "请按事故手册处理：指定事故负责人，确定内部同步频率，拆分技术排查和客服沟通负责人，"
            "并在补偿口径上设置审批门禁。"
        )
    first_sentence = top.text.split(".", 1)[0].replace("## ", "").strip()
    if first_sentence:
        return f"根据 {top.title} / {top.section}：{first_sentence}。"
    return model_text.split("\n", 1)[0].strip()


def _next_actions_for(question: str, workflow: WorkflowKind, risk_level: RiskLevel) -> list[str]:
    actions: list[str] = []
    text = question.lower()
    if "rebate" in text or "reward" in text or "返利" in text or "奖励" in text:
        actions.extend([
            "核验玩家 ID、服务器 ID、活动 ID、充值时间和发奖日志。",
            "资格确认前使用条件性话术，不直接承诺补发。",
        ])
    if workflow == WorkflowKind.CAMPAIGN_OPS:
        actions.extend([
            "上线前逐项比对活动配置和公告文案。",
            "确认回滚负责人和监控看板。",
        ])
    if workflow == WorkflowKind.TICKET_TRIAGE:
        actions.append("补齐工单必要标识后再给出最终回复。")
    if workflow == WorkflowKind.INCIDENT_RUNBOOK:
        actions.append("指定事故负责人，并按约定节奏发布内部同步。")
    if risk_level in {RiskLevel.HIGH, RiskLevel.CRITICAL}:
        actions.append("任何面向玩家的承诺前，先取得运营负责人或事故负责人的审批。")
    return actions or ["依据引用的 GameOps 来源回复，并记录决策理由。"]


def _missing_information_for(question: str, workflow: WorkflowKind) -> list[str]:
    text = question.lower()
    missing: list[str] = []
    if (
        "player" in text
        or "ticket" in text
        or "reward" in text
        or "玩家" in text
        or "工单" in text
        or "奖励" in text
    ) and "player id" not in text and "玩家 id" not in text:
        missing.append("玩家 ID")
    if ("payment" in text or "支付" in text) and "order" not in text and "订单" not in text:
        missing.append("订单 ID 或平台支付凭证 ID")
    if workflow == WorkflowKind.CAMPAIGN_OPS and "time" not in text and "时间" not in text:
        missing.append("活动开始和结束时间")
    return missing
