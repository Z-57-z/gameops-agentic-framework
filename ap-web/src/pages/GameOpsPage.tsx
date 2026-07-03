import { type ReactNode, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  AlertTriangleIcon,
  BookOpenIcon,
  CheckCircle2Icon,
  ClipboardListIcon,
  LifeBuoyIcon,
  MegaphoneIcon,
  SendIcon,
  ShieldAlertIcon,
} from "lucide-react";
import {
  askGameOps,
  draftCampaign,
  planIncident,
  triageTicket,
  type CampaignDraftResponse,
  type ExecutionTask,
  type GameOpsAskResponse,
  type GameOpsMode,
  type GameOpsSource,
  type IncidentRunbookResponse,
  type TicketTriageResponse,
} from "@/lib/gameopsApi";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ModeOption {
  id: GameOpsMode;
  label: string;
  description: string;
  icon: typeof BookOpenIcon;
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

const EXAMPLES: Array<{ mode: GameOpsMode; text: string }> = [
  {
    mode: "knowledge",
    text: "玩家错过了充值返利奖励，客服可以承诺什么？",
  },
  {
    mode: "incident",
    text: "登录故障持续 30 分钟后，能不能给全服发高级货币补偿？",
  },
  {
    mode: "campaign",
    text: "周末活动上线前，运营需要检查哪些内容？",
  },
];

const MODE_TO_WORKFLOW: Record<GameOpsMode, string> = {
  knowledge: "知识问答",
  campaign: "活动运营",
  tickets: "工单分诊",
  incident: "事故手册",
};

const WORKFLOW_LABELS: Record<
  GameOpsAskResponse["workflow"] | CampaignDraftResponse["workflow"],
  string
> = {
  knowledge_qa: "知识问答",
  campaign_ops: "活动运营",
  ticket_triage: "工单分诊",
  incident_runbook: "事故手册",
};

const RISK_LABELS: Record<GameOpsAskResponse["riskLevel"], string> = {
  low: "低",
  medium: "中",
  high: "高",
  critical: "严重",
};

const CHECK_STATUS_LABELS: Record<CampaignDraftResponse["launchChecks"][number]["status"], string> =
  {
    pass: "通过",
    warning: "提醒",
    blocker: "阻塞",
  };

const SOURCE_TITLE_LABELS: Record<string, string> = {
  event_rebate_policy: "充值返利政策",
  compensation_policy: "补偿政策",
  support_faq: "客服 FAQ",
  incident_runbook: "事故手册",
  campaign_checklist: "活动检查清单",
  "Event Rebate Policy": "充值返利政策",
  "Compensation Policy": "补偿政策",
  "Support FAQ": "客服 FAQ",
  "Incident Runbook": "事故手册",
  "Campaign Checklist": "活动检查清单",
};

const SOURCE_SECTION_LABELS: Record<string, string> = {
  "Missed recharge rebate": "错过充值返利",
  "Eligibility checks": "资格核验",
  "Manual grant guardrails": "人工补发约束",
  "Standard compensation limits": "标准补偿限制",
  "Incident compensation": "事故补偿",
  "Player communication": "玩家沟通",
  "Missing rewards": "奖励未到账",
  "Account access": "账号访问",
  "Launch readiness": "上线准备",
  "Announcement review": "公告复核",
  "Rollback plan": "回滚方案",
  "Severity levels": "事故等级",
  "Communication cadence": "通信节奏",
  "Escalation path": "升级路径",
};

const FIELD_LABELS: Record<string, string> = {
  player_id: "玩家 ID",
  server_id: "服务器 ID",
  account_id: "账号 ID",
  order_id: "订单 ID",
  event_id: "活动 ID",
  timestamp: "发生时间",
  detected_at: "发现时间",
  duration_minutes: "持续分钟数",
  proposed_compensation: "补偿设想",
};

const TICKET_CATEGORY_LABELS: Record<string, string> = {
  payment_reward: "支付与奖励问题",
  account_access: "账号访问问题",
  event_participation: "活动参与问题",
  general_support: "通用客服问题",
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

interface TicketFormState {
  ticketText: string;
  playerId: string;
  serverId: string;
  accountId: string;
  orderId: string;
  eventId: string;
  timestamp: string;
}

const EMPTY_TICKET_FORM: TicketFormState = {
  ticketText: "",
  playerId: "",
  serverId: "",
  accountId: "",
  orderId: "",
  eventId: "",
  timestamp: "",
};

interface IncidentFormState {
  incidentSummary: string;
  affectedServices: string;
  impact: string;
  durationMinutes: string;
  detectedAt: string;
  proposedCompensation: string;
}

const EMPTY_INCIDENT_FORM: IncidentFormState = {
  incidentSummary: "",
  affectedServices: "",
  impact: "",
  durationMinutes: "",
  detectedAt: "",
  proposedCompensation: "",
};

export function GameOpsPage() {
  const [mode, setMode] = useState<GameOpsMode>("knowledge");
  const [question, setQuestion] = useState(EXAMPLES[0]!.text);
  const [campaignForm, setCampaignForm] = useState<CampaignFormState>(EMPTY_CAMPAIGN_FORM);
  const [ticketForm, setTicketForm] = useState<TicketFormState>(EMPTY_TICKET_FORM);
  const [incidentForm, setIncidentForm] = useState<IncidentFormState>(EMPTY_INCIDENT_FORM);
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

  function submitQuestion() {
    const trimmed = question.trim();
    if (!trimmed || askMutation.isPending) return;
    askMutation.mutate({ question: trimmed, mode });
  }

  function updateCampaignForm(field: keyof CampaignFormState, value: string) {
    setCampaignForm((current) => ({ ...current, [field]: value }));
  }

  function submitCampaign() {
    if (campaignMutation.isPending) return;
    campaignMutation.mutate(campaignForm);
  }

  function updateTicketForm(field: keyof TicketFormState, value: string) {
    setTicketForm((current) => ({ ...current, [field]: value }));
  }

  function submitTicket() {
    if (ticketMutation.isPending) return;
    ticketMutation.mutate(ticketForm);
  }

  function updateIncidentForm(field: keyof IncidentFormState, value: string) {
    setIncidentForm((current) => ({ ...current, [field]: value }));
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

          <div className="mt-5 space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">
              示例问题
            </h2>
            {EXAMPLES.map((example) => (
              <button
                key={example.text}
                type="button"
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-left text-sm leading-5 transition hover:border-primary/40 hover:bg-card-solid"
                onClick={() => {
                  setMode(example.mode);
                  setQuestion(example.text);
                }}
              >
                {example.text}
              </button>
            ))}
          </div>
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
                onChange={updateCampaignForm}
                onSubmit={submitCampaign}
              />
            ) : mode === "tickets" ? (
              <TicketTriageForm
                form={ticketForm}
                isPending={ticketMutation.isPending}
                onChange={updateTicketForm}
                onSubmit={submitTicket}
              />
            ) : mode === "incident" ? (
              <IncidentRunbookForm
                form={incidentForm}
                isPending={incidentMutation.isPending}
                onChange={updateIncidentForm}
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
    <>
      <label htmlFor="gameops-question" className="sr-only">
        GameOps 问题
      </label>
      <textarea
        id="gameops-question"
        aria-label="GameOps 问题"
        value={question}
        onChange={(event) => onQuestionChange(event.target.value)}
        className="min-h-32 w-full resize-y rounded-md border border-input bg-background p-3 text-sm leading-6 outline-none transition placeholder:text-muted-foreground focus:border-primary"
        placeholder="询问补偿政策、活动上线准备、客服工单或事故处理。"
      />
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">回答前会先检索内置 GameOps 知识库。</p>
        <Button
          type="button"
          className="gap-2"
          onClick={onSubmit}
          disabled={!question.trim() || isPending}
        >
          <SendIcon className="size-4" />
          {isPending ? "分析中..." : "向 GameOps 提问"}
        </Button>
      </div>
    </>
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
  const requiredComplete =
    form.campaignName.trim() &&
    form.audience.trim() &&
    form.rewardRules.trim() &&
    form.eligibility.trim();

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <TextField
          label="活动名称"
          value={form.campaignName}
          onChange={(value) => onChange("campaignName", value)}
        />
        <TextField
          label="目标玩家"
          value={form.audience}
          onChange={(value) => onChange("audience", value)}
        />
        <TextField
          label="开始时间"
          value={form.startTime}
          onChange={(value) => onChange("startTime", value)}
        />
        <TextField
          label="结束时间"
          value={form.endTime}
          onChange={(value) => onChange("endTime", value)}
        />
      </div>
      <TextAreaField
        label="奖励规则"
        value={form.rewardRules}
        onChange={(value) => onChange("rewardRules", value)}
      />
      <TextAreaField
        label="参与资格"
        value={form.eligibility}
        onChange={(value) => onChange("eligibility", value)}
      />
      <TextAreaField
        label="回滚方案"
        value={form.rollbackPlan}
        onChange={(value) => onChange("rollbackPlan", value)}
      />
      <TextAreaField
        label="客服备注"
        value={form.supportNotes}
        onChange={(value) => onChange("supportNotes", value)}
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          输出会包含上线检查、公告文案、客服 FAQ 和审批风险点。
        </p>
        <Button
          type="button"
          className="gap-2"
          onClick={onSubmit}
          disabled={!requiredComplete || isPending}
        >
          <MegaphoneIcon className="size-4" />
          {isPending ? "生成中..." : "生成活动方案"}
        </Button>
      </div>
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
    <div className="space-y-3">
      <TextAreaField
        label="工单内容"
        value={form.ticketText}
        onChange={(value) => onChange("ticketText", value)}
      />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <TextField
          label="玩家 ID"
          value={form.playerId}
          onChange={(value) => onChange("playerId", value)}
        />
        <TextField
          label="服务器 ID"
          value={form.serverId}
          onChange={(value) => onChange("serverId", value)}
        />
        <TextField
          label="账号 ID"
          value={form.accountId}
          onChange={(value) => onChange("accountId", value)}
        />
        <TextField
          label="订单 ID"
          value={form.orderId}
          onChange={(value) => onChange("orderId", value)}
        />
        <TextField
          label="活动 ID"
          value={form.eventId}
          onChange={(value) => onChange("eventId", value)}
        />
        <TextField
          label="发生时间"
          value={form.timestamp}
          onChange={(value) => onChange("timestamp", value)}
        />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          输出会包含分类、优先级、升级路径、缺失字段和客服回复建议。
        </p>
        <Button
          type="button"
          className="gap-2"
          onClick={onSubmit}
          disabled={!form.ticketText.trim() || isPending}
        >
          <LifeBuoyIcon className="size-4" />
          {isPending ? "分诊中..." : "分诊工单"}
        </Button>
      </div>
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
  const requiredComplete =
    form.incidentSummary.trim() && form.affectedServices.trim() && form.impact.trim();

  return (
    <div className="space-y-3">
      <TextAreaField
        label="事故摘要"
        value={form.incidentSummary}
        onChange={(value) => onChange("incidentSummary", value)}
      />
      <div className="grid gap-3 md:grid-cols-2">
        <TextField
          label="受影响服务"
          value={form.affectedServices}
          onChange={(value) => onChange("affectedServices", value)}
        />
        <TextField
          label="持续分钟数"
          value={form.durationMinutes}
          onChange={(value) => onChange("durationMinutes", value)}
        />
        <TextField
          label="发现时间"
          value={form.detectedAt}
          onChange={(value) => onChange("detectedAt", value)}
        />
      </div>
      <TextAreaField
        label="玩家影响"
        value={form.impact}
        onChange={(value) => onChange("impact", value)}
      />
      <TextAreaField
        label="补偿设想"
        value={form.proposedCompensation}
        onChange={(value) => onChange("proposedCompensation", value)}
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          输出会包含事故定级、同步节奏、升级路径、补偿审批要求和后续复盘动作。
        </p>
        <Button
          type="button"
          className="gap-2"
          onClick={onSubmit}
          disabled={!requiredComplete || isPending}
        >
          <ShieldAlertIcon className="size-4" />
          {isPending ? "生成中..." : "生成事故处置手册"}
        </Button>
      </div>
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
  const id = `campaign-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <label htmlFor={id} className="block text-sm font-medium">
      {label}
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition focus:border-primary"
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
  const id = `campaign-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <label htmlFor={id} className="block text-sm font-medium">
      {label}
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 min-h-20 w-full resize-y rounded-md border border-input bg-background p-3 text-sm leading-6 outline-none transition focus:border-primary"
      />
    </label>
  );
}

function EmptyResult() {
  return (
    <div className="mt-4 grid gap-3 md:grid-cols-3">
      {[
        ["回答", "基于已整理来源的运营建议。"],
        ["来源依据", "回答引用到的政策与手册片段。"],
        ["风险", "执行前需要补齐的信息和审批点。"],
      ].map(([title, body]) => (
        <div key={title} className="rounded-lg border border-dashed border-border bg-muted/20 p-4">
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{body}</p>
        </div>
      ))}
    </div>
  );
}

function GameOpsResult({ response }: { response: GameOpsAskResponse }) {
  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            {WORKFLOW_LABELS[response.workflow]}
          </span>
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium",
              riskClass(response.riskLevel),
            )}
          >
            风险：{RISK_LABELS[response.riskLevel]}
          </span>
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
            置信度 {Math.round(response.confidence * 100)}%
          </span>
        </div>
        <p className="text-sm leading-6">{response.answer}</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ResultPanel title="来源依据">
          {response.sources.length > 0 ? (
            <ul className="space-y-2">
              {response.sources.map((source) => (
                <li
                  key={source.chunkId}
                  className="rounded-md border border-border bg-background p-3 text-sm"
                >
                  <p className="font-medium">{sourceTitle(source)}</p>
                  <p className="text-muted-foreground">{sourceSection(source)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{sourceLocation(source)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">未找到可引用的来源。</p>
          )}
        </ResultPanel>

        <ResultPanel title="后续动作">
          <ul className="space-y-2 text-sm leading-6">
            {response.nextActions.map((action) => (
              <li key={action} className="flex gap-2">
                <CheckCircle2Icon className="mt-1 size-4 shrink-0 text-primary" />
                <span>{action}</span>
              </li>
            ))}
          </ul>
        </ResultPanel>
      </div>

      {response.missingInformation.length > 0 && (
        <ResultPanel title="缺失信息">
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {response.missingInformation.map((item) => (
              <li key={item}>{fieldLabel(item)}</li>
            ))}
          </ul>
        </ResultPanel>
      )}
    </div>
  );
}

function CampaignResult({ response }: { response: CampaignDraftResponse }) {
  const approvalEvidence = approvalEvidenceFor(response.executionTasks);

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            {WORKFLOW_LABELS[response.workflow]}
          </span>
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium",
              riskClass(response.riskLevel),
            )}
          >
            风险：{RISK_LABELS[response.riskLevel]}
          </span>
        </div>
        <h2 className="text-lg font-semibold">{response.announcementTitle}</h2>
        <p className="mt-2 whitespace-pre-line text-sm leading-6">{response.announcementBody}</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
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
          <ul className="space-y-2 text-sm leading-6">
            {response.supportFaq.map((item) => (
              <li key={item} className="flex gap-2">
                <CheckCircle2Icon className="mt-1 size-4 shrink-0 text-primary" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </ResultPanel>

        {approvalEvidence.length > 0 && (
          <ResultPanel title="上线审批材料">
            <p className="text-sm leading-6 text-muted-foreground">
              公开上线前需要把这些材料提交给审批人确认。
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {approvalEvidence.map((evidence) => (
                <span
                  key={evidence}
                  className="rounded-md border border-warning/25 bg-warning/10 px-2.5 py-1.5 text-xs font-medium text-warning"
                >
                  {evidence}
                </span>
              ))}
            </div>
          </ResultPanel>
        )}

        {response.executionTasks.length > 0 && (
          <ResultPanel title="上线闭环">
            <ul className="space-y-3">
              {response.executionTasks.map((task) => (
                <li
                  key={task.taskId}
                  className="rounded-md border border-border bg-background p-3 text-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{task.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">负责人：{task.ownerRole}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1.5">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          executionStatusClass(task.status),
                        )}
                      >
                        {EXECUTION_STATUS_LABELS[task.status]}
                      </span>
                      {task.approvalRequired && (
                        <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
                          需审批
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">截止：{task.due}</p>
                  {task.evidenceRequired.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {task.evidenceRequired.map((evidence) => (
                        <span
                          key={evidence}
                          className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"
                        >
                          {evidence}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </ResultPanel>
        )}

        <ResultPanel title="来源依据">
          {response.sources.length > 0 ? (
            <ul className="space-y-2">
              {response.sources.map((source) => (
                <li
                  key={source.chunkId}
                  className="rounded-md border border-border bg-background p-3 text-sm"
                >
                  <p className="font-medium">{sourceTitle(source)}</p>
                  <p className="text-muted-foreground">{sourceSection(source)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{sourceLocation(source)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">未找到可引用的来源。</p>
          )}
        </ResultPanel>

        <ResultPanel title="后续动作">
          <ul className="space-y-2 text-sm leading-6">
            {response.nextActions.map((action) => (
              <li key={action} className="flex gap-2">
                <CheckCircle2Icon className="mt-1 size-4 shrink-0 text-primary" />
                <span>{action}</span>
              </li>
            ))}
          </ul>
        </ResultPanel>
      </div>

      {response.missingInformation.length > 0 && (
        <ResultPanel title="缺失信息">
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {response.missingInformation.map((item) => (
              <li key={item}>{fieldLabel(item)}</li>
            ))}
          </ul>
        </ResultPanel>
      )}
    </div>
  );
}

function TicketResult({ response }: { response: TicketTriageResponse }) {
  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            {WORKFLOW_LABELS[response.workflow]}
          </span>
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium",
              riskClass(response.riskLevel),
            )}
          >
            风险：{RISK_LABELS[response.riskLevel]}
          </span>
          <span className="rounded-full bg-warning/15 px-2.5 py-1 text-xs font-medium text-warning">
            优先级：{ticketPriorityLabel(response.priority)}
          </span>
        </div>
        <h2 className="text-lg font-semibold">{ticketCategoryLabel(response.category)}</h2>
        <p className="mt-2 text-sm leading-6">{response.suggestedReply}</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ResultPanel title="升级路径">
          <p className="text-sm leading-6 text-muted-foreground">{response.escalationPath}</p>
        </ResultPanel>

        {response.executionTasks.length > 0 && (
          <ResultPanel title="处理闭环">
            <ul className="space-y-3">
              {response.executionTasks.map((task) => (
                <li
                  key={task.taskId}
                  className="rounded-md border border-border bg-background p-3 text-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{task.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">负责人：{task.ownerRole}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1.5">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          executionStatusClass(task.status),
                        )}
                      >
                        {EXECUTION_STATUS_LABELS[task.status]}
                      </span>
                      {task.approvalRequired && (
                        <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
                          需审批
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">截止：{task.due}</p>
                  {task.evidenceRequired.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {task.evidenceRequired.map((evidence) => (
                        <span
                          key={evidence}
                          className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"
                        >
                          {evidence}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </ResultPanel>
        )}

        <ResultPanel title="后续动作">
          <ul className="space-y-2 text-sm leading-6">
            {response.nextActions.map((action) => (
              <li key={action} className="flex gap-2">
                <CheckCircle2Icon className="mt-1 size-4 shrink-0 text-primary" />
                <span>{action}</span>
              </li>
            ))}
          </ul>
        </ResultPanel>

        <ResultPanel title="来源依据">
          {response.sources.length > 0 ? (
            <ul className="space-y-2">
              {response.sources.map((source) => (
                <li
                  key={source.chunkId}
                  className="rounded-md border border-border bg-background p-3 text-sm"
                >
                  <p className="font-medium">{sourceTitle(source)}</p>
                  <p className="text-muted-foreground">{sourceSection(source)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{sourceLocation(source)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">未找到可引用的来源。</p>
          )}
        </ResultPanel>

        {response.missingInformation.length > 0 && (
          <ResultPanel title="缺失信息">
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {response.missingInformation.map((item) => (
                <li key={item}>{fieldLabel(item)}</li>
              ))}
            </ul>
          </ResultPanel>
        )}
      </div>
    </div>
  );
}

function IncidentResult({ response }: { response: IncidentRunbookResponse }) {
  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            {WORKFLOW_LABELS[response.workflow]}
          </span>
          <span className="rounded-full bg-destructive/15 px-2.5 py-1 text-xs font-medium text-destructive">
            {response.severity.toUpperCase()}
          </span>
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium",
              riskClass(response.riskLevel),
            )}
          >
            风险：{RISK_LABELS[response.riskLevel]}
          </span>
        </div>
        <h2 className="text-lg font-semibold">事故处置手册</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{response.escalationPath}</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ResultPanel title="通信节奏">
          <p className="text-sm leading-6 text-muted-foreground">{response.communicationCadence}</p>
        </ResultPanel>

        <ResultPanel title="补偿建议">
          <p className="text-sm leading-6 text-muted-foreground">{response.compensationGuidance}</p>
        </ResultPanel>

        {response.executionTasks.length > 0 && (
          <ResultPanel title="执行闭环">
            <ul className="space-y-3">
              {response.executionTasks.map((task) => (
                <li
                  key={task.taskId}
                  className="rounded-md border border-border bg-background p-3 text-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{task.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">负责人：{task.ownerRole}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1.5">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          executionStatusClass(task.status),
                        )}
                      >
                        {EXECUTION_STATUS_LABELS[task.status]}
                      </span>
                      {task.approvalRequired && (
                        <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
                          需审批
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">截止：{task.due}</p>
                  {task.evidenceRequired.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {task.evidenceRequired.map((evidence) => (
                        <span
                          key={evidence}
                          className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"
                        >
                          {evidence}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </ResultPanel>
        )}

        <ResultPanel title="来源依据">
          {response.sources.length > 0 ? (
            <ul className="space-y-2">
              {response.sources.map((source) => (
                <li
                  key={source.chunkId}
                  className="rounded-md border border-border bg-background p-3 text-sm"
                >
                  <p className="font-medium">{sourceTitle(source)}</p>
                  <p className="text-muted-foreground">{sourceSection(source)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{sourceLocation(source)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">未找到可引用的来源。</p>
          )}
        </ResultPanel>

        <ResultPanel title="后续动作">
          <ul className="space-y-2 text-sm leading-6">
            {response.nextActions.map((action) => (
              <li key={action} className="flex gap-2">
                <CheckCircle2Icon className="mt-1 size-4 shrink-0 text-primary" />
                <span>{action}</span>
              </li>
            ))}
          </ul>
        </ResultPanel>

        {response.missingInformation.length > 0 && (
          <ResultPanel title="缺失信息">
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {response.missingInformation.map((item) => (
                <li key={item}>{fieldLabel(item)}</li>
              ))}
            </ul>
          </ResultPanel>
        )}
      </div>
    </div>
  );
}

function sourceTitle(source: GameOpsSource): string {
  return SOURCE_TITLE_LABELS[source.sourceId] ?? SOURCE_TITLE_LABELS[source.title] ?? source.title;
}

function sourceSection(source: GameOpsSource): string {
  return SOURCE_SECTION_LABELS[source.section] ?? source.section;
}

function sourceLocation(source: GameOpsSource): string {
  if (source.lineStart != null && source.lineEnd != null) {
    return `内置知识库 · 第 ${source.lineStart}-${source.lineEnd} 行`;
  }
  return "内置知识库";
}

function fieldLabel(value: string): string {
  return FIELD_LABELS[value] ?? value;
}

function approvalEvidenceFor(tasks: ExecutionTask[]): string[] {
  return Array.from(
    new Set(tasks.filter((task) => task.approvalRequired).flatMap((task) => task.evidenceRequired)),
  );
}

function ticketCategoryLabel(value: string): string {
  return TICKET_CATEGORY_LABELS[value] ?? value;
}

function ticketPriorityLabel(value: string): string {
  return TICKET_PRIORITY_LABELS[value] ?? value;
}

function ResultPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function riskClass(risk: GameOpsAskResponse["riskLevel"]): string {
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
