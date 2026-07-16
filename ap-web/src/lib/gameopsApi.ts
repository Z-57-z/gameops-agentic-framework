import { authenticatedFetch } from "./identity";

export type GameOpsMode = "knowledge" | "campaign" | "tickets" | "incident";
export type GameOpsWorkflow =
  | "knowledge_qa"
  | "campaign_ops"
  | "ticket_triage"
  | "incident_runbook";
export type GameOpsRiskLevel = "low" | "medium" | "high" | "critical";

export interface GameOpsModelSettings {
  provider: string | null;
  model: string | null;
  baseUrl: string | null;
  configured: boolean;
  keySuffix: string | null;
  source: "saved" | "environment" | "none";
  version: number;
}

export async function getGameOpsModelSettings(): Promise<GameOpsModelSettings> {
  const res = await authenticatedFetch("/v1/gameops/model-settings");
  if (!res.ok) throw new Error(await readErrorMessage(res));
  const value = (await res.json()) as Record<string, unknown>;
  return { provider: value.provider as string | null, model: value.model as string | null, baseUrl: value.base_url as string | null, configured: Boolean(value.configured), keySuffix: value.key_suffix as string | null, source: value.source as GameOpsModelSettings["source"], version: Number(value.version ?? 0) };
}

export async function saveGameOpsModelSettings(input: { provider: string; model: string; baseUrl?: string; apiKey: string }): Promise<GameOpsModelSettings> {
  const res = await authenticatedFetch("/v1/gameops/model-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: input.provider, model: input.model, base_url: input.baseUrl || null, api_key: input.apiKey }) });
  if (!res.ok) throw new Error(await readErrorMessage(res));
  const value = (await res.json()) as Record<string, unknown>;
  return { provider: value.provider as string | null, model: value.model as string | null, baseUrl: value.base_url as string | null, configured: Boolean(value.configured), keySuffix: value.key_suffix as string | null, source: value.source as GameOpsModelSettings["source"], version: Number(value.version ?? 0) };
}

export interface GameOpsModelConnectionTest {
  connected: boolean;
  message: string;
}

export async function testGameOpsModelSettings(input: {
  provider: string;
  model: string;
  baseUrl?: string;
  apiKey: string;
}): Promise<GameOpsModelConnectionTest> {
  const res = await authenticatedFetch("/v1/gameops/model-settings/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: input.provider,
      model: input.model,
      base_url: input.baseUrl || null,
      api_key: input.apiKey,
    }),
  });
  if (!res.ok) throw new Error(await readErrorMessage(res));
  return (await res.json()) as GameOpsModelConnectionTest;
}

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
export type ExecutionDecision = "approved" | "rejected";
export type ExecutionToolStatus = "success" | "blocked";
export type ExecutionAction = "approve" | "run";
export type ApprovalDecisionSource = "ai_auto" | "manual" | "rule_blocked" | "fallback";
export type ApprovalDecisionStatus = "auto_approved" | "manual_review";

export interface AiApprovalDecision {
  decisionId: string;
  decisionSource: ApprovalDecisionSource;
  decisionStatus: ApprovalDecisionStatus;
  riskLevel: GameOpsRiskLevel;
  riskScore: number;
  reason: string;
  evidenceUsed: string[];
  modelId: string | null;
  decidedAt: string;
}

export interface CompensationApprovalEvaluateRequest {
  task: ExecutionTask;
  category: string;
  player: { accountRiskStatus: "clear" | "flagged" | "unknown"; recentManualCompensationCount: number };
  verification: { paymentStatus: "paid" | "unpaid" | "unknown"; eventEligibility: "eligible" | "ineligible" | "unknown"; deliveryStatus: "failed" | "delivered" | "unknown" };
  rewardType: "consumable" | "premium_currency";
  rewardAmount: number;
  evidence: Record<string, string>;
}
export type ExecutionLoopPhase = "precheck" | "execute" | "verify" | "state_update";
export type ExecutionLoopStepStatus = "success" | "blocked" | "skipped";
export type ExecutionPrecheckStatus = "pass" | "blocked";
export type ExecutionRecoveryActionKind =
  | "collect_evidence"
  | "request_approval"
  | "request_permission"
  | "retry"
  | "manual_handoff";
export type EnterpriseReadinessStatus = "ready" | "warning" | "missing";

interface ExecutionTaskWire {
  task_id: string;
  title: string;
  owner_role: string;
  status: ExecutionTaskStatus;
  due: string;
  approval_required: boolean;
  evidence_required: string[];
  approved_by?: string | null;
  approval_comment?: string | null;
  approval_provenance?: { source: ApprovalDecisionSource; decision_id: string; summary: string; decided_at: string } | null;
}

export interface ExecutionTask {
  taskId: string;
  title: string;
  ownerRole: string;
  status: ExecutionTaskStatus;
  due: string;
  approvalRequired: boolean;
  evidenceRequired: string[];
  approvedBy?: string | null;
  approvalComment?: string | null;
  approvalProvenance?: { source: ApprovalDecisionSource; decisionId: string; summary: string; decidedAt: string } | null;
}

export interface ExecutionApprovalRequest {
  task: ExecutionTask;
  approver: string;
  decision: ExecutionDecision;
  comment?: string;
}

export interface ExecutionRunRequest {
  task: ExecutionTask;
  operator: string;
  operatorRole?: string;
  evidence: Record<string, string>;
}

interface ExecutionToolResultWire {
  tool_name: string;
  status: ExecutionToolStatus;
  summary: string;
  evidence: Record<string, string>;
  receipt?: ExecutionToolReceiptWire | null;
}

export interface ExecutionToolResult {
  toolName: string;
  status: ExecutionToolStatus;
  summary: string;
  evidence: Record<string, string>;
  receipt: ExecutionToolReceipt | null;
}

interface ExecutionToolReceiptWire {
  system: string;
  operation: string;
  reference_id: string;
  dry_run: boolean;
  written_fields: string[];
  verification_notes: string[];
}

export interface ExecutionToolReceipt {
  system: string;
  operation: string;
  referenceId: string;
  dryRun: boolean;
  writtenFields: string[];
  verificationNotes: string[];
}

interface ExecutionActionResponseWire {
  task: ExecutionTaskWire;
  tool_result: ExecutionToolResultWire;
  missing_evidence: string[];
  approval_required: boolean;
  precheck_items: ExecutionPrecheckItemWire[];
  loop_steps: ExecutionLoopStepWire[];
  recovery_actions: ExecutionRecoveryActionWire[];
  audit: GameOpsAuditWire;
}

interface ExecutionPrecheckItemWire {
  check_id: string;
  label: string;
  status: ExecutionPrecheckStatus;
  detail: string;
}

export interface ExecutionPrecheckItem {
  checkId: string;
  label: string;
  status: ExecutionPrecheckStatus;
  detail: string;
}

interface ExecutionLoopStepWire {
  phase: ExecutionLoopPhase;
  status: ExecutionLoopStepStatus;
  summary: string;
}

export interface ExecutionLoopStep {
  phase: ExecutionLoopPhase;
  status: ExecutionLoopStepStatus;
  summary: string;
}

interface ExecutionRecoveryActionWire {
  action_id: string;
  kind: ExecutionRecoveryActionKind;
  label: string;
  description: string;
}

export interface ExecutionRecoveryAction {
  actionId: string;
  kind: ExecutionRecoveryActionKind;
  label: string;
  description: string;
}

export interface ExecutionActionResponse {
  task: ExecutionTask;
  toolResult: ExecutionToolResult;
  missingEvidence: string[];
  approvalRequired: boolean;
  precheckItems: ExecutionPrecheckItem[];
  loopSteps: ExecutionLoopStep[];
  recoveryActions: ExecutionRecoveryAction[];
  audit: GameOpsAudit;
}

interface ExecutionHistoryRecordWire {
  record_id: string;
  created_at: string;
  action: ExecutionAction;
  actor: string;
  task_id: string;
  task_title: string;
  tool_name: string;
  status: ExecutionToolStatus;
  summary: string;
  evidence: Record<string, string>;
  validation_notes: string[];
}

export interface ExecutionHistoryRecord {
  recordId: string;
  createdAt: string;
  action: ExecutionAction;
  actor: string;
  taskId: string;
  taskTitle: string;
  toolName: string;
  status: ExecutionToolStatus;
  summary: string;
  evidence: Record<string, string>;
  validationNotes: string[];
}

interface ExecutionHistoryResponseWire {
  records: ExecutionHistoryRecordWire[];
}

export interface ExecutionHistoryResponse {
  records: ExecutionHistoryRecord[];
}

interface ExecutionTaskListResponseWire {
  tasks: ExecutionTaskWire[];
}

export interface ExecutionTaskListResponse {
  tasks: ExecutionTask[];
}

interface ExecutionReportResponseWire {
  generated_at: string;
  record_count: number;
  markdown: string;
}

export interface ExecutionReportResponse {
  generatedAt: string;
  recordCount: number;
  markdown: string;
}

interface ExecutionPolicyRuleWire {
  task_id: string;
  title: string;
  tool_name: string;
  target_system: string;
  operation: string;
  required_role: string;
  risk_level: GameOpsRiskLevel;
  retry_policy: ExecutionRetryPolicyWire;
  failure_mode: ExecutionRecoveryActionKind;
  approval_required: boolean;
  evidence_required: string[];
  guardrails: string[];
}

interface ExecutionRetryPolicyWire {
  max_attempts: number;
  backoff_seconds: number;
}

export interface ExecutionRetryPolicy {
  maxAttempts: number;
  backoffSeconds: number;
}

export interface ExecutionPolicyRule {
  taskId: string;
  title: string;
  toolName: string;
  targetSystem: string;
  operation: string;
  requiredRole: string;
  riskLevel: GameOpsRiskLevel;
  retryPolicy: ExecutionRetryPolicy;
  failureMode: ExecutionRecoveryActionKind;
  approvalRequired: boolean;
  evidenceRequired: string[];
  guardrails: string[];
}

interface ExecutionPolicyResponseWire {
  rules: ExecutionPolicyRuleWire[];
}

export interface ExecutionPolicyResponse {
  rules: ExecutionPolicyRule[];
}

interface EnterpriseReadinessItemWire {
  component: string;
  status: EnterpriseReadinessStatus;
  summary: string;
  detail: string;
  remediation?: string | null;
}

export interface EnterpriseReadinessItem {
  component: string;
  status: EnterpriseReadinessStatus;
  summary: string;
  detail: string;
  remediation: string | null;
}

interface EnterpriseReadinessResponseWire {
  overall_status: EnterpriseReadinessStatus;
  integration_mode: string;
  dry_run: boolean;
  tool_count: number;
  items: EnterpriseReadinessItemWire[];
}

export interface EnterpriseReadinessResponse {
  overallStatus: EnterpriseReadinessStatus;
  integrationMode: string;
  dryRun: boolean;
  toolCount: number;
  items: EnterpriseReadinessItem[];
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

export async function evaluateCompensationApproval(
  request: CompensationApprovalEvaluateRequest,
): Promise<{ task: ExecutionTask; decision: AiApprovalDecision }> {
  const res = await authenticatedFetch("/v1/gameops/tickets/approval/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      task: executionTaskToWire(request.task),
      category: request.category,
      player: { account_risk_status: request.player.accountRiskStatus, recent_manual_compensation_count: request.player.recentManualCompensationCount },
      verification: { payment_status: request.verification.paymentStatus, event_eligibility: request.verification.eventEligibility, delivery_status: request.verification.deliveryStatus },
      reward_type: request.rewardType,
      reward_amount: request.rewardAmount,
      evidence: request.evidence,
    }),
  });
  if (!res.ok) throw new Error(await readErrorMessage(res));
  const wire = (await res.json()) as { task: ExecutionTaskWire; decision: { decision_id: string; decision_source: ApprovalDecisionSource; decision_status: ApprovalDecisionStatus; risk_level: GameOpsRiskLevel; risk_score: number; reason: string; evidence_used: string[]; model_id?: string | null; decided_at: string } };
  return { task: executionTaskFromWire(wire.task), decision: { decisionId: wire.decision.decision_id, decisionSource: wire.decision.decision_source, decisionStatus: wire.decision.decision_status, riskLevel: wire.decision.risk_level, riskScore: wire.decision.risk_score, reason: wire.decision.reason, evidenceUsed: wire.decision.evidence_used, modelId: wire.decision.model_id ?? null, decidedAt: wire.decision.decided_at } };
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

export async function approveExecutionTask(
  request: ExecutionApprovalRequest,
): Promise<ExecutionActionResponse> {
  const res = await authenticatedFetch("/v1/gameops/execution/approve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(executionApprovalRequestToWire(request)),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }
  return executionActionFromWire((await res.json()) as ExecutionActionResponseWire);
}

export async function runExecutionTask(
  request: ExecutionRunRequest,
): Promise<ExecutionActionResponse> {
  const res = await authenticatedFetch("/v1/gameops/execution/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(executionRunRequestToWire(request)),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }
  return executionActionFromWire((await res.json()) as ExecutionActionResponseWire);
}

export async function registerExecutionTasks(
  tasks: ExecutionTask[],
): Promise<ExecutionTaskListResponse> {
  const res = await authenticatedFetch("/v1/gameops/execution/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tasks: tasks.map(executionTaskToWire) }),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }
  return executionTaskListFromWire((await res.json()) as ExecutionTaskListResponseWire);
}

export async function listExecutionHistory(): Promise<ExecutionHistoryResponse> {
  const res = await authenticatedFetch("/v1/gameops/execution/history", {
    method: "GET",
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }
  return executionHistoryFromWire((await res.json()) as ExecutionHistoryResponseWire);
}

export async function listExecutionReport(): Promise<ExecutionReportResponse> {
  const res = await authenticatedFetch("/v1/gameops/execution/report", {
    method: "GET",
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }
  return executionReportFromWire((await res.json()) as ExecutionReportResponseWire);
}

export async function listExecutionPolicy(): Promise<ExecutionPolicyResponse> {
  const res = await authenticatedFetch("/v1/gameops/execution/policy", {
    method: "GET",
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }
  return executionPolicyFromWire((await res.json()) as ExecutionPolicyResponseWire);
}

export async function getEnterpriseReadiness(): Promise<EnterpriseReadinessResponse> {
  const res = await authenticatedFetch("/v1/gameops/enterprise/readiness", {
    method: "GET",
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }
  return enterpriseReadinessFromWire((await res.json()) as EnterpriseReadinessResponseWire);
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

function executionActionFromWire(wire: ExecutionActionResponseWire): ExecutionActionResponse {
  return {
    task: executionTaskFromWire(wire.task),
    toolResult: {
      toolName: wire.tool_result.tool_name,
      status: wire.tool_result.status,
      summary: wire.tool_result.summary,
      evidence: wire.tool_result.evidence,
      receipt: wire.tool_result.receipt
        ? {
            system: wire.tool_result.receipt.system,
            operation: wire.tool_result.receipt.operation,
            referenceId: wire.tool_result.receipt.reference_id,
            dryRun: wire.tool_result.receipt.dry_run,
            writtenFields: wire.tool_result.receipt.written_fields,
            verificationNotes: wire.tool_result.receipt.verification_notes,
          }
        : null,
    },
    missingEvidence: wire.missing_evidence,
    approvalRequired: wire.approval_required,
    precheckItems: (wire.precheck_items ?? []).map((item) => ({
      checkId: item.check_id,
      label: item.label,
      status: item.status,
      detail: item.detail,
    })),
    loopSteps: wire.loop_steps.map((step) => ({
      phase: step.phase,
      status: step.status,
      summary: step.summary,
    })),
    recoveryActions: (wire.recovery_actions ?? []).map((action) => ({
      actionId: action.action_id,
      kind: action.kind,
      label: action.label,
      description: action.description,
    })),
    audit: {
      retrievedChunkIds: wire.audit.retrieved_chunk_ids,
      validationNotes: wire.audit.validation_notes,
    },
  };
}

function executionHistoryFromWire(wire: ExecutionHistoryResponseWire): ExecutionHistoryResponse {
  return {
    records: wire.records.map((record) => ({
      recordId: record.record_id,
      createdAt: record.created_at,
      action: record.action,
      actor: record.actor,
      taskId: record.task_id,
      taskTitle: record.task_title,
      toolName: record.tool_name,
      status: record.status,
      summary: record.summary,
      evidence: record.evidence,
      validationNotes: record.validation_notes,
    })),
  };
}

function executionTaskListFromWire(wire: ExecutionTaskListResponseWire): ExecutionTaskListResponse {
  return {
    tasks: wire.tasks.map(executionTaskFromWire),
  };
}

function executionReportFromWire(wire: ExecutionReportResponseWire): ExecutionReportResponse {
  return {
    generatedAt: wire.generated_at,
    recordCount: wire.record_count,
    markdown: wire.markdown,
  };
}

function executionPolicyFromWire(wire: ExecutionPolicyResponseWire): ExecutionPolicyResponse {
  return {
    rules: wire.rules.map((rule) => ({
      taskId: rule.task_id,
      title: rule.title,
      toolName: rule.tool_name,
      targetSystem: rule.target_system,
      operation: rule.operation,
      requiredRole: rule.required_role,
      riskLevel: rule.risk_level,
      retryPolicy: {
        maxAttempts: rule.retry_policy.max_attempts,
        backoffSeconds: rule.retry_policy.backoff_seconds,
      },
      failureMode: rule.failure_mode,
      approvalRequired: rule.approval_required,
      evidenceRequired: rule.evidence_required,
      guardrails: rule.guardrails,
    })),
  };
}

function enterpriseReadinessFromWire(
  wire: EnterpriseReadinessResponseWire,
): EnterpriseReadinessResponse {
  return {
    overallStatus: wire.overall_status,
    integrationMode: wire.integration_mode,
    dryRun: wire.dry_run,
    toolCount: wire.tool_count,
    items: wire.items.map((item) => ({
      component: item.component,
      status: item.status,
      summary: item.summary,
      detail: item.detail,
      remediation: item.remediation ?? null,
    })),
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

function executionApprovalRequestToWire(request: ExecutionApprovalRequest) {
  return {
    task: executionTaskToWire(request.task),
    approver: request.approver,
    decision: request.decision,
    comment: optionalString(request.comment),
  };
}

function executionRunRequestToWire(request: ExecutionRunRequest) {
  return {
    task: executionTaskToWire(request.task),
    operator: request.operator,
    operator_role: optionalString(request.operatorRole),
    evidence: request.evidence,
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
    approvedBy: wire.approved_by ?? null,
    approvalComment: wire.approval_comment ?? null,
    approvalProvenance: wire.approval_provenance ? { source: wire.approval_provenance.source, decisionId: wire.approval_provenance.decision_id, summary: wire.approval_provenance.summary, decidedAt: wire.approval_provenance.decided_at } : null,
  };
}

function executionTaskToWire(task: ExecutionTask): ExecutionTaskWire {
  return {
    task_id: task.taskId,
    title: task.title,
    owner_role: task.ownerRole,
    status: task.status,
    due: task.due,
    approval_required: task.approvalRequired,
    evidence_required: task.evidenceRequired,
    approved_by: task.approvedBy ?? null,
    approval_comment: task.approvalComment ?? null,
    approval_provenance: task.approvalProvenance ? { source: task.approvalProvenance.source, decision_id: task.approvalProvenance.decisionId, summary: task.approvalProvenance.summary, decided_at: task.approvalProvenance.decidedAt } : null,
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
