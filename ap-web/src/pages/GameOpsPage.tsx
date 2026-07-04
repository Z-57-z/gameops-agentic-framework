import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  AlertTriangleIcon,
  BookOpenIcon,
  CheckCircle2Icon,
  ClipboardListIcon,
  CopyIcon,
  DownloadIcon,
  LifeBuoyIcon,
  MegaphoneIcon,
  SendIcon,
  ShieldAlertIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/clipboard";
import {
  askGameOps,
  approveExecutionTask,
  draftCampaign,
  getEnterpriseReadiness,
  listExecutionHistory,
  listExecutionPolicy,
  listExecutionReport,
  planIncident,
  registerExecutionTasks,
  runExecutionTask,
  triageTicket,
  type CampaignDraftResponse,
  type EnterpriseReadinessResponse,
  type EnterpriseReadinessStatus,
  type ExecutionActionResponse,
  type ExecutionHistoryRecord,
  type ExecutionPolicyRule,
  type ExecutionReportResponse,
  type ExecutionTask,
  type GameOpsAskResponse,
  type GameOpsMode,
  type GameOpsSource,
  type IncidentRunbookResponse,
  type TicketTriageResponse,
} from "@/lib/gameopsApi";
import { cn } from "@/lib/utils";

interface ModeOption {
  id: GameOpsMode;
  label: string;
  description: string;
  icon: typeof BookOpenIcon;
}

interface CampaignFormState {
  campaignName: string;
  audience: string;
  startTime: string;
  endTime: string;
  rewardRules: string;
  eligibility: string;
  rollbackPlan: string;
  supportNotes: string;
}

interface TicketFormState {
  ticketText: string;
  playerId: string;
  serverId: string;
  accountId: string;
  orderId: string;
  eventId: string;
  timestamp: string;
}

interface IncidentFormState {
  incidentSummary: string;
  affectedServices: string;
  impact: string;
  durationMinutes: string;
  detectedAt: string;
  proposedCompensation: string;
}

const MODES: ModeOption[] = [
  {
    id: "knowledge",
    label: "知识库",
    description: "带来源依据的政策与手册问答。",
    icon: BookOpenIcon,
  },
  {
    id: "campaign",
    label: "活动",
    description: "活动文案、上线检查和风险审查。",
    icon: MegaphoneIcon,
  },
  {
    id: "tickets",
    label: "工单",
    description: "客服受理、优先级和升级建议。",
    icon: LifeBuoyIcon,
  },
  {
    id: "incident",
    label: "事故",
    description: "事故定级、同步节奏和升级路径。",
    icon: ShieldAlertIcon,
  },
];

const EMPTY_CAMPAIGN_FORM: CampaignFormState = {
  campaignName: "",
  audience: "",
  startTime: "",
  endTime: "",
  rewardRules: "",
  eligibility: "",
  rollbackPlan: "",
  supportNotes: "",
};

const EMPTY_TICKET_FORM: TicketFormState = {
  ticketText: "",
  playerId: "",
  serverId: "",
  accountId: "",
  orderId: "",
  eventId: "",
  timestamp: "",
};

const EMPTY_INCIDENT_FORM: IncidentFormState = {
  incidentSummary: "",
  affectedServices: "",
  impact: "",
  durationMinutes: "",
  detectedAt: "",
  proposedCompensation: "",
};

const MODE_TO_WORKFLOW: Record<GameOpsMode, string> = {
  knowledge: "知识问答",
  campaign: "活动运营",
  tickets: "工单分诊",
  incident: "事故手册",
};

const WORKFLOW_LABELS: Record<string, string> = {
  knowledge_qa: "知识问答",
  campaign_ops: "活动运营",
  ticket_triage: "工单分诊",
  incident_runbook: "事故手册",
};

const RISK_LABELS: Record<string, string> = {
  low: "低",
  medium: "中",
  high: "高",
  critical: "严重",
};

const CHECK_STATUS_LABELS: Record<string, string> = {
  pass: "通过",
  warning: "提醒",
  blocker: "阻塞",
};

const TICKET_PRIORITY_LABELS: Record<string, string> = {
  low: "低",
  medium: "中",
  high: "高",
  urgent: "紧急",
};

const EXECUTION_STATUS_LABELS: Record<ExecutionTask["status"], string> = {
  pending: "待处理",
  waiting_approval: "待审批",
  in_progress: "处理中",
  blocked: "阻塞",
  done: "已完成",
};

const RECOVERY_LABELS: Record<string, string> = {
  collect_evidence: "补齐证据",
  request_approval: "发起审批",
  request_permission: "切换权限",
  retry: "重试",
  manual_handoff: "人工交接",
};

export function GameOpsPage() {
  const [mode, setMode] = useState<GameOpsMode>("knowledge");
  const [question, setQuestion] = useState("");
  const [campaignForm, setCampaignForm] = useState<CampaignFormState>(EMPTY_CAMPAIGN_FORM);
  const [ticketForm, setTicketForm] = useState<TicketFormState>(EMPTY_TICKET_FORM);
  const [incidentForm, setIncidentForm] = useState<IncidentFormState>(EMPTY_INCIDENT_FORM);
  const [readiness, setReadiness] = useState<EnterpriseReadinessResponse | null>(null);
  const [lastResponse, setLastResponse] = useState<GameOpsAskResponse | null>(null);
  const [lastCampaignResponse, setLastCampaignResponse] = useState<CampaignDraftResponse | null>(
    null,
  );
  const [lastTicketResponse, setLastTicketResponse] = useState<TicketTriageResponse | null>(null);
  const [lastIncidentResponse, setLastIncidentResponse] = useState<IncidentRunbookResponse | null>(
    null,
  );
  const activeMode = useMemo(() => MODES.find((item) => item.id === mode) ?? MODES[0]!, [mode]);

  const askMutation = useMutation({
    mutationFn: askGameOps,
    onSuccess: (response) => setLastResponse(response),
  });
  const campaignMutation = useMutation({
    mutationFn: draftCampaign,
    onSuccess: (response) => setLastCampaignResponse(response),
  });
  const ticketMutation = useMutation({
    mutationFn: triageTicket,
    onSuccess: (response) => setLastTicketResponse(response),
  });
  const incidentMutation = useMutation({
    mutationFn: planIncident,
    onSuccess: (response) => setLastIncidentResponse(response),
  });
  const activeError =
    askMutation.error ?? campaignMutation.error ?? ticketMutation.error ?? incidentMutation.error;

  useEffect(() => {
    let cancelled = false;
    async function loadReadiness() {
      try {
        const response = await getEnterpriseReadiness();
        if (!cancelled) setReadiness(response);
      } catch {
        if (!cancelled) setReadiness(null);
      }
    }
    void loadReadiness();
    return () => {
      cancelled = true;
    };
  }, []);

  function submitQuestion() {
    const trimmed = question.trim();
    if (!trimmed || askMutation.isPending) return;
    askMutation.mutate({ question: trimmed, mode });
  }

  function submitCampaign() {
    if (campaignMutation.isPending) return;
    campaignMutation.mutate(campaignForm);
  }

  function submitTicket() {
    if (ticketMutation.isPending) return;
    ticketMutation.mutate(ticketForm);
  }

  function submitIncident() {
    if (incidentMutation.isPending) return;
    const duration = Number.parseInt(incidentForm.durationMinutes, 10);
    incidentMutation.mutate({
      incidentSummary: incidentForm.incidentSummary,
      affectedServices: incidentForm.affectedServices,
      impact: incidentForm.impact,
      durationMinutes: Number.isFinite(duration) ? duration : undefined,
      detectedAt: incidentForm.detectedAt,
      proposedCompensation: incidentForm.proposedCompensation,
    });
  }

  return (
    <main
      data-testid="gameops-page"
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground"
    >
      <div className="shrink-0 border-b border-border bg-card-solid px-4 py-4 md:px-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
              <CheckCircle2Icon className="size-3.5" />
              第一方业务运行时
            </div>
            <h1 className="text-2xl font-semibold tracking-normal md:text-3xl">
              GameOps 智能运营助手
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              面向客服政策、活动准备、工单分诊和事故处理的来源可追溯运营助手。
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
            <ClipboardListIcon className="size-3.5" />
            业务工作流运行，不委托外部编码 Agent
          </div>
        </div>
      </div>

      <div
        data-testid="gameops-workspace"
        className="grid min-h-0 flex-1 gap-0 overflow-y-auto lg:grid-cols-[360px_minmax(0,1fr)]"
      >
        <section className="border-b border-border bg-muted/25 p-4 lg:border-r lg:border-b-0 md:p-5">
          <div
            role="tablist"
            aria-label="GameOps 模式"
            className="grid grid-cols-2 gap-2 lg:grid-cols-1"
          >
            {MODES.map((item) => {
              const Icon = item.icon;
              const selected = item.id === mode;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-label={item.label}
                  className={cn(
                    "min-h-20 rounded-lg border p-3 text-left transition",
                    selected
                      ? "border-primary bg-primary/10 text-foreground shadow-sm"
                      : "border-border bg-card hover:border-primary/40 hover:bg-card-solid",
                  )}
                  onClick={() => setMode(item.id)}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <Icon
                      className={cn("size-4", selected ? "text-primary" : "text-muted-foreground")}
                    />
                    {item.label}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    {item.description}
                  </span>
                </button>
              );
            })}
          </div>

          <EnterpriseReadinessCard readiness={readiness} />
        </section>

        <section className="flex min-w-0 flex-col p-4 md:p-6">
          <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground">当前工作流</p>
                <p className="text-sm font-semibold">{MODE_TO_WORKFLOW[activeMode.id]}</p>
              </div>
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                必须引用依据
              </span>
            </div>
            {mode === "campaign" ? (
              <CampaignDraftForm
                form={campaignForm}
                isPending={campaignMutation.isPending}
                onChange={(field, value) =>
                  setCampaignForm((current) => ({ ...current, [field]: value }))
                }
                onSubmit={submitCampaign}
              />
            ) : mode === "tickets" ? (
              <TicketTriageForm
                form={ticketForm}
                isPending={ticketMutation.isPending}
                onChange={(field, value) =>
                  setTicketForm((current) => ({ ...current, [field]: value }))
                }
                onSubmit={submitTicket}
              />
            ) : mode === "incident" ? (
              <IncidentRunbookForm
                form={incidentForm}
                isPending={incidentMutation.isPending}
                onChange={(field, value) =>
                  setIncidentForm((current) => ({ ...current, [field]: value }))
                }
                onSubmit={submitIncident}
              />
            ) : (
              <QuestionComposer
                question={question}
                isPending={askMutation.isPending}
                onQuestionChange={setQuestion}
                onSubmit={submitQuestion}
              />
            )}
          </div>

          {activeError && (
            <div
              className="mt-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
              role="alert"
            >
              <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
              {activeError instanceof Error ? activeError.message : "GameOps 请求失败"}
            </div>
          )}

          {mode === "campaign" ? (
            lastCampaignResponse ? (
              <CampaignResult response={lastCampaignResponse} />
            ) : (
              <EmptyResult />
            )
          ) : mode === "tickets" ? (
            lastTicketResponse ? (
              <TicketResult response={lastTicketResponse} />
            ) : (
              <EmptyResult />
            )
          ) : mode === "incident" ? (
            lastIncidentResponse ? (
              <IncidentResult response={lastIncidentResponse} />
            ) : (
              <EmptyResult />
            )
          ) : lastResponse ? (
            <GameOpsResult response={lastResponse} />
          ) : (
            <EmptyResult />
          )}
        </section>
      </div>
    </main>
  );
}

function QuestionComposer({
  question,
  isPending,
  onQuestionChange,
  onSubmit,
}: {
  question: string;
  isPending: boolean;
  onQuestionChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-3">
      <label htmlFor="gameops-question" className="text-sm font-medium">
        GameOps 问题
      </label>
      <textarea
        id="gameops-question"
        aria-label="GameOps 问题"
        value={question}
        onChange={(event) => onQuestionChange(event.target.value)}
        placeholder="询问补偿政策、活动上线准备、客服工单或事故处理。"
        className="min-h-32 w-full resize-y rounded-md border border-input bg-background p-3 text-sm leading-6 outline-none transition placeholder:text-muted-foreground focus:border-primary"
      />
      <Button onClick={onSubmit} disabled={!question.trim() || isPending} className="gap-2">
        <SendIcon className="size-4" />
        {isPending ? "处理中" : "向 GameOps 提问"}
      </Button>
    </div>
  );
}

function CampaignDraftForm({
  form,
  isPending,
  onChange,
  onSubmit,
}: {
  form: CampaignFormState;
  isPending: boolean;
  onChange: (field: keyof CampaignFormState, value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <TextField
          label="活动名称"
          value={form.campaignName}
          onChange={(v) => onChange("campaignName", v)}
        />
        <TextField
          label="目标玩家"
          value={form.audience}
          onChange={(v) => onChange("audience", v)}
        />
        <TextField
          label="开始时间"
          value={form.startTime}
          onChange={(v) => onChange("startTime", v)}
        />
        <TextField label="结束时间" value={form.endTime} onChange={(v) => onChange("endTime", v)} />
      </div>
      <TextAreaField
        label="奖励规则"
        value={form.rewardRules}
        onChange={(v) => onChange("rewardRules", v)}
      />
      <TextAreaField
        label="参与资格"
        value={form.eligibility}
        onChange={(v) => onChange("eligibility", v)}
      />
      <TextAreaField
        label="回滚方案"
        value={form.rollbackPlan}
        onChange={(v) => onChange("rollbackPlan", v)}
      />
      <TextAreaField
        label="客服备注"
        value={form.supportNotes}
        onChange={(v) => onChange("supportNotes", v)}
      />
      <Button
        onClick={onSubmit}
        disabled={
          isPending ||
          !form.campaignName.trim() ||
          !form.audience.trim() ||
          !form.rewardRules.trim() ||
          !form.eligibility.trim()
        }
        className="gap-2"
      >
        <MegaphoneIcon className="size-4" />
        {isPending ? "生成中" : "生成活动闭环"}
      </Button>
    </div>
  );
}

function TicketTriageForm({
  form,
  isPending,
  onChange,
  onSubmit,
}: {
  form: TicketFormState;
  isPending: boolean;
  onChange: (field: keyof TicketFormState, value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-4">
      <TextAreaField
        label="工单内容"
        value={form.ticketText}
        onChange={(v) => onChange("ticketText", v)}
      />
      <div className="grid gap-3 md:grid-cols-3">
        <TextField
          label="玩家 ID"
          value={form.playerId}
          onChange={(v) => onChange("playerId", v)}
        />
        <TextField
          label="服务器 ID"
          value={form.serverId}
          onChange={(v) => onChange("serverId", v)}
        />
        <TextField
          label="账号 ID"
          value={form.accountId}
          onChange={(v) => onChange("accountId", v)}
        />
        <TextField label="订单 ID" value={form.orderId} onChange={(v) => onChange("orderId", v)} />
        <TextField label="活动 ID" value={form.eventId} onChange={(v) => onChange("eventId", v)} />
        <TextField
          label="发生时间"
          value={form.timestamp}
          onChange={(v) => onChange("timestamp", v)}
        />
      </div>
      <Button onClick={onSubmit} disabled={isPending || !form.ticketText.trim()} className="gap-2">
        <LifeBuoyIcon className="size-4" />
        {isPending ? "分诊中" : "分诊工单"}
      </Button>
    </div>
  );
}

function IncidentRunbookForm({
  form,
  isPending,
  onChange,
  onSubmit,
}: {
  form: IncidentFormState;
  isPending: boolean;
  onChange: (field: keyof IncidentFormState, value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-4">
      <TextAreaField
        label="事故摘要"
        value={form.incidentSummary}
        onChange={(v) => onChange("incidentSummary", v)}
      />
      <TextField
        label="受影响服务"
        value={form.affectedServices}
        onChange={(v) => onChange("affectedServices", v)}
      />
      <TextAreaField label="影响范围" value={form.impact} onChange={(v) => onChange("impact", v)} />
      <div className="grid gap-3 md:grid-cols-2">
        <TextField
          label="持续分钟数"
          value={form.durationMinutes}
          onChange={(v) => onChange("durationMinutes", v)}
        />
        <TextField
          label="发现时间"
          value={form.detectedAt}
          onChange={(v) => onChange("detectedAt", v)}
        />
      </div>
      <TextAreaField
        label="补偿设想"
        value={form.proposedCompensation}
        onChange={(v) => onChange("proposedCompensation", v)}
      />
      <Button
        onClick={onSubmit}
        disabled={
          isPending ||
          !form.incidentSummary.trim() ||
          !form.affectedServices.trim() ||
          !form.impact.trim()
        }
        className="gap-2"
      >
        <ShieldAlertIcon className="size-4" />
        {isPending ? "生成中" : "生成事故 Runbook"}
      </Button>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1 text-sm font-medium">
      <span>{label}</span>
      <input
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition focus:border-primary"
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1 text-sm font-medium">
      <span>{label}</span>
      <textarea
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-24 w-full resize-y rounded-md border border-input bg-background p-3 text-sm leading-6 outline-none transition focus:border-primary"
      />
    </label>
  );
}

function EmptyResult() {
  return (
    <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/20 p-6 text-sm text-muted-foreground">
      选择一个 GameOps 模式并提交后，这里会显示来源、风险、闭环任务和审计结果。
    </div>
  );
}

function EnterpriseReadinessCard({ readiness }: { readiness: EnterpriseReadinessResponse | null }) {
  const visibleItems = readiness?.items.filter((item) => item.status !== "ready").slice(0, 3) ?? [];

  return (
    <div
      data-testid="enterprise-readiness-card"
      className="mt-5 rounded-lg border border-border bg-card p-4 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">企业落地检查</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {readiness
              ? `${readiness.integrationMode} · ${readiness.toolCount} 个业务工具`
              : "正在读取运行状态"}
          </p>
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-medium",
            readinessStatusClass(readiness?.overallStatus ?? "warning"),
          )}
        >
          {readinessStatusLabel(readiness?.overallStatus ?? "warning")}
        </span>
      </div>
      {readiness && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md border border-border bg-background p-2">
              <p className="text-muted-foreground">工具写入</p>
              <p className="mt-1 font-medium">{readiness.dryRun ? "Dry-run 回执" : "真实写入"}</p>
            </div>
            <div className="rounded-md border border-border bg-background p-2">
              <p className="text-muted-foreground">检查项</p>
              <p className="mt-1 font-medium">{readiness.items.length} 项</p>
            </div>
          </div>
          {visibleItems.length > 0 && (
            <ul className="mt-3 space-y-2">
              {visibleItems.map((item) => (
                <li key={item.component} className="text-xs leading-5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{item.component}</span>
                    <span
                      className={cn("rounded-full px-2 py-0.5", readinessStatusClass(item.status))}
                    >
                      {readinessStatusLabel(item.status)}
                    </span>
                  </div>
                  <p className="mt-1 text-muted-foreground">{item.summary}</p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function GameOpsResult({ response }: { response: GameOpsAskResponse }) {
  return (
    <div className="mt-4 space-y-4">
      <SummaryCard workflow={response.workflow} riskLevel={response.riskLevel}>
        <p className="text-sm leading-6">{response.answer}</p>
      </SummaryCard>
      <ResultFlow>
        <SourcesPanel sources={response.sources} />
        <ActionsPanel actions={response.nextActions} />
      </ResultFlow>
      {response.missingInformation.length > 0 && (
        <ResultPanel title="缺失信息">
          <List items={response.missingInformation} muted />
        </ResultPanel>
      )}
    </div>
  );
}

function CampaignResult({ response }: { response: CampaignDraftResponse }) {
  return (
    <div className="mt-4 space-y-4">
      <SummaryCard workflow={response.workflow} riskLevel={response.riskLevel}>
        <h2 className="text-lg font-semibold">{response.announcementTitle}</h2>
        <p className="mt-2 whitespace-pre-line text-sm leading-6">{response.announcementBody}</p>
      </SummaryCard>
      <ResultFlow>
        <ResultPanel title="上线检查">
          <ul className="space-y-2">
            {response.launchChecks.map((check) => (
              <li
                key={check.label}
                className="rounded-md border border-border bg-background p-3 text-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{check.label}</p>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium",
                      checkClass(check.status),
                    )}
                  >
                    {CHECK_STATUS_LABELS[check.status]}
                  </span>
                </div>
                <p className="mt-1 leading-6 text-muted-foreground">{check.detail}</p>
              </li>
            ))}
          </ul>
        </ResultPanel>
        <ResultPanel title="客服 FAQ">
          <List items={response.supportFaq} />
        </ResultPanel>
        {response.executionTasks.length > 0 && (
          <ExecutionTaskClosurePanel title="上线闭环" tasks={response.executionTasks} />
        )}
        <SourcesPanel sources={response.sources} />
        <ActionsPanel actions={response.nextActions} />
      </ResultFlow>
    </div>
  );
}

function TicketResult({ response }: { response: TicketTriageResponse }) {
  return (
    <div className="mt-4 space-y-4">
      <SummaryCard workflow={response.workflow} riskLevel={response.riskLevel}>
        <div className="mb-2 inline-flex rounded-full bg-warning/15 px-2.5 py-1 text-xs font-medium text-warning">
          优先级：{TICKET_PRIORITY_LABELS[response.priority]}
        </div>
        <p className="text-sm leading-6">{response.suggestedReply}</p>
      </SummaryCard>
      <ResultFlow>
        <ResultPanel title="升级路径">
          <p className="text-sm leading-6 text-muted-foreground">{response.escalationPath}</p>
        </ResultPanel>
        {response.executionTasks.length > 0 && (
          <ExecutionTaskClosurePanel title="处理闭环" tasks={response.executionTasks} />
        )}
        <ActionsPanel actions={response.nextActions} />
        <SourcesPanel sources={response.sources} />
        {response.missingInformation.length > 0 && (
          <ResultPanel title="缺失信息">
            <List items={response.missingInformation} muted />
          </ResultPanel>
        )}
      </ResultFlow>
    </div>
  );
}

function IncidentResult({ response }: { response: IncidentRunbookResponse }) {
  return (
    <div className="mt-4 space-y-4">
      <SummaryCard workflow={response.workflow} riskLevel={response.riskLevel}>
        <div className="mb-2 inline-flex rounded-full bg-destructive/15 px-2.5 py-1 text-xs font-medium text-destructive">
          {response.severity.toUpperCase()}
        </div>
        <p className="text-sm leading-6 text-muted-foreground">{response.escalationPath}</p>
      </SummaryCard>
      <ResultFlow>
        <ResultPanel title="通信节奏">
          <p className="text-sm leading-6 text-muted-foreground">{response.communicationCadence}</p>
        </ResultPanel>
        <ResultPanel title="补偿建议">
          <p className="text-sm leading-6 text-muted-foreground">{response.compensationGuidance}</p>
        </ResultPanel>
        {response.executionTasks.length > 0 && (
          <ExecutionTaskClosurePanel title="执行闭环" tasks={response.executionTasks} />
        )}
        <SourcesPanel sources={response.sources} />
        <ActionsPanel actions={response.nextActions} />
      </ResultFlow>
    </div>
  );
}

function ExecutionTaskClosurePanel({ title, tasks }: { title: string; tasks: ExecutionTask[] }) {
  const [localTasks, setLocalTasks] = useState(tasks);
  const [taskEvidence, setTaskEvidence] = useState<Record<string, Record<string, string>>>({});
  const [actionResult, setActionResult] = useState<ExecutionActionResponse | null>(null);
  const [history, setHistory] = useState<ExecutionHistoryRecord[]>([]);
  const [report, setReport] = useState<ExecutionReportResponse | null>(null);
  const [policyRules, setPolicyRules] = useState<ExecutionPolicyRule[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [approver, setApprover] = useState("");
  const [operator, setOperator] = useState("");
  const [reportActionMessage, setReportActionMessage] = useState<string | null>(null);

  useEffect(() => {
    setLocalTasks(tasks);
    setTaskEvidence({});
    setActionResult(null);
    setActionError(null);
    setPendingAction(null);
    setReportActionMessage(null);
    if (tasks.length === 0) return;
    let cancelled = false;
    async function syncTasks() {
      try {
        const response = await registerExecutionTasks(tasks);
        if (!cancelled) setLocalTasks(response.tasks);
      } catch {
        if (!cancelled) setLocalTasks(tasks);
      }
    }
    void syncTasks();
    return () => {
      cancelled = true;
    };
  }, [tasks]);

  useEffect(() => {
    void refreshHistory();
    void refreshReport();
    void refreshPolicy();
  }, []);

  async function refreshHistory() {
    try {
      const response = await listExecutionHistory();
      setHistory(response.records);
    } catch {
      setHistory([]);
    }
  }

  async function refreshReport() {
    try {
      const response = await listExecutionReport();
      setReport(response);
    } catch {
      setReport(null);
    }
  }

  async function refreshPolicy() {
    try {
      const response = await listExecutionPolicy();
      setPolicyRules(response.rules);
    } catch {
      setPolicyRules([]);
    }
  }

  async function applyTaskAction(actionKey: string, action: Promise<ExecutionActionResponse>) {
    setPendingAction(actionKey);
    setActionError(null);
    try {
      const response = await action;
      setLocalTasks((current) =>
        current.map((task) => (task.taskId === response.task.taskId ? response.task : task)),
      );
      setActionResult(response);
      await refreshHistory();
      await refreshReport();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "任务执行失败");
    } finally {
      setPendingAction(null);
    }
  }

  async function copyReport(markdown: string) {
    try {
      await copyText(markdown);
      setReportActionMessage("报告已复制");
    } catch {
      setReportActionMessage("复制失败，请手动选择报告内容");
    }
  }

  function updateTaskEvidence(taskId: string, evidenceName: string, value: string) {
    setTaskEvidence((current) => ({
      ...current,
      [taskId]: {
        ...(current[taskId] ?? {}),
        [evidenceName]: value,
      },
    }));
  }

  return (
    <ResultPanel title={title}>
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <TextField label="审批人" value={approver} onChange={setApprover} />
        <TextField label="执行人" value={operator} onChange={setOperator} />
      </div>
      <ul className="space-y-3">
        {localTasks.map((task) => {
          const approvalPending = pendingAction === `approve:${task.taskId}`;
          const runPending = pendingAction === `run:${task.taskId}`;
          const policyRule = policyRules.find((rule) => rule.taskId === task.taskId);
          const evidenceValues = taskEvidence[task.taskId] ?? {};

          return (
            <li key={task.taskId} className="rounded-md border border-border bg-background p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{task.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {task.ownerRole} · {task.due}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs",
                    executionStatusClass(task.status),
                  )}
                >
                  {EXECUTION_STATUS_LABELS[task.status]}
                </span>
              </div>
              {policyRule && (
                <div className="mt-3 rounded-md border border-border bg-card p-3 text-xs leading-5 text-muted-foreground">
                  <p className="font-medium text-foreground">{policyRule.toolName}</p>
                  <p>
                    {policyRule.targetSystem} · {policyRule.operation}
                  </p>
                  <p>
                    角色：{policyRule.requiredRole || "未配置"} · 重试：
                    {policyRule.retryPolicy.maxAttempts} 次
                  </p>
                </div>
              )}
              {task.evidenceRequired.length > 0 && (
                <div className="mt-3 grid gap-2">
                  {task.evidenceRequired.map((evidence) => (
                    <TextField
                      key={evidence}
                      label={evidence}
                      value={evidenceValues[evidence] ?? ""}
                      onChange={(value) => updateTaskEvidence(task.taskId, evidence, value)}
                    />
                  ))}
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {task.approvalRequired && task.status === "waiting_approval" && (
                  <Button
                    size="sm"
                    disabled={approvalPending || !approver.trim()}
                    onClick={() =>
                      applyTaskAction(
                        `approve:${task.taskId}`,
                        approveExecutionTask({
                          task,
                          approver: approver.trim(),
                          decision: "approved",
                          comment: "页面审批通过",
                        }),
                      )
                    }
                  >
                    {approvalPending ? "审批中" : "审批通过"}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={runPending || !operator.trim()}
                  onClick={() =>
                    applyTaskAction(
                      `run:${task.taskId}`,
                      runExecutionTask({
                        task,
                        operator: operator.trim(),
                        operatorRole: task.ownerRole,
                        evidence:
                          task.evidenceRequired.length > 0
                            ? Object.fromEntries(
                                task.evidenceRequired.map((item) => [
                                  item,
                                  evidenceValues[item] ?? "",
                                ]),
                              )
                            : {},
                      }),
                    )
                  }
                >
                  {runPending ? "执行中" : "执行任务"}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      {actionError && <p className="mt-3 text-sm text-destructive">{actionError}</p>}

      {actionResult && (
        <div className="mt-4 rounded-md border border-border bg-background p-3 text-sm">
          <p className="font-medium">执行结果：{actionResult.toolResult.summary}</p>
          {actionResult.recoveryActions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {actionResult.recoveryActions.map((action) => (
                <span
                  key={action.actionId}
                  className="rounded-full bg-warning/15 px-2 py-0.5 text-xs text-warning"
                >
                  {RECOVERY_LABELS[action.kind] ?? action.label}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-md border border-border bg-background p-3">
          <p className="text-sm font-semibold">最近审计</p>
          <ul className="mt-2 space-y-2 text-xs text-muted-foreground">
            {history.slice(-3).map((record) => (
              <li key={record.recordId}>
                {record.action} · {record.actor} · {record.summary}
              </li>
            ))}
            {history.length === 0 && <li>暂无审计记录</li>}
          </ul>
        </div>
        <div className="rounded-md border border-border bg-background p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">交接报告</p>
            {report && (
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => copyReport(report.markdown)}>
                  <CopyIcon className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => downloadMarkdownFile("gameops-audit-report.md", report.markdown)}
                >
                  <DownloadIcon className="size-4" />
                </Button>
              </div>
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {report ? `${report.recordCount} 条记录` : "暂无报告"}
          </p>
          {reportActionMessage && (
            <p className="mt-2 text-xs text-muted-foreground">{reportActionMessage}</p>
          )}
        </div>
      </div>
    </ResultPanel>
  );
}

function SummaryCard({
  workflow,
  riskLevel,
  children,
}: {
  workflow: string;
  riskLevel: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
          {WORKFLOW_LABELS[workflow] ?? workflow}
        </span>
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", riskClass(riskLevel))}>
          风险：{RISK_LABELS[riskLevel] ?? riskLevel}
        </span>
      </div>
      {children}
    </div>
  );
}

function ResultFlow({ children }: { children: ReactNode }) {
  return (
    <div data-testid="result-flow" className="columns-1 gap-4 xl:columns-2">
      {children}
    </div>
  );
}

function ResultPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-4 break-inside-avoid rounded-lg border border-border bg-card p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function SourcesPanel({ sources }: { sources: GameOpsSource[] }) {
  return (
    <ResultPanel title="来源依据">
      {sources.length > 0 ? (
        <ul className="space-y-2">
          {sources.map((source) => (
            <li
              key={source.chunkId}
              className="rounded-md border border-border bg-background p-3 text-sm"
            >
              <p className="font-medium">{source.title}</p>
              <p className="text-muted-foreground">{source.section}</p>
              <p className="mt-1 text-xs text-muted-foreground">{source.path}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">暂无可引用来源。</p>
      )}
    </ResultPanel>
  );
}

function ActionsPanel({ actions }: { actions: string[] }) {
  return (
    <ResultPanel title="后续动作">
      <List items={actions} />
    </ResultPanel>
  );
}

function List({ items, muted = false }: { items: string[]; muted?: boolean }) {
  return (
    <ul className={cn("space-y-2 text-sm leading-6", muted && "text-muted-foreground")}>
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <CheckCircle2Icon className="mt-1 size-4 shrink-0 text-primary" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function riskClass(risk: string): string {
  if (risk === "critical") return "bg-destructive/15 text-destructive";
  if (risk === "high") return "bg-warning/15 text-warning";
  if (risk === "medium") return "bg-primary/10 text-primary";
  return "bg-muted text-muted-foreground";
}

function checkClass(status: CampaignDraftResponse["launchChecks"][number]["status"]): string {
  if (status === "blocker") return "bg-destructive/15 text-destructive";
  if (status === "warning") return "bg-warning/15 text-warning";
  return "bg-primary/10 text-primary";
}

function executionStatusClass(status: ExecutionTask["status"]): string {
  if (status === "waiting_approval" || status === "blocked") return "bg-warning/15 text-warning";
  if (status === "done") return "bg-primary/10 text-primary";
  if (status === "in_progress") return "bg-accent text-accent-foreground";
  return "bg-muted text-muted-foreground";
}

function readinessStatusClass(status: EnterpriseReadinessStatus): string {
  if (status === "missing") return "bg-destructive/15 text-destructive";
  if (status === "warning") return "bg-warning/15 text-warning";
  return "bg-primary/10 text-primary";
}

function readinessStatusLabel(status: EnterpriseReadinessStatus): string {
  if (status === "missing") return "缺配置";
  if (status === "warning") return "待接入";
  return "就绪";
}

function downloadMarkdownFile(filename: string, markdown: string) {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
