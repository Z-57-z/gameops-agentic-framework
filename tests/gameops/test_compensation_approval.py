from dataclasses import dataclass

import pytest
from pydantic import ValidationError

from omnigent.gameops.schemas import CompensationApprovalEvaluateRequest, ExecutionTask


def _approval_task() -> ExecutionTask:
    return ExecutionTask(
        task_id="exception-approval",
        title="Exception approval",
        owner_role="ops lead",
        status="waiting_approval",
        due="before delivery",
        approval_required=True,
    )


def _eligible_request(
    *,
    account_risk_status: str = "clear",
    recent_manual_compensation_count: int = 0,
    reward_type: str = "consumable",
    reward_amount: int = 10,
) -> CompensationApprovalEvaluateRequest:
    return CompensationApprovalEvaluateRequest.model_validate(
        {
            "task": _approval_task().model_dump(),
            "category": "payment_reward",
            "player": {
                "account_risk_status": account_risk_status,
                "recent_manual_compensation_count": recent_manual_compensation_count,
            },
            "verification": {
                "payment_status": "paid",
                "event_eligibility": "eligible",
                "delivery_status": "failed",
            },
            "reward_type": reward_type,
            "reward_amount": reward_amount,
            "evidence": {"order": "paid", "delivery": "failed"},
        }
    )


@dataclass
class FakeLlm:
    response: str
    model_id: str = "fake-model"
    calls: int = 0

    async def complete(self, prompt: str) -> str:
        self.calls += 1
        return self.response


def test_approval_request_requires_verification() -> None:
    with pytest.raises(ValidationError):
        CompensationApprovalEvaluateRequest.model_validate({"task": _approval_task().model_dump()})


def test_task_serializes_ai_provenance() -> None:
    task = ExecutionTask.model_validate(
        {
            **_approval_task().model_dump(),
            "approval_provenance": {
                "source": "ai_auto",
                "decision_id": "ai-1",
                "summary": "Verified delivery failure.",
                "decided_at": "2026-07-16T00:00:00Z",
            },
        }
    )

    assert task.approval_provenance.source == "ai_auto"


@pytest.mark.asyncio
async def test_verified_claim_is_auto_approved() -> None:
    from omnigent.gameops.compensation_approval import CompensationApprovalEvaluator

    evaluator = CompensationApprovalEvaluator(
        FakeLlm(
            '{"risk_level":"low","risk_score":12,"recommended_action":"auto_approve",'
            '"reason":"Payment and delivery logs agree.","evidence_used":["order","delivery"]}'
        )
    )

    result = await evaluator.evaluate(_eligible_request())

    assert result.decision_source == "ai_auto"
    assert result.decision_status == "auto_approved"
    assert result.model_id == "fake-model"


@pytest.mark.asyncio
async def test_flagged_account_never_calls_model() -> None:
    from omnigent.gameops.compensation_approval import CompensationApprovalEvaluator

    model = FakeLlm("unused")
    result = await CompensationApprovalEvaluator(model).evaluate(
        _eligible_request(account_risk_status="flagged")
    )

    assert result.decision_source == "rule_blocked"
    assert result.decision_status == "manual_review"
    assert model.calls == 0


@pytest.mark.asyncio
async def test_invalid_model_json_falls_back_to_manual_review() -> None:
    from omnigent.gameops.compensation_approval import CompensationApprovalEvaluator

    result = await CompensationApprovalEvaluator(FakeLlm("not json")).evaluate(_eligible_request())

    assert result.decision_source == "fallback"
    assert result.decision_status == "manual_review"


@pytest.mark.asyncio
async def test_auto_approval_persists_provenance_and_audit(tmp_path) -> None:
    from omnigent.gameops.compensation_approval import CompensationApprovalEvaluator
    from omnigent.gameops.execution import GameOpsExecutionRuntime

    runtime = GameOpsExecutionRuntime(db_path=tmp_path / "approval.db")
    response = await runtime.evaluate_compensation_approval(
        _eligible_request(),
        CompensationApprovalEvaluator(
            FakeLlm(
                '{"risk_level":"medium","risk_score":44,"recommended_action":"auto_approve",'
                '"reason":"Verified reward failure.","evidence_used":["order"]}'
            )
        ),
    )

    assert response.task.status == "pending"
    assert response.task.approved_by is None
    assert response.task.approval_provenance.source == "ai_auto"
    assert runtime.history().records[0].action == "ai_approve"
    assert runtime.history().records[0].decision.decision_id == response.decision.decision_id
