# AI Compensation Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically approve verified low- or medium-risk missed-rebate claims while preserving visibly distinct AI, rule, and human approval histories.

**Architecture:** A policy-first evaluator sits between ticket evidence collection and `GameOpsExecutionRuntime`. It runs deterministic gates before calling a configured OpenAI-compatible LLM for strict JSON, and persists AI provenance without using a human approver. The existing task console submits verification evidence and renders the resulting decision.

**Tech Stack:** Python 3.12, FastAPI, Pydantic v2, OpenAI async client, pytest, React, TypeScript, Vitest.

---

## File Structure

- Create `omnigent/gameops/compensation_approval.py`: hard-rule gates and structured model evaluation.
- Modify `omnigent/gameops/llm_client.py`: configured model adapter and model metadata.
- Modify `omnigent/gameops/schemas.py`: approval request, decision, provenance, and audit contracts.
- Modify `omnigent/gameops/execution.py`: AI-decision persistence and task transition.
- Modify `omnigent/server/routes/gameops.py`: protected evaluation endpoint.
- Create `tests/gameops/test_compensation_approval.py`: evaluator and persistence tests.
- Modify `tests/server/test_gameops_execution_route.py`: route and execution-gate tests.
- Modify `ap-web/src/lib/gameopsApi.ts`: typed API client and wire conversion.
- Modify `ap-web/src/pages/GameOpsPage.tsx`: evidence fields and visible decision card.
- Modify `ap-web/src/pages/GameOpsPage.test.tsx`: UI regression coverage.
- Modify `docs/local-docker-deploy.md`: model configuration and fallback notes.

### Task 1: Define approval contracts

**Files:**
- Modify `omnigent/gameops/schemas.py:201-250`
- Create `tests/gameops/test_compensation_approval.py`

- [ ] **Step 0: Add reusable test fixtures at the top of `tests/gameops/test_compensation_approval.py`.**

```python
from dataclasses import dataclass

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


def _eligible_request(account_risk: str = "clear") -> CompensationApprovalEvaluateRequest:
    return CompensationApprovalEvaluateRequest.model_validate(
        {
            "task": _approval_task().model_dump(),
            "category": "payment_reward",
            "player": {"account_risk_status": account_risk, "recent_manual_compensation_count": 0},
            "verification": {"payment_status": "paid", "event_eligibility": "eligible", "delivery_status": "failed"},
            "reward_type": "consumable",
            "reward_amount": 10,
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
```

- [ ] **Step 1: Write the failing validation tests.**

```python
import pytest
from pydantic import ValidationError

from omnigent.gameops.schemas import CompensationApprovalEvaluateRequest


def test_approval_request_requires_verification() -> None:
    with pytest.raises(ValidationError):
        CompensationApprovalEvaluateRequest.model_validate({"task": _approval_task()})


def test_task_serializes_ai_provenance() -> None:
    task = _approval_task().model_copy(
        update={"approval_provenance": {"source": "ai_auto", "decision_id": "ai-1", "summary": "verified", "decided_at": "2026-07-16T00:00:00Z"}}
    )
    assert task.approval_provenance.source == "ai_auto"
```

- [ ] **Step 2: Run `pytest tests/gameops/test_compensation_approval.py -q`; expect failure because these types do not exist.**

- [ ] **Step 3: Add the models beside `ExecutionTask`.**

```python
ApprovalDecisionSource = Literal["ai_auto", "manual", "rule_blocked", "fallback"]
ApprovalDecisionStatus = Literal["auto_approved", "manual_review"]


class ApprovalProvenance(BaseModel):
    source: ApprovalDecisionSource
    decision_id: str
    summary: str
    decided_at: str


class PlayerApprovalProfile(BaseModel):
    account_risk_status: Literal["clear", "flagged", "unknown"]
    recent_manual_compensation_count: int = Field(ge=0)


class PaymentRewardVerification(BaseModel):
    payment_status: Literal["paid", "unpaid", "unknown"]
    event_eligibility: Literal["eligible", "ineligible", "unknown"]
    delivery_status: Literal["failed", "delivered", "unknown"]


class CompensationApprovalEvaluateRequest(BaseModel):
    task: ExecutionTask
    category: str
    player: PlayerApprovalProfile
    verification: PaymentRewardVerification
    reward_type: Literal["consumable", "premium_currency"]
    reward_amount: int = Field(ge=1)
    evidence: dict[str, str] = Field(default_factory=dict)
```

Add `AiApprovalDecision` with decision ID, source/status, risk level/score, reason, evidence, hard-rule results, optional model ID, prompt version, and timestamp. Extend `ExecutionTask` with `approval_provenance`; extend `ExecutionAction` with `ai_approve`; extend `ExecutionHistoryRecord` with optional decision; and add `CompensationApprovalEvaluateResponse(task, decision, audit)`.

- [ ] **Step 4: Run `pytest tests/gameops/test_compensation_approval.py -q`; expect PASS.**

- [ ] **Step 5: Commit:** `git add omnigent/gameops/schemas.py tests/gameops/test_compensation_approval.py && git commit -m "feat: define AI approval contracts"`.

### Task 2: Build the policy-first evaluator

**Files:**
- Modify `omnigent/gameops/llm_client.py`
- Create `omnigent/gameops/compensation_approval.py`
- Modify `tests/gameops/test_compensation_approval.py`

- [ ] **Step 1: Write failing evaluator tests.**

```python
@pytest.mark.asyncio
async def test_verified_claim_is_auto_approved() -> None:
    evaluator = CompensationApprovalEvaluator(
        FakeLlm('{"risk_level":"low","risk_score":12,"recommended_action":"auto_approve","reason":"logs agree","evidence_used":["payment"]}')
    )
    result = await evaluator.evaluate(_eligible_request())
    assert result.decision.decision_source == "ai_auto"
    assert result.decision.decision_status == "auto_approved"


@pytest.mark.asyncio
async def test_flagged_account_never_calls_model() -> None:
    model = FakeLlm("unused")
    result = await CompensationApprovalEvaluator(model).evaluate(_eligible_request(account_risk="flagged"))
    assert result.decision.decision_source == "rule_blocked"
    assert model.calls == 0


@pytest.mark.asyncio
async def test_invalid_json_falls_back_to_manual_review() -> None:
    result = await CompensationApprovalEvaluator(FakeLlm("not json")).evaluate(_eligible_request())
    assert result.decision.decision_source == "fallback"
    assert result.decision.decision_status == "manual_review"
```

- [ ] **Step 2: Run `pytest tests/gameops/test_compensation_approval.py -q`; expect failure because the evaluator is absent.**

- [ ] **Step 3: Implement model selection in `llm_client.py`.** Add `model_id: str` to `LLMClient`, set `DeterministicGameOpsLLMClient.model_id = "deterministic-gameops"`, and create `create_configured_gameops_llm_client()`. It returns `None` without `LLM_API_KEY` or `OPENAI_API_KEY` plus `LLM_MODEL` or `OPENAI_MODEL`; otherwise it returns `OpenAICompatibleGameOpsLLMClient` backed by `AsyncOpenAI`, using optional `LLM_BASE_URL`/`OPENAI_BASE_URL`, `temperature=0`, and assistant text only. Raise `RuntimeError` for missing text and never log credentials or prompts.

- [ ] **Step 4: Implement `CompensationApprovalEvaluator.evaluate()`.** Return `rule_blocked` before a model call when category is not `payment_reward`, task ID is not `exception-approval`, verification is not `paid`/`eligible`/`failed`, account status is not clear, compensation count is at least two, or premium currency exceeds 500 gems. Return `fallback` and `manual_review` when no model exists, it raises, its reply is non-JSON, or its reply violates the schema.

```python
class _ModelRecommendation(BaseModel):
    risk_level: Literal["low", "medium", "high"]
    risk_score: int = Field(ge=0, le=100)
    recommended_action: Literal["auto_approve", "manual_review"]
    reason: str = Field(min_length=1, max_length=500)
    evidence_used: list[str] = Field(min_length=1, max_length=10)
```

Only `low`/`medium` plus `auto_approve` maps to `ai_auto` and `auto_approved`; every other valid output maps to `fallback` and `manual_review`. Generate a UUID, UTC ISO timestamp, and `prompt_version="compensation-approval-v1"` for every decision.

- [ ] **Step 5: Run `pytest tests/gameops/test_compensation_approval.py -q`; expect PASS with no model call for hard rules.**

- [ ] **Step 6: Commit:** `git add omnigent/gameops/llm_client.py omnigent/gameops/compensation_approval.py tests/gameops/test_compensation_approval.py && git commit -m "feat: evaluate compensation claims with AI"`.

### Task 3: Persist AI decisions without human impersonation

**Files:**
- Modify `omnigent/gameops/execution.py:380-460`
- Modify `tests/gameops/test_compensation_approval.py`

- [ ] **Step 1: Write a failing persistence test.**

```python
@pytest.mark.asyncio
async def test_auto_approval_persists_provenance_and_audit(tmp_path: Path) -> None:
    runtime = GameOpsExecutionRuntime(db_path=tmp_path / "approval.db")
    response = await runtime.evaluate_compensation_approval(_eligible_request(), _auto_evaluator())
    assert response.task.status == "pending"
    assert response.task.approved_by is None
    assert response.task.approval_provenance.source == "ai_auto"
    assert runtime.history().records[0].action == "ai_approve"
```

- [ ] **Step 2: Run `pytest tests/gameops/test_compensation_approval.py::test_auto_approval_persists_provenance_and_audit -q`; expect failure because the runtime method is absent.**

- [ ] **Step 3: Implement `GameOpsExecutionRuntime.evaluate_compensation_approval()`.** Call the evaluator, then copy and persist the task.

```python
task = request.task.model_copy(
    update={
        "status": "pending" if decision.decision_status == "auto_approved" else "waiting_approval",
        "approval_provenance": ApprovalProvenance(
            source=decision.decision_source,
            decision_id=decision.decision_id,
            summary=decision.reason,
            decided_at=decision.decided_at,
        ),
    }
)
```

Use `_remember_task` and `_remember` with action `ai_approve`, actor `gameops-ai`, tool `gameops.ai_compensation_approval`, full decision, and redacted evidence. Return `success` only for auto approval; otherwise `blocked`. Do not set `approved_by` or `approval_comment`.

- [ ] **Step 4: Add reload coverage and call existing `approve()` with a named human. Assert the decision ID survives and human approval does not erase `approval_provenance`.**

- [ ] **Step 5: Run `pytest tests/gameops/test_compensation_approval.py tests/server/test_gameops_execution_route.py -q`; expect PASS.**

- [ ] **Step 6: Commit:** `git add omnigent/gameops/execution.py omnigent/gameops/schemas.py tests/gameops/test_compensation_approval.py && git commit -m "feat: audit AI compensation decisions"`.

### Task 4: Publish the protected API

**Files:**
- Modify `omnigent/server/routes/gameops.py:52-130`
- Modify `tests/server/test_gameops_execution_route.py`

- [ ] **Step 1: Write failing route tests.**

```python
def test_approval_endpoint_returns_ai_provenance() -> None:
    response = _client(approval_evaluator=_auto_evaluator()).post(
        "/v1/gameops/tickets/approval/evaluate", json=_eligible_request_payload()
    )
    assert response.status_code == 200
    assert response.json()["task"]["approval_provenance"]["source"] == "ai_auto"
    assert response.json()["decision"]["model_id"] == "fake-model"


def test_approval_endpoint_requires_gameops_key(monkeypatch: MonkeyPatch) -> None:
    monkeypatch.setenv("GAMEOPS_API_KEY", "secret")
    assert _client().post("/v1/gameops/tickets/approval/evaluate", json=_eligible_request_payload()).status_code == 401
```

- [ ] **Step 2: Run `pytest tests/server/test_gameops_execution_route.py -q`; expect failure because injection and route are absent.**

- [ ] **Step 3: Add optional `compensation_approval_evaluator` to `create_gameops_router()` and add this route next to `triage_ticket`.**

```python
@router.post("/gameops/tickets/approval/evaluate")
async def evaluate_ticket_approval(
    request: CompensationApprovalEvaluateRequest,
) -> CompensationApprovalEvaluateResponse:
    return await gameops_execution_runtime.evaluate_compensation_approval(
        request, gameops_compensation_approval_evaluator
    )
```

Reuse the router-level `require_gameops_api_key`; do not introduce another authorization path.

- [ ] **Step 4: Run `pytest tests/server/test_gameops_execution_route.py tests/server/test_gameops_ticket_route.py -q`; expect PASS.**

- [ ] **Step 5: Commit:** `git add omnigent/server/routes/gameops.py tests/server/test_gameops_execution_route.py && git commit -m "feat: expose AI compensation approval API"`.

### Task 5: Make AI approval unmistakable in the UI

**Files:**
- Modify `ap-web/src/lib/gameopsApi.ts`
- Modify `ap-web/src/pages/GameOpsPage.tsx:867-1170`
- Modify `ap-web/src/pages/GameOpsPage.test.tsx`

- [ ] **Step 1: Write failing UI tests.**

```tsx
it("shows an explicit AI automatic approval record", async () => {
  server.use(http.post("/v1/gameops/tickets/approval/evaluate", () => HttpResponse.json(aiApprovedWire)));
  render(<GameOpsPage />);
  await userEvent.click(screen.getByRole("button", { name: "AI 智能审批" }));
  expect(await screen.findByText("AI 自动审批")).toBeInTheDocument();
  expect(screen.getByText("fake-model")).toBeInTheDocument();
  expect(screen.getByText("ai-1")).toBeInTheDocument();
});

it("keeps human approval after AI requests manual review", async () => {
  server.use(http.post("/v1/gameops/tickets/approval/evaluate", () => HttpResponse.json(manualReviewWire)));
  render(<GameOpsPage />);
  await userEvent.click(screen.getByRole("button", { name: "AI 智能审批" }));
  expect(await screen.findByText("转人工审批")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "审批通过" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run `npm --prefix ap-web test -- GameOpsPage.test.tsx`; expect failure because the client, action, and panel are absent.**

- [ ] **Step 3: Add typed API conversion in `gameopsApi.ts`.** Mirror backend request, decision, provenance, and response types; extend the action union with `ai_approve`; add optional `approvalProvenance` to `ExecutionTask`; map snake_case fields to camelCase; and call `POST /v1/gameops/tickets/approval/evaluate` through `authenticatedFetch`.

- [ ] **Step 4: Add the control and decision card.** In `ExecutionTaskClosurePanel`, render account-risk status, compensation count, payment status, event eligibility, delivery status, reward type, and reward amount only for `exception-approval`. Add an `AI 智能审批` button that submits these fields and the task. Render the decision with exact visible labels:

```tsx
<ResultPanel title="AI 审批记录">
  <span>{decision.decisionStatus === "auto_approved" ? "AI 自动审批" : "转人工审批"}</span>
  <p>模型：{decision.modelId ?? "未配置模型"}</p>
  <p>风险：{decision.riskLevel} / {decision.riskScore}</p>
  <p>决策 ID：{decision.decisionId}</p>
  <p>{decision.reason}</p>
  <List items={decision.evidenceUsed} muted />
</ResultPanel>
```

Every task whose source is `ai_auto` shows `AI 自动审批`, never a person. Retain the human approval button for `waiting_approval` tasks.

- [ ] **Step 5: Run `npm --prefix ap-web test -- GameOpsPage.test.tsx` and `npm --prefix ap-web run type-check`; expect both to pass.**

- [ ] **Step 6: Commit:** `git add ap-web/src/lib/gameopsApi.ts ap-web/src/pages/GameOpsPage.tsx ap-web/src/pages/GameOpsPage.test.tsx && git commit -m "feat: show AI compensation approvals"`.

### Task 6: Verify gates and document operation

**Files:**
- Modify `tests/server/test_gameops_execution_route.py`
- Modify `docs/local-docker-deploy.md`

- [ ] **Step 1: Add safety-gate tests.**

```python
def test_execution_accepts_persisted_ai_auto_approval() -> None:
    runtime = GameOpsExecutionRuntime()
    approved_task = _evaluate_eligible_claim(runtime).task
    assert runtime.run(_run_request(approved_task)).task.status == "done"


def test_manual_review_stays_blocked_until_human_approval() -> None:
    runtime = GameOpsExecutionRuntime()
    reviewed_task = _evaluate_fallback_claim(runtime).task
    assert runtime.run(_run_request(reviewed_task)).tool_result.status == "blocked"
```

- [ ] **Step 2: Run `pytest tests/gameops/test_compensation_approval.py tests/server/test_gameops_execution_route.py tests/server/test_gameops_ticket_route.py -q`; expect PASS and only persisted `ai_auto` decisions to unlock execution.**

- [ ] **Step 3: Document that `LLM_API_KEY`, `LLM_MODEL`, and optional `LLM_BASE_URL` are required for auto approval; absent or failed model configuration transfers claims to manual review; `GAMEOPS_EXECUTION_DB_PATH` persists AI provenance; and the business tool stays dry-run until a real adapter exists.**

- [ ] **Step 4: Run `npm --prefix ap-web test -- GameOpsPage.test.tsx && npm --prefix ap-web run build`; expect exit code 0.**

- [ ] **Step 5: Commit:** `git diff --check && git add docs/local-docker-deploy.md tests/server/test_gameops_execution_route.py && git commit -m "docs: explain AI approval deployment"`.

## Plan Review

- Spec coverage: Tasks 1-4 implement contracts, policy gates, fail-closed model handling, audit persistence, and protected API access. Task 5 supplies the required visible `AI 自动审批` trace and separate human route. Task 6 verifies execution safety and deployment configuration.
- Placeholder scan: all validation, model, and execution failures transfer to manual review.
- Type consistency: Task 1 names every approval type used in Tasks 2-5, and `ai_approve` is added on both backend and frontend sides.
