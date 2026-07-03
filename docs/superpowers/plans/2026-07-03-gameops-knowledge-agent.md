# GameOps Knowledge Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first first-party GameOps business agent slice: source-backed Knowledge Q&A with workflow routing, evidence, risk flags, missing-info detection, a FastAPI endpoint, and a GameOps-first UI.

**Architecture:** Add a bounded `omnigent.gameops` runtime that owns routing, retrieval, answer assembly, validation, and response schemas. The business path calls only this runtime and an injectable LLM model client; it must not delegate to Codex Agent, Claude Code, Cursor Agent, or any other external agent product.

**Tech Stack:** Python 3.12, FastAPI, Pydantic v2, pytest, React 18, TypeScript, Vite, Vitest, TanStack Query, lucide-react.

---

## Product Rules

- The GameOps business runtime must not import or call `omnigent.codex_native*`, `omnigent.claude_native*`, `omnigent.cursor_native*`, native harness executors, `/v1/sessions`, or built-in agent creation paths.
- The runtime may call an injectable `LLMClient` interface. Tests use a fake client. The first implementation may produce deterministic answers without requiring a live model when no API client is configured.
- Every factual/policy answer must include source references from the demo knowledge base or explicitly mark missing information.
- Risk must be elevated for compensation, premium currency, account action, public announcement, campaign launch, and incidents.
- Phase 1 ships Knowledge Q&A. The UI must visibly reserve Campaign, Tickets, and Incident modes as business workflows so phases 2 and 3 are not forgotten.

## File Map

Backend runtime:

- Create `omnigent/gameops/__init__.py`: package exports and runtime factory.
- Create `omnigent/gameops/schemas.py`: Pydantic request/response models, source metadata, workflow/risk enums.
- Create `omnigent/gameops/knowledge_store.py`: load Markdown demo docs and split them into stable chunks.
- Create `omnigent/gameops/retriever.py`: deterministic lexical retriever over chunks.
- Create `omnigent/gameops/workflow_router.py`: first-party business workflow classifier.
- Create `omnigent/gameops/llm_client.py`: `LLMClient` protocol, deterministic fallback client, OpenAI-compatible adapter shell.
- Create `omnigent/gameops/agent_loop.py`: bounded single-pass business loop, source/risk/missing-info validation.
- Create `omnigent/gameops/data/event_rebate_policy.md`.
- Create `omnigent/gameops/data/compensation_policy.md`.
- Create `omnigent/gameops/data/support_faq.md`.
- Create `omnigent/gameops/data/incident_runbook.md`.
- Create `omnigent/gameops/data/campaign_checklist.md`.

Backend API:

- Create `omnigent/server/routes/gameops.py`: `POST /gameops/ask` router factory.
- Modify `omnigent/server/app.py`: include the route under prefix `/v1` before the SPA mount.
- Modify `pyproject.toml`: include `omnigent.gameops` Markdown data as package data.

Backend tests:

- Create `tests/gameops/__init__.py`.
- Create `tests/gameops/test_knowledge_store.py`.
- Create `tests/gameops/test_retriever.py`.
- Create `tests/gameops/test_workflow_router.py`.
- Create `tests/gameops/test_agent_loop.py`.
- Create `tests/server/test_gameops_route.py`.

Frontend:

- Create `ap-web/src/lib/gameopsApi.ts`: typed client for `/v1/gameops/ask`.
- Create `ap-web/src/pages/GameOpsPage.tsx`: GameOps console surface with business modes and structured answer cards.
- Create `ap-web/src/pages/GameOpsPage.test.tsx`: endpoint/client rendering tests.
- Modify `ap-web/src/App.tsx`: make `/` render `GameOpsPage`, keep legacy session chat at `/chat` and `/c/:conversationId`.
- Modify `ap-web/src/shell/Sidebar.tsx`: rename primary action to `GameOps Agent`, add an advanced `Sessions` link to `/chat` if needed.

Docs:

- Modify `README.md`: add local demo walkthrough for `/v1/gameops/ask` and the GameOps UI.

---

### Task 1: Backend Schemas

**Files:**
- Create: `omnigent/gameops/__init__.py`
- Create: `omnigent/gameops/schemas.py`
- Test: `tests/gameops/test_agent_loop.py`

- [ ] **Step 1: Write the failing schema behavior test**

Add this focused assertion to `tests/gameops/test_agent_loop.py` first:

```python
from omnigent.gameops.schemas import GameOpsAskRequest, GameOpsMode, RiskLevel


def test_request_defaults_to_knowledge_mode() -> None:
    request = GameOpsAskRequest(question="Can support promise a rebate replacement?")

    assert request.mode == GameOpsMode.KNOWLEDGE
    assert request.question == "Can support promise a rebate replacement?"


def test_risk_levels_are_ordered_for_ui_display() -> None:
    assert [level.value for level in RiskLevel] == ["low", "medium", "high", "critical"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/gameops/test_agent_loop.py -q`
Expected: import failure for `omnigent.gameops`.

- [ ] **Step 3: Implement schemas**

Create `omnigent/gameops/__init__.py`:

```python
"""First-party GameOps business agent runtime."""

from omnigent.gameops.agent_loop import GameOpsAgentLoop, create_default_gameops_agent
from omnigent.gameops.schemas import GameOpsAskRequest, GameOpsAskResponse

__all__ = ["GameOpsAgentLoop", "GameOpsAskRequest", "GameOpsAskResponse", "create_default_gameops_agent"]
```

Create `omnigent/gameops/schemas.py` with enums `GameOpsMode`, `WorkflowKind`, `RiskLevel`, models `SourceRef`, `KnowledgeChunk`, `RetrievalResult`, `GameOpsAskRequest`, `GameOpsAskResponse`, and `AuditTrail`. Required response fields: `answer`, `workflow`, `risk_level`, `sources`, `next_actions`, `missing_information`, `confidence`, `audit`.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/gameops/test_agent_loop.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add omnigent/gameops tests/gameops && git commit -m "feat: add gameops response schemas"`

---

### Task 2: Demo Knowledge Store

**Files:**
- Create: `omnigent/gameops/data/*.md`
- Create: `omnigent/gameops/knowledge_store.py`
- Modify: `pyproject.toml`
- Test: `tests/gameops/test_knowledge_store.py`

- [ ] **Step 1: Write failing loader tests**

```python
from omnigent.gameops.knowledge_store import load_default_knowledge_base


def test_loads_demo_gameops_documents_with_stable_source_metadata() -> None:
    store = load_default_knowledge_base()

    chunks = store.chunks()

    assert len(chunks) >= 5
    assert {chunk.source_id for chunk in chunks} >= {
        "event_rebate_policy",
        "compensation_policy",
        "support_faq",
        "incident_runbook",
        "campaign_checklist",
    }
    assert all(chunk.title for chunk in chunks)
    assert all(chunk.path.startswith("omnigent/gameops/data/") for chunk in chunks)


def test_compensation_policy_mentions_approval_limits() -> None:
    store = load_default_knowledge_base()

    text = "\n".join(chunk.text for chunk in store.chunks() if chunk.source_id == "compensation_policy")

    assert "Premium currency compensation above 500 gems requires ops lead approval" in text
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/gameops/test_knowledge_store.py -q`
Expected: import failure for `knowledge_store`.

- [ ] **Step 3: Add data docs and loader**

Implement five Markdown files with headings and concrete rules. Implement `KnowledgeStore.chunks()` and `load_default_knowledge_base()` using `importlib.resources.files("omnigent.gameops.data")`, splitting by level-2 headings. Add package data:

```toml
"omnigent.gameops" = ["data/*.md"]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/gameops/test_knowledge_store.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add pyproject.toml omnigent/gameops tests/gameops/test_knowledge_store.py && git commit -m "feat: add gameops knowledge base"`

---

### Task 3: Retriever and Workflow Router

**Files:**
- Create: `omnigent/gameops/retriever.py`
- Create: `omnigent/gameops/workflow_router.py`
- Test: `tests/gameops/test_retriever.py`
- Test: `tests/gameops/test_workflow_router.py`

- [ ] **Step 1: Write failing retriever tests**

```python
from omnigent.gameops.knowledge_store import load_default_knowledge_base
from omnigent.gameops.retriever import LexicalRetriever


def test_retriever_finds_rebate_policy_for_missed_recharge_reward() -> None:
    retriever = LexicalRetriever(load_default_knowledge_base())

    results = retriever.search("A player missed the recharge rebate reward. What can support promise?", limit=3)

    assert results[0].chunk.source_id == "event_rebate_policy"
    assert results[0].score > 0


def test_retriever_returns_no_results_for_uncovered_topic() -> None:
    retriever = LexicalRetriever(load_default_knowledge_base())

    results = retriever.search("How do we configure a guild housing auction tax?", limit=3)

    assert results == []
```

- [ ] **Step 2: Write failing router tests**

```python
from omnigent.gameops.schemas import WorkflowKind
from omnigent.gameops.workflow_router import route_workflow


def test_routes_campaign_launch_questions_to_campaign_ops() -> None:
    assert route_workflow("Draft weekend event announcement and check launch setup") == WorkflowKind.CAMPAIGN_OPS


def test_routes_payment_ticket_to_ticket_triage() -> None:
    assert route_workflow("Player ticket: payment succeeded but rewards missing") == WorkflowKind.TICKET_TRIAGE


def test_routes_incident_to_incident_runbook() -> None:
    assert route_workflow("30 minute login outage, what escalation cadence should ops use?") == WorkflowKind.INCIDENT_RUNBOOK


def test_defaults_to_knowledge_qa() -> None:
    assert route_workflow("Can support promise a rebate replacement?") == WorkflowKind.KNOWLEDGE_QA
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `python -m pytest tests/gameops/test_retriever.py tests/gameops/test_workflow_router.py -q`
Expected: import failures.

- [ ] **Step 4: Implement retriever/router**

`LexicalRetriever.search()` lowercases, tokenizes alphanumeric terms, removes short stop words, scores chunks by term overlap plus title/source boosts, and filters zero-score chunks. `route_workflow()` uses explicit keyword sets for campaign, ticket, incident, else knowledge.

- [ ] **Step 5: Run tests to verify they pass**

Run: `python -m pytest tests/gameops/test_retriever.py tests/gameops/test_workflow_router.py -q`
Expected: PASS.

- [ ] **Step 6: Commit**

Run: `git add omnigent/gameops tests/gameops && git commit -m "feat: route and retrieve gameops knowledge"`

---

### Task 4: First-Party Agent Loop

**Files:**
- Create: `omnigent/gameops/llm_client.py`
- Create: `omnigent/gameops/agent_loop.py`
- Test: `tests/gameops/test_agent_loop.py`

- [ ] **Step 1: Write failing loop tests**

```python
import pytest

from omnigent.gameops.agent_loop import create_default_gameops_agent
from omnigent.gameops.schemas import GameOpsAskRequest, RiskLevel, WorkflowKind


@pytest.mark.asyncio
async def test_agent_answers_with_sources_and_actions() -> None:
    agent = create_default_gameops_agent()

    response = await agent.ask(
        GameOpsAskRequest(question="A player missed the recharge rebate reward. What can support promise?")
    )

    assert response.workflow == WorkflowKind.KNOWLEDGE_QA
    assert response.sources
    assert response.sources[0].source_id == "event_rebate_policy"
    assert response.answer
    assert response.next_actions
    assert response.confidence > 0


@pytest.mark.asyncio
async def test_agent_flags_high_risk_compensation_request() -> None:
    agent = create_default_gameops_agent()

    response = await agent.ask(
        GameOpsAskRequest(question="Can we compensate all players with premium currency after a 30 minute login issue?")
    )

    assert response.risk_level in {RiskLevel.HIGH, RiskLevel.CRITICAL}
    assert any("approval" in action.lower() for action in response.next_actions)
    assert response.sources


@pytest.mark.asyncio
async def test_agent_marks_missing_information_when_sources_are_empty() -> None:
    agent = create_default_gameops_agent()

    response = await agent.ask(GameOpsAskRequest(question="How should guild housing auction tax be tuned?"))

    assert response.sources == []
    assert response.missing_information
    assert response.confidence == 0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/gameops/test_agent_loop.py -q`
Expected: import failure for `agent_loop` or failed assertions.

- [ ] **Step 3: Implement bounded loop**

Implement `LLMClient` protocol with `async complete(prompt: str) -> str`. Implement `DeterministicGameOpsLLMClient` that summarizes evidence into stable demo answers. Implement `GameOpsAgentLoop.ask()`:

1. Strip and validate question.
2. Route workflow.
3. Retrieve top chunks.
4. Determine risk from workflow and keywords.
5. If no chunks, return an answer that says coverage is missing with `confidence=0`.
6. Otherwise assemble an answer, source refs, next actions, missing information, and audit trail.
7. Validate that all returned source ids come from retrieved chunks.

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/gameops/test_agent_loop.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add omnigent/gameops tests/gameops/test_agent_loop.py && git commit -m "feat: add first-party gameops agent loop"`

---

### Task 5: FastAPI Route

**Files:**
- Create: `omnigent/server/routes/gameops.py`
- Modify: `omnigent/server/app.py`
- Test: `tests/server/test_gameops_route.py`

- [ ] **Step 1: Write failing route tests**

```python
from fastapi.testclient import TestClient

from omnigent.server.app import create_app


def test_gameops_ask_endpoint_returns_structured_answer() -> None:
    app = create_app()
    client = TestClient(app)

    response = client.post(
        "/v1/gameops/ask",
        json={"question": "What should ops check before launching a weekend event?"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["workflow"] in {"knowledge_qa", "campaign_ops"}
    assert body["answer"]
    assert body["sources"]
    assert body["risk_level"] in {"low", "medium", "high", "critical"}


def test_gameops_ask_endpoint_rejects_empty_question() -> None:
    app = create_app()
    client = TestClient(app)

    response = client.post("/v1/gameops/ask", json={"question": "   "})

    assert response.status_code == 422
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/server/test_gameops_route.py -q`
Expected: 404 for `/v1/gameops/ask`.

- [ ] **Step 3: Implement route and app wiring**

Create `create_gameops_router(agent: GameOpsAgentLoop | None = None) -> APIRouter`. Mount it in `create_app()` before optional extra routers and before SPA static mount:

```python
from omnigent.server.routes.gameops import create_gameops_router

app.include_router(create_gameops_router(), prefix="/v1", tags=["gameops"])
```

- [ ] **Step 4: Run route test**

Run: `python -m pytest tests/server/test_gameops_route.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add omnigent/server/routes/gameops.py omnigent/server/app.py tests/server/test_gameops_route.py && git commit -m "feat: expose gameops ask endpoint"`

---

### Task 6: Frontend API Client

**Files:**
- Create: `ap-web/src/lib/gameopsApi.ts`
- Test: `ap-web/src/lib/gameopsApi.test.ts`

- [ ] **Step 1: Write failing client test**

```typescript
import { describe, expect, it, vi } from "vitest";
import { askGameOps } from "./gameopsApi";

vi.mock("./identity", () => ({
  authenticatedFetch: vi.fn(async () =>
    new Response(
      JSON.stringify({
        answer: "Check launch readiness.",
        workflow: "campaign_ops",
        risk_level: "medium",
        sources: [{ source_id: "campaign_checklist", title: "Campaign Checklist", section: "Launch readiness", path: "omnigent/gameops/data/campaign_checklist.md", chunk_id: "campaign_checklist#launch-readiness" }],
        next_actions: ["Confirm start and end time"],
        missing_information: [],
        confidence: 0.82,
        audit: { retrieved_chunk_ids: ["campaign_checklist#launch-readiness"], validation_notes: ["sources checked"] },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  ),
}));

describe("askGameOps", () => {
  it("converts a structured GameOps response", async () => {
    const result = await askGameOps({ question: "Check launch setup", mode: "campaign" });

    expect(result.workflow).toBe("campaign_ops");
    expect(result.riskLevel).toBe("medium");
    expect(result.sources[0]?.sourceId).toBe("campaign_checklist");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ap-web; npm run test -- gameopsApi.test.ts`
Expected: import failure for `gameopsApi`.

- [ ] **Step 3: Implement client**

Create `askGameOps()` using `authenticatedFetch("/v1/gameops/ask", { method: "POST", headers, body })`. Convert snake_case wire keys to camelCase: `risk_level -> riskLevel`, `source_id -> sourceId`, `missing_information -> missingInformation`, `retrieved_chunk_ids -> retrievedChunkIds`, `validation_notes -> validationNotes`.

- [ ] **Step 4: Run test**

Run: `cd ap-web; npm run test -- gameopsApi.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add ap-web/src/lib/gameopsApi.ts ap-web/src/lib/gameopsApi.test.ts && git commit -m "feat: add gameops api client"`

---

### Task 7: GameOps Console UI

**Files:**
- Create: `ap-web/src/pages/GameOpsPage.tsx`
- Create: `ap-web/src/pages/GameOpsPage.test.tsx`
- Modify: `ap-web/src/App.tsx`
- Modify: `ap-web/src/shell/Sidebar.tsx`

- [ ] **Step 1: Write failing UI tests**

```typescript
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GameOpsPage } from "./GameOpsPage";

vi.mock("@/lib/gameopsApi", () => ({
  askGameOps: vi.fn(async () => ({
    answer: "Support may verify eligibility and avoid promising unsupported rewards.",
    workflow: "knowledge_qa",
    riskLevel: "medium",
    sources: [{ sourceId: "event_rebate_policy", title: "Event Rebate Policy", section: "Missed rewards", path: "omnigent/gameops/data/event_rebate_policy.md", chunkId: "event_rebate_policy#missed-rewards" }],
    nextActions: ["Verify event eligibility", "Escalate exceptions to ops lead"],
    missingInformation: [],
    confidence: 0.84,
    audit: { retrievedChunkIds: ["event_rebate_policy#missed-rewards"], validationNotes: ["sources checked"] },
  })),
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <GameOpsPage />
    </QueryClientProvider>,
  );
}

describe("GameOpsPage", () => {
  it("presents GameOps Agent as the first screen", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "GameOps Agent" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Knowledge" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Campaign" })).toBeInTheDocument();
    expect(screen.queryByText("Codex")).not.toBeInTheDocument();
    expect(screen.queryByText("Claude")).not.toBeInTheDocument();
  });

  it("submits a business question and renders structured answer sections", async () => {
    renderPage();

    await userEvent.type(screen.getByLabelText("GameOps question"), "A player missed the recharge rebate reward.");
    await userEvent.click(screen.getByRole("button", { name: "Ask GameOps Agent" }));

    expect(await screen.findByText(/Support may verify eligibility/)).toBeInTheDocument();
    expect(screen.getByText("Sources")).toBeInTheDocument();
    expect(screen.getByText("Next actions")).toBeInTheDocument();
    expect(screen.getByText("Risk: medium")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run UI test to verify it fails**

Run: `cd ap-web; npm run test -- GameOpsPage.test.tsx`
Expected: import failure for `GameOpsPage`.

- [ ] **Step 3: Implement page and route**

Create a focused operations console:

- Header: `GameOps Agent` and compact status text `First-party runtime`.
- Mode tabs: `Knowledge`, `Campaign`, `Tickets`, `Incident`.
- Business example buttons: rebate support, compensation after outage, weekend event checklist.
- Textarea with aria-label `GameOps question`.
- Submit button with lucide icon and label `Ask GameOps Agent`.
- Result sections: answer, risk badge, sources, next actions, missing information, audit.

Modify `App.tsx` root route to render `GameOpsPage`. Keep legacy chat at `/chat` plus `/c/:conversationId` for admin/developer continuity.

Modify `Sidebar.tsx` brand/button copy so root action reads `GameOps Agent`; add a smaller advanced link `Sessions` to `/chat` if preserving the old empty chat page is useful.

- [ ] **Step 4: Run UI test**

Run: `cd ap-web; npm run test -- GameOpsPage.test.tsx gameopsApi.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add ap-web/src/pages/GameOpsPage.tsx ap-web/src/pages/GameOpsPage.test.tsx ap-web/src/App.tsx ap-web/src/shell/Sidebar.tsx && git commit -m "feat: make gameops agent the primary UI"`

---

### Task 8: Docs and Verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add README demo walkthrough**

Add a section `GameOps Agent demo` with:

```bash
curl -s http://localhost:8080/v1/gameops/ask \
  -H 'Content-Type: application/json' \
  -d '{"question":"A player missed the recharge rebate reward. What can support promise?"}'
```

Explain that the answer comes from the first-party `omnigent.gameops` runtime and cites bundled docs.

- [ ] **Step 2: Run backend focused tests**

Run: `python -m pytest tests/gameops tests/server/test_gameops_route.py -q`
Expected: PASS.

- [ ] **Step 3: Run frontend focused tests**

Run: `cd ap-web; npm run test -- gameopsApi.test.ts GameOpsPage.test.tsx`
Expected: PASS.

- [ ] **Step 4: Run type checks**

Run: `python -m mypy omnigent/gameops omnigent/server/routes/gameops.py`
Expected: PASS.

Run: `cd ap-web; npm run type-check`
Expected: PASS.

- [ ] **Step 5: Start local demo**

Run the existing project start flow, then verify:

```bash
curl http://localhost:8080/health
curl -s http://localhost:8080/v1/gameops/ask -H 'Content-Type: application/json' -d '{"question":"Can we compensate all players with premium currency after a 30 minute login issue?"}'
```

Expected: health OK and GameOps response with sources, high/critical risk, and approval next action.

- [ ] **Step 6: Commit docs**

Run: `git add README.md && git commit -m "docs: describe gameops agent demo"`

---

## Self-Review

Spec coverage:

- First-party runtime: Tasks 1-4.
- No external agent product calls: Product Rules plus Task 4 route/runtime boundaries.
- Demo knowledge base: Task 2.
- Workflow routing: Task 3.
- Source-backed structured answers: Tasks 1, 4, 5, 7.
- Business-first UI: Task 7.
- LiveOps Campaign and Player Support Triage not forgotten: Product Rules, Task 3 router, Task 7 mode tabs.

Placeholder scan:

- No `TBD`, `TODO`, `implement later`, or unspecified test steps.

Type consistency:

- Python wire fields are snake_case through Pydantic.
- TypeScript public client surface is camelCase.
- Workflow values are `knowledge_qa`, `campaign_ops`, `ticket_triage`, `incident_runbook`.
- Risk values are `low`, `medium`, `high`, `critical`.
