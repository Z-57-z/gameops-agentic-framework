import { describe, expect, it, vi } from "vitest";
import { askGameOps, draftCampaign, planIncident, triageTicket } from "./gameopsApi";
import { authenticatedFetch } from "./identity";

vi.mock("./identity", () => ({
  authenticatedFetch: vi.fn(async (url: string) => {
    if (url === "/v1/gameops/incidents/runbook") {
      return new Response(
        JSON.stringify({
          workflow: "incident_runbook",
          severity: "sev1",
          communication_cadence: "Update every 15 minutes until stable.",
          escalation_path: "Assign an incident commander and response owners.",
          compensation_guidance: "Get approval before promising premium currency.",
          risk_level: "critical",
          sources: [
            {
              source_id: "incident_runbook",
              title: "Incident Runbook",
              section: "Communication cadence",
              path: "omnigent/gameops/data/incident_runbook.md",
              chunk_id: "incident_runbook#communication-cadence",
            },
          ],
          next_actions: ["Get approval before mentioning compensation."],
          execution_tasks: [
            {
              task_id: "incident-room",
              title: "开启事故群并同步初始状态",
              owner_role: "事故指挥官",
              status: "pending",
              due: "立即",
              approval_required: false,
              evidence_required: ["事故群链接", "当前状态摘要"],
            },
            {
              task_id: "approval-compensation",
              title: "审批补偿与公告口径",
              owner_role: "运营负责人",
              status: "waiting_approval",
              due: "对外公告前",
              approval_required: true,
              evidence_required: ["补偿方案", "影响范围", "公告草稿"],
            },
          ],
          missing_information: ["detected_at"],
          audit: {
            retrieved_chunk_ids: ["incident_runbook#communication-cadence"],
            validation_notes: ["incident planned"],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url === "/v1/gameops/tickets/triage") {
      return new Response(
        JSON.stringify({
          workflow: "ticket_triage",
          category: "payment_reward",
          priority: "high",
          escalation_path: "Escalate to billing/support lead after order verification.",
          suggested_reply: "Please provide the order id before we confirm the reward status.",
          risk_level: "high",
          sources: [
            {
              source_id: "support_faq",
              title: "Support FAQ",
              section: "Missing rewards",
              path: "omnigent/gameops/data/support_faq.md",
              chunk_id: "support_faq#missing-rewards",
            },
          ],
          next_actions: ["Collect order_id and event_id."],
          execution_tasks: [
            {
              task_id: "ticket-intake",
              title: "补齐工单必要信息",
              owner_role: "客服受理人",
              status: "blocked",
              due: "首次处理结论前",
              approval_required: false,
              evidence_required: ["订单 ID", "活动 ID"],
            },
            {
              task_id: "exception-approval",
              title: "审批例外处理与玩家承诺",
              owner_role: "运营负责人",
              status: "waiting_approval",
              due: "补偿或账号操作前",
              approval_required: true,
              evidence_required: ["负责人审批记录", "政策依据", "日志截图"],
            },
          ],
          missing_information: ["order_id", "event_id"],
          audit: {
            retrieved_chunk_ids: ["support_faq#missing-rewards"],
            validation_notes: ["ticket classified"],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url === "/v1/gameops/campaign/draft") {
      return new Response(
        JSON.stringify({
          workflow: "campaign_ops",
          announcement_title: "Weekend Recharge Sprint",
          announcement_body: "Event window: Friday to Sunday.",
          support_faq: ["Who is eligible? Level 10 accounts."],
          launch_checks: [{ label: "Event window", status: "pass", detail: "Friday to Sunday" }],
          risk_level: "high",
          sources: [
            {
              source_id: "campaign_checklist",
              title: "Campaign Checklist",
              section: "Launch readiness",
              path: "omnigent/gameops/data/campaign_checklist.md",
              chunk_id: "campaign_checklist#launch-readiness",
            },
          ],
          next_actions: ["Get ops lead approval before public launch."],
          execution_tasks: [
            {
              task_id: "campaign-config",
              title: "复核活动配置与奖励规则",
              owner_role: "活动运营负责人",
              status: "pending",
              due: "上线前",
              approval_required: false,
              evidence_required: ["活动时间", "目标玩家", "奖励规则"],
            },
            {
              task_id: "approval-launch",
              title: "审批上线与奖励承诺",
              owner_role: "运营负责人",
              status: "waiting_approval",
              due: "公开上线前",
              approval_required: true,
              evidence_required: ["公告草稿", "奖励配置截图", "回滚方案"],
            },
          ],
          missing_information: [],
          audit: {
            retrieved_chunk_ids: ["campaign_checklist#launch-readiness"],
            validation_notes: ["sources checked"],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({
        answer: "Check launch readiness.",
        workflow: "campaign_ops",
        risk_level: "medium",
        sources: [
          {
            source_id: "campaign_checklist",
            title: "Campaign Checklist",
            section: "Launch readiness",
            path: "omnigent/gameops/data/campaign_checklist.md",
            chunk_id: "campaign_checklist#launch-readiness",
          },
        ],
        next_actions: ["Confirm start and end time"],
        missing_information: [],
        confidence: 0.82,
        audit: {
          retrieved_chunk_ids: ["campaign_checklist#launch-readiness"],
          validation_notes: ["sources checked"],
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }),
}));

describe("askGameOps", () => {
  it("posts a GameOps request and converts the structured response", async () => {
    const result = await askGameOps({ question: "Check launch setup", mode: "campaign" });

    expect(authenticatedFetch).toHaveBeenCalledWith(
      "/v1/gameops/ask",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.workflow).toBe("campaign_ops");
    expect(result.riskLevel).toBe("medium");
    expect(result.sources[0]?.sourceId).toBe("campaign_checklist");
    expect(result.audit.retrievedChunkIds).toEqual(["campaign_checklist#launch-readiness"]);
  });

  it("converts a campaign draft response", async () => {
    const result = await draftCampaign({
      campaignName: "Weekend Recharge Sprint",
      audience: "all servers",
      startTime: "Friday",
      endTime: "Sunday",
      rewardRules: "Recharge 10 USD to receive 120 gems.",
      eligibility: "Level 10 accounts.",
      rollbackPlan: "Disable event flag.",
    });

    expect(authenticatedFetch).toHaveBeenCalledWith(
      "/v1/gameops/campaign/draft",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.announcementTitle).toBe("Weekend Recharge Sprint");
    expect(result.launchChecks[0]?.status).toBe("pass");
    expect(result.riskLevel).toBe("high");
    expect(result.executionTasks[0]?.ownerRole).toBe("活动运营负责人");
    expect(result.executionTasks.some((task) => task.status === "waiting_approval")).toBe(true);
    expect(result.executionTasks[1]?.evidenceRequired).toContain("公告草稿");
  });

  it("converts a ticket triage response", async () => {
    const result = await triageTicket({
      ticketText: "Payment succeeded but reward is missing.",
      playerId: "player-123",
      serverId: "s1",
    });

    expect(authenticatedFetch).toHaveBeenCalledWith(
      "/v1/gameops/tickets/triage",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.workflow).toBe("ticket_triage");
    expect(result.category).toBe("payment_reward");
    expect(result.priority).toBe("high");
    expect(result.executionTasks[0]?.ownerRole).toBe("客服受理人");
    expect(result.executionTasks.some((task) => task.status === "blocked")).toBe(true);
    expect(result.executionTasks[1]?.approvalRequired).toBe(true);
    expect(result.missingInformation).toEqual(["order_id", "event_id"]);
  });

  it("converts an incident runbook response", async () => {
    const result = await planIncident({
      incidentSummary: "Login failures across all servers",
      affectedServices: "login, matchmaking",
      impact: "Players cannot enter the game",
      durationMinutes: 35,
    });

    expect(authenticatedFetch).toHaveBeenCalledWith(
      "/v1/gameops/incidents/runbook",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.workflow).toBe("incident_runbook");
    expect(result.severity).toBe("sev1");
    expect(result.riskLevel).toBe("critical");
    expect(result.communicationCadence).toContain("15 minutes");
    expect(result.executionTasks[0]?.ownerRole).toBe("事故指挥官");
    expect(result.executionTasks.some((task) => task.status === "waiting_approval")).toBe(true);
    expect(result.executionTasks[1]?.evidenceRequired).toContain("补偿方案");
    expect(result.missingInformation).toEqual(["detected_at"]);
  });
});
