import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GameOpsPage } from "./GameOpsPage";

vi.mock("@/lib/gameopsApi", () => ({
  askGameOps: vi.fn(async () => ({
    answer: "客服应先核验资格，避免承诺不受支持的奖励。",
    workflow: "knowledge_qa",
    riskLevel: "medium",
    sources: [
      {
        sourceId: "event_rebate_policy",
        title: "Event Rebate Policy",
        section: "Missed rewards",
        path: "omnigent/gameops/data/event_rebate_policy.md",
        chunkId: "event_rebate_policy#missed-rewards",
      },
    ],
    nextActions: ["核验活动资格", "异常情况升级给运营负责人"],
    missingInformation: [],
    confidence: 0.84,
    audit: {
      retrievedChunkIds: ["event_rebate_policy#missed-rewards"],
      validationNotes: ["sources checked"],
    },
  })),
  draftCampaign: vi.fn(async () => ({
    workflow: "campaign_ops",
    announcementTitle: "Weekend Recharge Sprint",
    announcementBody: "活动时间：周五 至 周日。",
    supportFaq: ["谁可以参与？10 级账号。"],
    launchChecks: [{ label: "活动时间", status: "pass", detail: "周五 至 周日" }],
    riskLevel: "high",
    sources: [
      {
        sourceId: "campaign_checklist",
        title: "Campaign Checklist",
        section: "Launch readiness",
        path: "omnigent/gameops/data/campaign_checklist.md",
        chunkId: "campaign_checklist#launch-readiness",
      },
    ],
    nextActions: ["公开上线前取得运营负责人审批。"],
    executionTasks: [
      {
        taskId: "campaign-config",
        title: "复核活动配置与奖励规则",
        ownerRole: "活动运营负责人",
        status: "pending",
        due: "上线前",
        approvalRequired: false,
        evidenceRequired: ["活动时间", "目标玩家", "奖励规则"],
      },
      {
        taskId: "approval-launch",
        title: "审批上线与奖励承诺",
        ownerRole: "运营负责人",
        status: "waiting_approval",
        due: "公开上线前",
        approvalRequired: true,
        evidenceRequired: ["公告草稿", "奖励配置截图", "回滚方案"],
      },
    ],
    missingInformation: [],
    audit: {
      retrievedChunkIds: ["campaign_checklist#launch-readiness"],
      validationNotes: ["sources checked"],
    },
  })),
  triageTicket: vi.fn(async () => ({
    workflow: "ticket_triage",
    category: "payment_reward",
    priority: "high",
    escalationPath: "如果订单核验显示已支付但奖励日志缺失，升级给支付/客服负责人处理。",
    suggestedReply: "请先提供订单 ID，我们会核验资格和日志后再确认奖励状态。",
    riskLevel: "high",
    sources: [
      {
        sourceId: "support_faq",
        title: "Support FAQ",
        section: "Missing rewards",
        path: "omnigent/gameops/data/support_faq.md",
        chunkId: "support_faq#missing-rewards",
      },
    ],
    nextActions: ["补齐工单缺失字段：订单 ID、活动 ID。"],
    executionTasks: [
      {
        taskId: "ticket-intake",
        title: "补齐工单必要信息",
        ownerRole: "客服受理人",
        status: "blocked",
        due: "首次处理结论前",
        approvalRequired: false,
        evidenceRequired: ["订单 ID", "活动 ID"],
      },
      {
        taskId: "exception-approval",
        title: "审批例外处理与玩家承诺",
        ownerRole: "运营负责人",
        status: "waiting_approval",
        due: "补偿或账号操作前",
        approvalRequired: true,
        evidenceRequired: ["负责人审批记录", "政策依据", "日志截图"],
      },
    ],
    missingInformation: ["order_id", "event_id"],
    audit: {
      retrievedChunkIds: ["support_faq#missing-rewards"],
      validationNotes: ["ticket classified"],
    },
  })),
  planIncident: vi.fn(async () => ({
    workflow: "incident_runbook",
    severity: "sev1",
    communicationCadence: "确认事故后 10 分钟内发送首次内部同步；稳定前每 15 分钟更新一次状态。",
    escalationPath: "立即指定事故指挥官、服务端排查负责人和客服话术负责人。",
    compensationGuidance: "审批完成前不要承诺高级货币补偿。",
    riskLevel: "critical",
    sources: [
      {
        sourceId: "incident_runbook",
        title: "Incident Runbook",
        section: "Communication cadence",
        path: "omnigent/gameops/data/incident_runbook.md",
        chunkId: "incident_runbook#communication-cadence",
      },
    ],
    nextActions: ["公开提及补偿前，必须先完成审批。"],
    executionTasks: [
      {
        taskId: "incident-room",
        title: "开启事故群并同步初始状态",
        ownerRole: "事故指挥官",
        status: "pending",
        due: "立即",
        approvalRequired: false,
        evidenceRequired: ["事故群链接", "当前状态摘要"],
      },
      {
        taskId: "approval-compensation",
        title: "审批补偿与公告口径",
        ownerRole: "运营负责人",
        status: "waiting_approval",
        due: "对外公告前",
        approvalRequired: true,
        evidenceRequired: ["补偿方案", "影响范围", "公告草稿"],
      },
    ],
    missingInformation: ["detected_at"],
    audit: {
      retrievedChunkIds: ["incident_runbook#communication-cadence"],
      validationNotes: ["incident planned"],
    },
  })),
}));

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <GameOpsPage />
    </QueryClientProvider>,
  );
}

describe("GameOpsPage", () => {
  it("presents GameOps Agent as the first screen", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "GameOps 智能运营助手" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "知识库" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "活动" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "工单" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "事故" })).toBeInTheDocument();
    expect(screen.queryByText("Codex")).not.toBeInTheDocument();
    expect(screen.queryByText("Claude")).not.toBeInTheDocument();
  });

  it("keeps the GameOps workspace scrollable inside the app shell", () => {
    renderPage();

    expect(screen.getByTestId("gameops-page")).toHaveClass("overflow-hidden");
    expect(screen.getByTestId("gameops-workspace")).toHaveClass("overflow-y-auto");
  });

  it("submits a business question and renders structured answer sections", async () => {
    renderPage();

    fireEvent.change(screen.getByLabelText("GameOps 问题"), {
      target: { value: "A player missed the recharge rebate reward." },
    });
    fireEvent.click(screen.getByRole("button", { name: "向 GameOps 提问" }));

    await waitFor(() => expect(screen.getByText(/客服应先核验资格/)).toBeInTheDocument());
    expect(screen.getByText("来源依据")).toBeInTheDocument();
    expect(screen.getByText("后续动作")).toBeInTheDocument();
    expect(screen.getByText("风险：中")).toBeInTheDocument();
  });

  it("drafts a campaign and renders launch review sections", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("tab", { name: "活动" }));
    fireEvent.change(screen.getByLabelText("活动名称"), {
      target: { value: "Weekend Recharge Sprint" },
    });
    fireEvent.change(screen.getByLabelText("目标玩家"), {
      target: { value: "all servers" },
    });
    fireEvent.change(screen.getByLabelText("开始时间"), {
      target: { value: "Friday" },
    });
    fireEvent.change(screen.getByLabelText("结束时间"), {
      target: { value: "Sunday" },
    });
    fireEvent.change(screen.getByLabelText("奖励规则"), {
      target: { value: "Recharge 10 USD to receive 120 gems." },
    });
    fireEvent.change(screen.getByLabelText("参与资格"), {
      target: { value: "Level 10 accounts." },
    });
    fireEvent.change(screen.getByLabelText("回滚方案"), {
      target: { value: "Disable event flag." },
    });
    fireEvent.click(screen.getByRole("button", { name: "生成活动方案" }));

    await waitFor(() => expect(screen.getByText("活动时间：周五 至 周日。")).toBeInTheDocument());
    expect(screen.getByText("上线检查")).toBeInTheDocument();
    expect(screen.getByText("客服 FAQ")).toBeInTheDocument();
    expect(screen.getByText("风险：高")).toBeInTheDocument();
    expect(screen.getByText("上线闭环")).toBeInTheDocument();
    expect(screen.getByText("复核活动配置与奖励规则")).toBeInTheDocument();
    expect(screen.getByText("负责人：活动运营负责人")).toBeInTheDocument();
    expect(screen.getByText("上线审批材料")).toBeInTheDocument();
    expect(screen.getByText("待审批")).toBeInTheDocument();
    expect(screen.getAllByText("公告草稿").length).toBeGreaterThan(0);
    expect(screen.getAllByText("奖励配置截图").length).toBeGreaterThan(0);
  });

  it("triages a support ticket and renders priority and escalation guidance", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("tab", { name: "工单" }));
    fireEvent.change(screen.getByLabelText("工单内容"), {
      target: { value: "Payment succeeded but reward is missing." },
    });
    fireEvent.change(screen.getByLabelText("玩家 ID"), {
      target: { value: "player-123" },
    });
    fireEvent.change(screen.getByLabelText("服务器 ID"), {
      target: { value: "s1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "分诊工单" }));

    await waitFor(() => expect(screen.getByText("支付与奖励问题")).toBeInTheDocument());
    expect(screen.getByText("优先级：高")).toBeInTheDocument();
    expect(screen.getByText(/升级给支付\/客服负责人/)).toBeInTheDocument();
    expect(screen.getByText("处理闭环")).toBeInTheDocument();
    expect(screen.getByText("补齐工单必要信息")).toBeInTheDocument();
    expect(screen.getByText("负责人：客服受理人")).toBeInTheDocument();
    expect(screen.getByText("阻塞")).toBeInTheDocument();
    expect(screen.getByText("负责人审批记录")).toBeInTheDocument();
    expect(screen.getByText("缺失信息")).toBeInTheDocument();
    expect(screen.getAllByText("订单 ID").length).toBeGreaterThan(0);
  });

  it("plans an incident runbook with severity, cadence, and compensation guidance", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("tab", { name: "事故" }));
    fireEvent.change(screen.getByLabelText("事故摘要"), {
      target: { value: "Login failures across all servers" },
    });
    fireEvent.change(screen.getByLabelText("受影响服务"), {
      target: { value: "login, matchmaking" },
    });
    fireEvent.change(screen.getByLabelText("玩家影响"), {
      target: { value: "Players cannot enter the game" },
    });
    fireEvent.change(screen.getByLabelText("持续分钟数"), {
      target: { value: "35" },
    });
    fireEvent.change(screen.getByLabelText("补偿设想"), {
      target: { value: "Send premium currency to all players." },
    });
    fireEvent.click(screen.getByRole("button", { name: "生成事故处置手册" }));

    await waitFor(() => expect(screen.getByText("SEV1")).toBeInTheDocument());
    expect(screen.getAllByText("通信节奏").length).toBeGreaterThan(0);
    expect(screen.getByText(/15 分钟/)).toBeInTheDocument();
    expect(screen.getByText("补偿建议")).toBeInTheDocument();
    expect(screen.getByText("事故处置手册")).toBeInTheDocument();
    expect(screen.getByText(/审批完成前不要承诺/)).toBeInTheDocument();
    expect(screen.getByText("执行闭环")).toBeInTheDocument();
    expect(screen.getByText("开启事故群并同步初始状态")).toBeInTheDocument();
    expect(screen.getByText("负责人：事故指挥官")).toBeInTheDocument();
    expect(screen.getByText("待审批")).toBeInTheDocument();
    expect(screen.getByText("补偿方案")).toBeInTheDocument();
    expect(screen.getAllByText("事故手册").length).toBeGreaterThan(0);
    expect(screen.getAllByText("通信节奏").length).toBeGreaterThan(0);
    expect(screen.getAllByText("内置知识库").length).toBeGreaterThan(0);
    expect(screen.queryByText("Incident Runbook")).not.toBeInTheDocument();
    expect(screen.queryByText("omnigent/gameops/data/incident_runbook.md")).not.toBeInTheDocument();
  });
});
