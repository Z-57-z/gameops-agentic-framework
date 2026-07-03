import { authenticatedFetch } from "./identity";

export type GameOpsMode = "knowledge" | "campaign" | "tickets" | "incident";
export type GameOpsWorkflow =
  | "knowledge_qa"
  | "campaign_ops"
  | "ticket_triage"
  | "incident_runbook";
export type GameOpsRiskLevel = "low" | "medium" | "high" | "critical";

export interface GameOpsAskRequest {
  question: string;
  mode?: GameOpsMode;
}

export interface CampaignDraftRequest {
  campaignName: string;
  audience: string;
  rewardRules: string;
  eligibility: string;
  startTime?: string;
  endTime?: string;
  rollbackPlan?: string;
  supportNotes?: string;
}

export interface TicketTriageRequest {
  ticketText: string;
  playerId?: string;
  serverId?: string;
  accountId?: string;
  orderId?: string;
  eventId?: string;
  timestamp?: string;
}

export interface IncidentRunbookRequest {
  incidentSummary: string;
  affectedServices: string;
  impact: string;
  durationMinutes?: number;
  detectedAt?: string;
  proposedCompensation?: string;
}

interface GameOpsSourceWire {
  source_id: string;
  title: string;
  section: string;
  path: string;
  chunk_id: string;
  line_start?: number | null;
  line_end?: number | null;
}

export interface GameOpsSource {
  sourceId: string;
  title: string;
  section: string;
  path: string;
  chunkId: string;
  lineStart: number | null;
  lineEnd: number | null;
}

interface GameOpsAuditWire {
  retrieved_chunk_ids: string[];
  validation_notes: string[];
}

export interface GameOpsAudit {
  retrievedChunkIds: string[];
  validationNotes: string[];
}

interface GameOpsAskResponseWire {
  answer: string;
  workflow: GameOpsWorkflow;
  risk_level: GameOpsRiskLevel;
  sources: GameOpsSourceWire[];
  next_actions: string[];
  missing_information: string[];
  confidence: number;
  audit: GameOpsAuditWire;
}

export interface GameOpsAskResponse {
  answer: string;
  workflow: GameOpsWorkflow;
  riskLevel: GameOpsRiskLevel;
  sources: GameOpsSource[];
  nextActions: string[];
  missingInformation: string[];
  confidence: number;
  audit: GameOpsAudit;
}

type CampaignLaunchCheckStatus = "pass" | "warning" | "blocker";

interface CampaignLaunchCheckWire {
  label: string;
  status: CampaignLaunchCheckStatus;
  detail: string;
}

export interface CampaignLaunchCheck {
  label: string;
  status: CampaignLaunchCheckStatus;
  detail: string;
}

interface CampaignDraftResponseWire {
  workflow: "campaign_ops";
  announcement_title: string;
  announcement_body: string;
  support_faq: string[];
  launch_checks: CampaignLaunchCheckWire[];
  risk_level: GameOpsRiskLevel;
  sources: GameOpsSourceWire[];
  next_actions: string[];
  execution_tasks: ExecutionTaskWire[];
  missing_information: string[];
  audit: GameOpsAuditWire;
}

export interface CampaignDraftResponse {
  workflow: "campaign_ops";
  announcementTitle: string;
  announcementBody: string;
  supportFaq: string[];
  launchChecks: CampaignLaunchCheck[];
  riskLevel: GameOpsRiskLevel;
  sources: GameOpsSource[];
  nextActions: string[];
  executionTasks: ExecutionTask[];
  missingInformation: string[];
  audit: GameOpsAudit;
}

export type TicketPriority = "low" | "medium" | "high" | "urgent";

interface TicketTriageResponseWire {
  workflow: "ticket_triage";
  category: string;
  priority: TicketPriority;
  escalation_path: string;
  suggested_reply: string;
  risk_level: GameOpsRiskLevel;
  sources: GameOpsSourceWire[];
  next_actions: string[];
  execution_tasks: ExecutionTaskWire[];
  missing_information: string[];
  audit: GameOpsAuditWire;
}

export interface TicketTriageResponse {
  workflow: "ticket_triage";
  category: string;
  priority: TicketPriority;
  escalationPath: string;
  suggestedReply: string;
  riskLevel: GameOpsRiskLevel;
  sources: GameOpsSource[];
  nextActions: string[];
  executionTasks: ExecutionTask[];
  missingInformation: string[];
  audit: GameOpsAudit;
}

export type IncidentSeverity = "sev1" | "sev2" | "sev3";
export type ExecutionTaskStatus =
  | "pending"
  | "waiting_approval"
  | "in_progress"
  | "blocked"
  | "done";

interface ExecutionTaskWire {
  task_id: string;
  title: string;
  owner_role: string;
  status: ExecutionTaskStatus;
  due: string;
  approval_required: boolean;
  evidence_required: string[];
}

export interface ExecutionTask {
  taskId: string;
  title: string;
  ownerRole: string;
  status: ExecutionTaskStatus;
  due: string;
  approvalRequired: boolean;
  evidenceRequired: string[];
}

interface IncidentRunbookResponseWire {
  workflow: "incident_runbook";
  severity: IncidentSeverity;
  communication_cadence: string;
  escalation_path: string;
  compensation_guidance: string;
  risk_level: GameOpsRiskLevel;
  sources: GameOpsSourceWire[];
  next_actions: string[];
  execution_tasks: ExecutionTaskWire[];
  missing_information: string[];
  audit: GameOpsAuditWire;
}

export interface IncidentRunbookResponse {
  workflow: "incident_runbook";
  severity: IncidentSeverity;
  communicationCadence: string;
  escalationPath: string;
  compensationGuidance: string;
  riskLevel: GameOpsRiskLevel;
  sources: GameOpsSource[];
  nextActions: string[];
  executionTasks: ExecutionTask[];
  missingInformation: string[];
  audit: GameOpsAudit;
}

export async function askGameOps(request: GameOpsAskRequest): Promise<GameOpsAskResponse> {
  const res = await authenticatedFetch("/v1/gameops/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: request.question, mode: request.mode ?? "knowledge" }),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }
  return responseFromWire((await res.json()) as GameOpsAskResponseWire);
}

export async function draftCampaign(request: CampaignDraftRequest): Promise<CampaignDraftResponse> {
  const res = await authenticatedFetch("/v1/gameops/campaign/draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(campaignRequestToWire(request)),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }
  return campaignDraftFromWire((await res.json()) as CampaignDraftResponseWire);
}

export async function triageTicket(request: TicketTriageRequest): Promise<TicketTriageResponse> {
  const res = await authenticatedFetch("/v1/gameops/tickets/triage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ticketTriageRequestToWire(request)),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }
  return ticketTriageFromWire((await res.json()) as TicketTriageResponseWire);
}

export async function planIncident(
  request: IncidentRunbookRequest,
): Promise<IncidentRunbookResponse> {
  const res = await authenticatedFetch("/v1/gameops/incidents/runbook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(incidentRunbookRequestToWire(request)),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }
  return incidentRunbookFromWire((await res.json()) as IncidentRunbookResponseWire);
}

function responseFromWire(wire: GameOpsAskResponseWire): GameOpsAskResponse {
  return {
    answer: wire.answer,
    workflow: wire.workflow,
    riskLevel: wire.risk_level,
    sources: wire.sources.map(sourceFromWire),
    nextActions: wire.next_actions,
    missingInformation: wire.missing_information,
    confidence: wire.confidence,
    audit: {
      retrievedChunkIds: wire.audit.retrieved_chunk_ids,
      validationNotes: wire.audit.validation_notes,
    },
  };
}

function campaignDraftFromWire(wire: CampaignDraftResponseWire): CampaignDraftResponse {
  return {
    workflow: wire.workflow,
    announcementTitle: wire.announcement_title,
    announcementBody: wire.announcement_body,
    supportFaq: wire.support_faq,
    launchChecks: wire.launch_checks.map((check) => ({
      label: check.label,
      status: check.status,
      detail: check.detail,
    })),
    riskLevel: wire.risk_level,
    sources: wire.sources.map(sourceFromWire),
    nextActions: wire.next_actions,
    executionTasks: wire.execution_tasks.map(executionTaskFromWire),
    missingInformation: wire.missing_information,
    audit: {
      retrievedChunkIds: wire.audit.retrieved_chunk_ids,
      validationNotes: wire.audit.validation_notes,
    },
  };
}

function ticketTriageFromWire(wire: TicketTriageResponseWire): TicketTriageResponse {
  return {
    workflow: wire.workflow,
    category: wire.category,
    priority: wire.priority,
    escalationPath: wire.escalation_path,
    suggestedReply: wire.suggested_reply,
    riskLevel: wire.risk_level,
    sources: wire.sources.map(sourceFromWire),
    nextActions: wire.next_actions,
    executionTasks: wire.execution_tasks.map(executionTaskFromWire),
    missingInformation: wire.missing_information,
    audit: {
      retrievedChunkIds: wire.audit.retrieved_chunk_ids,
      validationNotes: wire.audit.validation_notes,
    },
  };
}

function incidentRunbookFromWire(wire: IncidentRunbookResponseWire): IncidentRunbookResponse {
  return {
    workflow: wire.workflow,
    severity: wire.severity,
    communicationCadence: wire.communication_cadence,
    escalationPath: wire.escalation_path,
    compensationGuidance: wire.compensation_guidance,
    riskLevel: wire.risk_level,
    sources: wire.sources.map(sourceFromWire),
    nextActions: wire.next_actions,
    executionTasks: wire.execution_tasks.map(executionTaskFromWire),
    missingInformation: wire.missing_information,
    audit: {
      retrievedChunkIds: wire.audit.retrieved_chunk_ids,
      validationNotes: wire.audit.validation_notes,
    },
  };
}

function campaignRequestToWire(request: CampaignDraftRequest) {
  return {
    campaign_name: request.campaignName,
    audience: request.audience,
    reward_rules: request.rewardRules,
    eligibility: request.eligibility,
    start_time: optionalString(request.startTime),
    end_time: optionalString(request.endTime),
    rollback_plan: optionalString(request.rollbackPlan),
    support_notes: optionalString(request.supportNotes),
  };
}

function ticketTriageRequestToWire(request: TicketTriageRequest) {
  return {
    ticket_text: request.ticketText,
    player_id: optionalString(request.playerId),
    server_id: optionalString(request.serverId),
    account_id: optionalString(request.accountId),
    order_id: optionalString(request.orderId),
    event_id: optionalString(request.eventId),
    timestamp: optionalString(request.timestamp),
  };
}

function incidentRunbookRequestToWire(request: IncidentRunbookRequest) {
  return {
    incident_summary: request.incidentSummary,
    affected_services: request.affectedServices,
    impact: request.impact,
    duration_minutes: request.durationMinutes,
    detected_at: optionalString(request.detectedAt),
    proposed_compensation: optionalString(request.proposedCompensation),
  };
}

function optionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function sourceFromWire(wire: GameOpsSourceWire): GameOpsSource {
  return {
    sourceId: wire.source_id,
    title: wire.title,
    section: wire.section,
    path: wire.path,
    chunkId: wire.chunk_id,
    lineStart: wire.line_start ?? null,
    lineEnd: wire.line_end ?? null,
  };
}

function executionTaskFromWire(wire: ExecutionTaskWire): ExecutionTask {
  return {
    taskId: wire.task_id,
    title: wire.title,
    ownerRole: wire.owner_role,
    status: wire.status,
    due: wire.due,
    approvalRequired: wire.approval_required,
    evidenceRequired: wire.evidence_required,
  };
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: unknown; error?: { message?: string } };
    if (typeof body.error?.message === "string") return body.error.message;
    if (typeof body.detail === "string") return body.detail;
  } catch {
    // Keep status-line fallback for non-JSON failures.
  }
  return `${res.status} ${res.statusText}`;
}
