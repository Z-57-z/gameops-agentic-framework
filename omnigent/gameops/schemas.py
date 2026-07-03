"""Shared schemas for the first-party GameOps runtime."""

from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class GameOpsMode(str, Enum):
    """User-selectable business mode in the GameOps console."""

    KNOWLEDGE = "knowledge"
    CAMPAIGN = "campaign"
    TICKETS = "tickets"
    INCIDENT = "incident"


class WorkflowKind(str, Enum):
    """Internal workflow selected by the first-party router."""

    KNOWLEDGE_QA = "knowledge_qa"
    CAMPAIGN_OPS = "campaign_ops"
    TICKET_TRIAGE = "ticket_triage"
    INCIDENT_RUNBOOK = "incident_runbook"


class RiskLevel(str, Enum):
    """Ordered risk levels for GameOps actions."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class SourceRef(BaseModel):
    """User-visible source reference for a retrieved knowledge chunk."""

    source_id: str
    title: str
    section: str
    path: str
    chunk_id: str
    line_start: int | None = None
    line_end: int | None = None


class KnowledgeChunk(BaseModel):
    """A stable searchable section of a bundled GameOps document."""

    source_id: str
    title: str
    section: str
    path: str
    chunk_id: str
    text: str
    line_start: int
    line_end: int

    def to_source_ref(self) -> SourceRef:
        """Return the public source metadata for this chunk."""
        return SourceRef(
            source_id=self.source_id,
            title=self.title,
            section=self.section,
            path=self.path,
            chunk_id=self.chunk_id,
            line_start=self.line_start,
            line_end=self.line_end,
        )


class RetrievalResult(BaseModel):
    """A scored chunk returned by the lexical retriever."""

    chunk: KnowledgeChunk
    score: float
    matched_terms: list[str] = Field(default_factory=list)


class AuditTrail(BaseModel):
    """Compact audit payload for a GameOps answer."""

    retrieved_chunk_ids: list[str] = Field(default_factory=list)
    validation_notes: list[str] = Field(default_factory=list)


class GameOpsAskRequest(BaseModel):
    """Request body for the GameOps Knowledge Agent."""

    question: str = Field(min_length=1, max_length=4000)
    mode: GameOpsMode = GameOpsMode.KNOWLEDGE

    @field_validator("question")
    @classmethod
    def _strip_question(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("question must not be empty")
        return stripped


class GameOpsAskResponse(BaseModel):
    """Structured answer returned by the first-party GameOps agent."""

    answer: str
    workflow: WorkflowKind
    risk_level: RiskLevel
    sources: list[SourceRef] = Field(default_factory=list)
    next_actions: list[str] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)
    audit: AuditTrail


class CampaignDraftRequest(BaseModel):
    """Request body for LiveOps campaign draft and launch review."""

    campaign_name: str = Field(min_length=1, max_length=200)
    audience: str = Field(min_length=1, max_length=500)
    reward_rules: str = Field(min_length=1, max_length=2000)
    eligibility: str = Field(min_length=1, max_length=2000)
    start_time: str | None = Field(default=None, max_length=200)
    end_time: str | None = Field(default=None, max_length=200)
    rollback_plan: str | None = Field(default=None, max_length=2000)
    support_notes: str | None = Field(default=None, max_length=2000)

    @field_validator("campaign_name", "audience", "reward_rules", "eligibility")
    @classmethod
    def _strip_required_text(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("field must not be empty")
        return stripped

    @field_validator("start_time", "end_time", "rollback_plan", "support_notes")
    @classmethod
    def _strip_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None


class CampaignLaunchCheck(BaseModel):
    """A campaign launch readiness check produced by the agent."""

    label: str
    status: str = Field(pattern="^(pass|warning|blocker)$")
    detail: str


class CampaignDraftResponse(BaseModel):
    """Structured LiveOps campaign draft and review output."""

    workflow: WorkflowKind = WorkflowKind.CAMPAIGN_OPS
    announcement_title: str
    announcement_body: str
    support_faq: list[str] = Field(default_factory=list)
    launch_checks: list[CampaignLaunchCheck] = Field(default_factory=list)
    risk_level: RiskLevel
    sources: list[SourceRef] = Field(default_factory=list)
    next_actions: list[str] = Field(default_factory=list)
    execution_tasks: list[ExecutionTask] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list)
    audit: AuditTrail


class TicketTriageRequest(BaseModel):
    """Request body for Player Support ticket triage."""

    ticket_text: str = Field(min_length=1, max_length=4000)
    player_id: str | None = Field(default=None, max_length=200)
    server_id: str | None = Field(default=None, max_length=200)
    account_id: str | None = Field(default=None, max_length=200)
    order_id: str | None = Field(default=None, max_length=200)
    event_id: str | None = Field(default=None, max_length=200)
    timestamp: str | None = Field(default=None, max_length=200)

    @field_validator("ticket_text")
    @classmethod
    def _strip_ticket_text(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("ticket_text must not be empty")
        return stripped

    @field_validator("player_id", "server_id", "account_id", "order_id", "event_id", "timestamp")
    @classmethod
    def _strip_optional_ticket_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None


TicketPriority = Literal["low", "medium", "high", "urgent"]
IncidentSeverity = Literal["sev1", "sev2", "sev3"]
ExecutionTaskStatus = Literal["pending", "waiting_approval", "in_progress", "blocked", "done"]


class ExecutionTask(BaseModel):
    """A concrete follow-up task produced by a GameOps workflow."""

    task_id: str
    title: str
    owner_role: str
    status: ExecutionTaskStatus
    due: str
    approval_required: bool = False
    evidence_required: list[str] = Field(default_factory=list)


class TicketTriageResponse(BaseModel):
    """Structured support ticket triage output."""

    workflow: WorkflowKind = WorkflowKind.TICKET_TRIAGE
    category: str
    priority: TicketPriority
    escalation_path: str
    suggested_reply: str
    risk_level: RiskLevel
    sources: list[SourceRef] = Field(default_factory=list)
    next_actions: list[str] = Field(default_factory=list)
    execution_tasks: list[ExecutionTask] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list)
    audit: AuditTrail


class IncidentRunbookRequest(BaseModel):
    """Request body for live incident runbook planning."""

    incident_summary: str = Field(min_length=1, max_length=4000)
    affected_services: str = Field(min_length=1, max_length=1000)
    impact: str = Field(min_length=1, max_length=2000)
    duration_minutes: int | None = Field(default=None, ge=0, le=10080)
    detected_at: str | None = Field(default=None, max_length=200)
    proposed_compensation: str | None = Field(default=None, max_length=2000)

    @field_validator("incident_summary", "affected_services", "impact")
    @classmethod
    def _strip_required_text(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("field must not be empty")
        return stripped

    @field_validator("detected_at", "proposed_compensation")
    @classmethod
    def _strip_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None


class IncidentRunbookResponse(BaseModel):
    """Structured incident response guidance for GameOps operators."""

    workflow: WorkflowKind = WorkflowKind.INCIDENT_RUNBOOK
    severity: IncidentSeverity
    communication_cadence: str
    escalation_path: str
    compensation_guidance: str
    risk_level: RiskLevel
    sources: list[SourceRef] = Field(default_factory=list)
    next_actions: list[str] = Field(default_factory=list)
    execution_tasks: list[ExecutionTask] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list)
    audit: AuditTrail
