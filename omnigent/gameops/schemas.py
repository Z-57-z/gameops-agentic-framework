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
ExecutionDecision = Literal["approved", "rejected"]
ExecutionToolStatus = Literal["success", "blocked"]
ExecutionAction = Literal["approve", "run"]
ExecutionLoopPhase = Literal["precheck", "execute", "verify", "state_update"]
ExecutionLoopStepStatus = Literal["success", "blocked", "skipped"]
ExecutionPrecheckStatus = Literal["pass", "blocked"]
ExecutionRecoveryActionKind = Literal[
    "collect_evidence",
    "request_approval",
    "request_permission",
    "retry",
    "manual_handoff",
]
EnterpriseReadinessStatus = Literal["ready", "warning", "missing"]


class ExecutionTask(BaseModel):
    """A concrete follow-up task produced by a GameOps workflow."""

    task_id: str
    title: str
    owner_role: str
    status: ExecutionTaskStatus
    due: str
    approval_required: bool = False
    evidence_required: list[str] = Field(default_factory=list)
    approved_by: str | None = None
    approval_comment: str | None = None


class ExecutionApprovalRequest(BaseModel):
    """Approve or reject a workflow task before execution."""

    task: ExecutionTask
    approver: str = Field(min_length=1, max_length=200)
    decision: ExecutionDecision
    comment: str | None = Field(default=None, max_length=1000)

    @field_validator("approver")
    @classmethod
    def _strip_approver(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("approver must not be empty")
        return stripped

    @field_validator("comment")
    @classmethod
    def _strip_comment(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None


class ExecutionRunRequest(BaseModel):
    """Run a workflow task through the first-party GameOps tool layer."""

    task: ExecutionTask
    operator: str = Field(min_length=1, max_length=200)
    operator_role: str | None = Field(default=None, max_length=200)
    evidence: dict[str, str] = Field(default_factory=dict)

    @field_validator("operator")
    @classmethod
    def _strip_operator(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("operator must not be empty")
        return stripped

    @field_validator("operator_role")
    @classmethod
    def _strip_operator_role(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None


class ExecutionToolResult(BaseModel):
    """Result returned by a safe built-in GameOps tool adapter."""

    tool_name: str
    status: ExecutionToolStatus
    summary: str
    evidence: dict[str, str] = Field(default_factory=dict)
    receipt: ExecutionToolReceipt | None = None


class ExecutionToolReceipt(BaseModel):
    """Structured receipt returned by a first-party business tool adapter."""

    system: str
    operation: str
    reference_id: str
    dry_run: bool = True
    written_fields: list[str] = Field(default_factory=list)
    verification_notes: list[str] = Field(default_factory=list)


class ExecutionLoopStep(BaseModel):
    """One deterministic step in the first-party GameOps execution loop."""

    phase: ExecutionLoopPhase
    status: ExecutionLoopStepStatus
    summary: str


class ExecutionPrecheckItem(BaseModel):
    """One business gate evaluated before a GameOps task can run."""

    check_id: str
    label: str
    status: ExecutionPrecheckStatus
    detail: str


class ExecutionRecoveryAction(BaseModel):
    """Suggested next action when the execution loop cannot complete."""

    action_id: str
    kind: ExecutionRecoveryActionKind
    label: str
    description: str


class ExecutionActionResponse(BaseModel):
    """Task state, tool result, and audit output after an execution action."""

    task: ExecutionTask
    tool_result: ExecutionToolResult
    missing_evidence: list[str] = Field(default_factory=list)
    approval_required: bool = False
    precheck_items: list[ExecutionPrecheckItem] = Field(default_factory=list)
    loop_steps: list[ExecutionLoopStep] = Field(default_factory=list)
    recovery_actions: list[ExecutionRecoveryAction] = Field(default_factory=list)
    audit: AuditTrail


class ExecutionHistoryRecord(BaseModel):
    """A compact audit row for a GameOps execution action."""

    record_id: str
    created_at: str
    action: ExecutionAction
    actor: str
    task_id: str
    task_title: str
    tool_name: str
    status: ExecutionToolStatus
    summary: str
    evidence: dict[str, str] = Field(default_factory=dict)
    validation_notes: list[str] = Field(default_factory=list)


class ExecutionHistoryResponse(BaseModel):
    """Recent execution action history for the GameOps task console."""

    records: list[ExecutionHistoryRecord] = Field(default_factory=list)


class ExecutionTaskRegistrationRequest(BaseModel):
    """Register workflow-generated tasks with the execution runtime."""

    tasks: list[ExecutionTask] = Field(default_factory=list)


class ExecutionTaskListResponse(BaseModel):
    """Current persisted task state for the GameOps task console."""

    tasks: list[ExecutionTask] = Field(default_factory=list)


class ExecutionReportResponse(BaseModel):
    """Markdown handoff report generated from execution audit records."""

    generated_at: str
    record_count: int
    markdown: str


class ExecutionRetryPolicy(BaseModel):
    """Retry settings for a first-party GameOps tool."""

    max_attempts: int = Field(ge=1, le=5)
    backoff_seconds: int = Field(ge=0, le=3600)


class ExecutionPolicyRule(BaseModel):
    """A visible business guardrail for a GameOps execution task."""

    task_id: str
    title: str
    tool_name: str
    target_system: str
    operation: str
    required_role: str
    risk_level: RiskLevel
    retry_policy: ExecutionRetryPolicy
    failure_mode: ExecutionRecoveryActionKind
    approval_required: bool = False
    evidence_required: list[str] = Field(default_factory=list)
    guardrails: list[str] = Field(default_factory=list)


class ExecutionPolicyResponse(BaseModel):
    """Read-only execution rules used by the GameOps task console."""

    rules: list[ExecutionPolicyRule] = Field(default_factory=list)


class EnterpriseReadinessItem(BaseModel):
    """One production-readiness check for an enterprise GameOps rollout."""

    component: str
    status: EnterpriseReadinessStatus
    summary: str
    detail: str
    remediation: str | None = None


class EnterpriseReadinessResponse(BaseModel):
    """Aggregated readiness view for operating GameOps in enterprise environments."""

    overall_status: EnterpriseReadinessStatus
    integration_mode: str
    dry_run: bool
    tool_count: int
    items: list[EnterpriseReadinessItem] = Field(default_factory=list)


class ExecutionMetricsResponse(BaseModel):
    """Operational counters for monitoring the GameOps execution runtime."""

    total_actions: int
    successful_actions: int
    blocked_actions: int
    task_status_counts: dict[str, int] = Field(default_factory=dict)
    storage_backend: str
    dry_run: bool


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
