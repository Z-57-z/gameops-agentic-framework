"""Fail-closed AI approval for verified missed payment-reward claims."""

from __future__ import annotations

from datetime import UTC, datetime
import json
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, Field, ValidationError

from omnigent.gameops.llm_client import LLMClient, create_configured_gameops_llm_client
from omnigent.gameops.schemas import AiApprovalDecision, CompensationApprovalEvaluateRequest

_PROMPT_VERSION = "compensation-approval-v1"


class _ModelRecommendation(BaseModel):
    risk_level: Literal["low", "medium", "high"]
    risk_score: int = Field(ge=0, le=100)
    recommended_action: Literal["auto_approve", "manual_review"]
    reason: str = Field(min_length=1, max_length=500)
    evidence_used: list[str] = Field(min_length=1, max_length=10)


class CompensationApprovalEvaluator:
    def __init__(self, llm_client: LLMClient | None) -> None:
        self._llm_client = llm_client

    async def evaluate(self, request: CompensationApprovalEvaluateRequest) -> AiApprovalDecision:
        rules = _hard_rules(request)
        if rules:
            return _decision("rule_blocked", "manual_review", "high", 100, rules[0], rules)
        if self._llm_client is None:
            return _decision("fallback", "manual_review", "high", 100, "AI model is not configured.", [])
        try:
            parsed = _ModelRecommendation.model_validate_json(await self._llm_client.complete(_prompt(request)))
        except (RuntimeError, ValidationError, ValueError, json.JSONDecodeError):
            return _decision("fallback", "manual_review", "high", 100, "AI review failed validation.", [])
        if parsed.risk_level in {"low", "medium"} and parsed.recommended_action == "auto_approve":
            return _decision("ai_auto", "auto_approved", parsed.risk_level, parsed.risk_score, parsed.reason, [], parsed.evidence_used, self._llm_client.model_id)
        return _decision("fallback", "manual_review", parsed.risk_level, parsed.risk_score, parsed.reason, [], parsed.evidence_used, self._llm_client.model_id)


def create_default_compensation_approval_evaluator() -> CompensationApprovalEvaluator:
    return CompensationApprovalEvaluator(create_configured_gameops_llm_client())


def _hard_rules(request: CompensationApprovalEvaluateRequest) -> list[str]:
    if request.category != "payment_reward":
        return ["Only payment-reward tickets are eligible for AI approval."]
    if request.task.task_id != "exception-approval":
        return ["Only exception-approval tasks are eligible for AI approval."]
    if request.verification.payment_status != "paid":
        return ["Payment is not verified as paid."]
    if request.verification.event_eligibility != "eligible":
        return ["Event eligibility is not verified."]
    if request.verification.delivery_status != "failed":
        return ["Reward delivery failure is not verified."]
    if request.player.account_risk_status != "clear":
        return ["Player account requires manual risk review."]
    if request.player.recent_manual_compensation_count >= 2:
        return ["Player has reached the recent manual compensation threshold."]
    if request.reward_type == "premium_currency" and request.reward_amount > 500:
        return ["Premium currency compensation exceeds 500 gems."]
    return []


def _prompt(request: CompensationApprovalEvaluateRequest) -> str:
    return "Return JSON only for this verified reward claim: " + request.model_dump_json()


def _decision(source: str, status: str, risk_level: str, risk_score: int, reason: str, rules: list[str], evidence: list[str] | None = None, model_id: str | None = None) -> AiApprovalDecision:
    return AiApprovalDecision(
        decision_id=f"ai-{uuid4()}", decision_source=source, decision_status=status,
        risk_level=risk_level, risk_score=risk_score, reason=reason,
        evidence_used=evidence or [], hard_rule_results=rules, model_id=model_id,
        prompt_version=_PROMPT_VERSION, decided_at=datetime.now(UTC).isoformat(),
    )
