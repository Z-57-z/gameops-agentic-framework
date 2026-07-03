"""FastAPI routes for the first-party GameOps business agent."""

from __future__ import annotations

from fastapi import APIRouter

from omnigent.gameops.agent_loop import GameOpsAgentLoop, create_default_gameops_agent
from omnigent.gameops.campaign_agent import GameOpsCampaignAgent, create_default_campaign_agent
from omnigent.gameops.incident_agent import GameOpsIncidentAgent, create_default_incident_agent
from omnigent.gameops.schemas import (
    CampaignDraftRequest,
    CampaignDraftResponse,
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


def create_gameops_router(
    agent: GameOpsAgentLoop | None = None,
    campaign_agent: GameOpsCampaignAgent | None = None,
    ticket_triage_agent: GameOpsTicketTriageAgent | None = None,
    incident_agent: GameOpsIncidentAgent | None = None,
) -> APIRouter:
    """Build routes mounted under `/v1` for GameOps business workflows."""
    router = APIRouter()
    gameops_agent = agent or create_default_gameops_agent()
    gameops_campaign_agent = campaign_agent or create_default_campaign_agent()
    gameops_ticket_triage_agent = ticket_triage_agent or create_default_ticket_triage_agent()
    gameops_incident_agent = incident_agent or create_default_incident_agent()

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

    @router.post("/gameops/incidents/runbook")
    async def plan_incident(request: IncidentRunbookRequest) -> IncidentRunbookResponse:
        """Prepare an incident runbook through the first-party runtime."""
        return await gameops_incident_agent.plan(request)

    return router
