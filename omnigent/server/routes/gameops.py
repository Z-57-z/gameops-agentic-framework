"""FastAPI routes for the first-party GameOps business agent."""

from __future__ import annotations

import os

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status

from omnigent.gameops.agent_loop import GameOpsAgentLoop, create_default_gameops_agent
from omnigent.gameops.campaign_agent import GameOpsCampaignAgent, create_default_campaign_agent
from omnigent.gameops.compensation_approval import (
    CompensationApprovalEvaluator,
    create_default_compensation_approval_evaluator,
)
from omnigent.gameops.execution import GameOpsExecutionRuntime, create_default_execution_runtime
from omnigent.gameops.incident_agent import GameOpsIncidentAgent, create_default_incident_agent
from omnigent.gameops.schemas import (
    CampaignDraftRequest,
    CampaignDraftResponse,
    CompensationApprovalEvaluateRequest,
    CompensationApprovalEvaluateResponse,
    ExecutionActionResponse,
    ExecutionApprovalRequest,
    EnterpriseReadinessResponse,
    ExecutionHistoryResponse,
    ExecutionMetricsResponse,
    ExecutionPolicyResponse,
    ExecutionReportResponse,
    ExecutionRunRequest,
    ExecutionTaskListResponse,
    ExecutionTaskRegistrationRequest,
    GameOpsAskRequest,
    GameOpsAskResponse,
    IncidentRunbookRequest,
    IncidentRunbookResponse,
    TicketTriageRequest,
    TicketTriageResponse,
)
from omnigent.gameops.ticket_triage_agent import (
    GameOpsTicketTriageAgent,
    create_default_ticket_triage_agent,
)


_GAMEOPS_API_KEY_ENV = "GAMEOPS_API_KEY"


def require_gameops_api_key(
    x_gameops_api_key: str | None = Header(default=None),
) -> None:
    """Require an API key only when enterprise deployments configure one."""
    configured_key = os.getenv(_GAMEOPS_API_KEY_ENV)
    if not configured_key:
        return
    if x_gameops_api_key != configured_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid GameOps API key",
        )


def create_gameops_router(
    agent: GameOpsAgentLoop | None = None,
    campaign_agent: GameOpsCampaignAgent | None = None,
    ticket_triage_agent: GameOpsTicketTriageAgent | None = None,
    incident_agent: GameOpsIncidentAgent | None = None,
    execution_runtime: GameOpsExecutionRuntime | None = None,
    compensation_approval_evaluator: CompensationApprovalEvaluator | None = None,
) -> APIRouter:
    """Build routes mounted under `/v1` for GameOps business workflows."""
    router = APIRouter(dependencies=[Depends(require_gameops_api_key)])
    gameops_agent = agent or create_default_gameops_agent()
    gameops_campaign_agent = campaign_agent or create_default_campaign_agent()
    gameops_ticket_triage_agent = ticket_triage_agent or create_default_ticket_triage_agent()
    gameops_incident_agent = incident_agent or create_default_incident_agent()
    gameops_execution_runtime = execution_runtime or create_default_execution_runtime()
    gameops_compensation_approval_evaluator = (
        compensation_approval_evaluator or create_default_compensation_approval_evaluator()
    )

    @router.post("/gameops/ask")
    async def ask_gameops(request: GameOpsAskRequest) -> GameOpsAskResponse:
        """Answer a GameOps question through the first-party runtime."""
        return await gameops_agent.ask(request)

    @router.post("/gameops/campaign/draft")
    async def draft_campaign(request: CampaignDraftRequest) -> CampaignDraftResponse:
        """Draft and review a LiveOps campaign through the first-party runtime."""
        return await gameops_campaign_agent.draft(request)

    @router.post("/gameops/tickets/triage")
    async def triage_ticket(request: TicketTriageRequest) -> TicketTriageResponse:
        """Classify and prepare a player support ticket through the first-party runtime."""
        return await gameops_ticket_triage_agent.triage(request)

    @router.post("/gameops/tickets/approval/evaluate")
    async def evaluate_ticket_approval(
        request: CompensationApprovalEvaluateRequest,
    ) -> CompensationApprovalEvaluateResponse:
        """Evaluate verified missed-reward evidence for AI or human approval."""
        return await gameops_execution_runtime.evaluate_compensation_approval(
            request,
            gameops_compensation_approval_evaluator,
        )

    @router.post("/gameops/incidents/runbook")
    async def plan_incident(request: IncidentRunbookRequest) -> IncidentRunbookResponse:
        """Prepare an incident runbook through the first-party runtime."""
        return await gameops_incident_agent.plan(request)

    @router.post("/gameops/execution/tasks")
    async def register_execution_tasks(
        request: ExecutionTaskRegistrationRequest,
    ) -> ExecutionTaskListResponse:
        """Persist workflow-generated tasks and return current task state."""
        return gameops_execution_runtime.register_tasks(request)

    @router.get("/gameops/execution/tasks")
    async def list_execution_tasks() -> ExecutionTaskListResponse:
        """Return current persisted GameOps execution task state."""
        return gameops_execution_runtime.tasks()

    @router.post("/gameops/execution/approve")
    async def approve_execution_task(request: ExecutionApprovalRequest) -> ExecutionActionResponse:
        """Approve or reject a GameOps workflow task before execution."""
        return gameops_execution_runtime.approve(request)

    @router.post("/gameops/execution/run")
    async def run_execution_task(request: ExecutionRunRequest) -> ExecutionActionResponse:
        """Run a GameOps workflow task through the first-party tool layer."""
        return gameops_execution_runtime.run(request)

    @router.get("/gameops/execution/history")
    async def list_execution_history(
        limit: int = Query(default=20, ge=1, le=100),
    ) -> ExecutionHistoryResponse:
        """Return recent GameOps execution action records."""
        return gameops_execution_runtime.history(limit=limit)

    @router.get("/gameops/execution/report")
    async def get_execution_report(
        limit: int = Query(default=20, ge=1, le=100),
    ) -> ExecutionReportResponse:
        """Return a Markdown handoff report from recent execution audit records."""
        return gameops_execution_runtime.report(limit=limit)

    @router.get("/gameops/execution/policy")
    async def list_execution_policy() -> ExecutionPolicyResponse:
        """Return visible execution rules for the GameOps task console."""
        return gameops_execution_runtime.policy()

    @router.get("/gameops/enterprise/readiness")
    async def get_enterprise_readiness() -> EnterpriseReadinessResponse:
        """Return deployment and integration readiness for enterprise rollout."""
        return gameops_execution_runtime.readiness()

    @router.get("/gameops/monitoring/metrics")
    async def get_monitoring_metrics() -> ExecutionMetricsResponse:
        """Return GameOps execution counters for monitoring probes."""
        return gameops_execution_runtime.metrics()

    return router
