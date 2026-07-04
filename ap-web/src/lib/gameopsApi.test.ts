import { describe, expect, it, vi } from "vitest";
import {
  approveExecutionTask,
  askGameOps,
  draftCampaign,
  getEnterpriseReadiness,
  listExecutionHistory,
  listExecutionPolicy,
  listExecutionReport,
  registerExecutionTasks,
  planIncident,
  runExecutionTask,
  triageTicket,
} from "./gameopsApi";
import { authenticatedFetch } from "./identity";

vi.mock("./identity", () => ({
  authenticatedFetch: vi.fn(async (url: string) => {
    if (url === "/v1/gameops/execution/approve") {
      return new Response(
        JSON.stringify({
          task: {
            task_id: "approval-launch",
            title: "审批上线与奖励承诺",
            owner_role: "运营负责人",
            status: "pending",
            due: "公开上线前",
            approval_required: true,
            evidence_required: ["公告草稿", "奖励配置截图", "回滚方案"],
            approved_by: "ops-lead",
            approval_comment: "材料齐全。",
          },
          tool_result: {
            tool_name: "gameops.approval_gate",
            status: "success",
            summary: "审批已通过，任务可进入执行。",
            evidence: { approver: "ops-lead" },
            receipt: null,
          },
          missing_evidence: [],
          approval_required: false,
          precheck_items: [
            {
              check_id: "approval",
              label: "审批状态",
              status: "pass",
              detail: "已由 ops-lead 审批。",
            },
          ],
          loop_steps: [],
          recovery_actions: [],
          audit: {
            retrieved_chunk_ids: [],
            validation_notes: ["审批人 ops-lead 已批准该任务。"],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url === "/v1/gameops/execution/run") {
      return new Response(
        JSON.stringify({
          task: {
            task_id: "approval-launch",
            title: "审批上线与奖励承诺",
            owner_role: "运营负责人",
            status: "done",
            due: "公开上线前",
            approval_required: true,
            evidence_required: ["公告草稿", "奖励配置截图", "回滚方案"],
            approved_by: "ops-lead",
            approval_comment: "材料齐全。",
          },
          tool_result: {
            tool_name: "campaign.launch_approval",
            status: "success",
            summary: "上线审批材料已通过并记录。",
            evidence: { operator: "ops-owner", approver: "ops-lead" },
            receipt: {
              system: "活动发布审批台",
              operation: "记录上线审批",
              reference_id: "tool-campaign-launch-approval-approval-launch",
              dry_run: true,
              written_fields: ["公告草稿", "奖励配置截图", "回滚方案", "operator", "approver"],
              verification_notes: [
                "工具回执已生成",
                "写入字段已和执行证据对齐",
                "执行结果可用于审计追踪",
              ],
            },
          },
          missing_evidence: [],
          approval_required: false,
          precheck_items: [
            {
              check_id: "evidence",
              label: "证据完整性",
              status: "pass",
              detail: "已提交 3 项必要证据。",
            },
            {
              check_id: "approval",
              label: "审批状态",
              status: "pass",
              detail: "已由 ops-lead 审批。",
            },
            {
              check_id: "task_state",
              label: "任务状态",
              status: "pass",
              detail: "任务状态允许执行。",
            },
            {
              check_id: "tool_binding",
              label: "工具绑定",
              status: "pass",
              detail: "将调用内置工具 campaign.launch_approval。",
            },
          ],
          loop_steps: [
            { phase: "precheck", status: "success", summary: "前置条件已通过。" },
            {
              phase: "execute",
              status: "success",
              summary: "已调用内置工具 campaign.launch_approval。",
            },
            { phase: "verify", status: "success", summary: "工具结果和证据已完成一致性校验。" },
            { phase: "state_update", status: "success", summary: "任务状态已回写为已完成。" },
          ],
          recovery_actions: [],
          audit: {
            retrieved_chunk_ids: [],
            validation_notes: ["任务已完成，工具执行结果已写入审计记录。"],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url === "/v1/gameops/execution/history") {
      return new Response(
        JSON.stringify({
          records: [
            {
              record_id: "exec-1",
              created_at: "2026-07-04T14:00:00+00:00",
              action: "approve",
              actor: "ops-lead",
              task_id: "approval-launch",
              task_title: "审批上线与奖励承诺",
              tool_name: "gameops.approval_gate",
              status: "success",
              summary: "审批已通过，任务可进入执行。",
              evidence: { approver: "ops-lead" },
              validation_notes: ["审批人 ops-lead 已批准该任务。"],
            },
            {
              record_id: "exec-2",
              created_at: "2026-07-04T14:01:00+00:00",
              action: "run",
              actor: "ops-owner",
              task_id: "approval-launch",
              task_title: "审批上线与奖励承诺",
              tool_name: "campaign.launch_approval",
              status: "success",
              summary: "上线审批材料已通过并记录。",
              evidence: {
                operator: "ops-owner",
                公告草稿: "周末充值冲刺公告 v1",
                奖励配置截图: "reward-config.png",
              },
              validation_notes: ["任务已完成，工具执行结果已写入审计记录。"],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url === "/v1/gameops/execution/policy") {
      return new Response(
        JSON.stringify({
          rules: [
            {
              task_id: "approval-launch",
              title: "审批上线与奖励承诺",
              tool_name: "campaign.launch_approval",
              target_system: "活动发布审批台",
              operation: "记录上线审批",
              required_role: "运营负责人",
              risk_level: "high",
              retry_policy: {
                max_attempts: 2,
                backoff_seconds: 30,
              },
              failure_mode: "manual_handoff",
              approval_required: true,
              evidence_required: ["公告草稿", "奖励配置截图", "回滚方案"],
              guardrails: ["高价值奖励上线前必须审批，不调用外部 Agent 自动批准。"],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url === "/v1/gameops/enterprise/readiness") {
      return new Response(
        JSON.stringify({
          overall_status: "warning",
          integration_mode: "enterprise-pilot",
          dry_run: true,
          tool_count: 16,
          items: [
            {
              component: "业务工具适配器",
              status: "warning",
              summary: "当前工具层生成可审计 dry-run 回执。",
              detail: "默认不直接写生产系统。",
              remediation: "接入企业内部 API。",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url === "/v1/gameops/execution/report") {
      return new Response(
        JSON.stringify({
          generated_at: "2026-07-04T14:02:00+00:00",
          record_count: 2,
          markdown:
            "# GameOps 执行审计交接报告\n\n- 审计记录数：2\n\n## exec-2｜审批上线与奖励承诺\n- 工具：campaign.launch_approval\n- 证据：公告草稿、奖励配置截图、回滚方案、operator、approver\n- 结论：上线审批材料已通过并记录。",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url === "/v1/gameops/execution/tasks") {
      return new Response(
        JSON.stringify({
          tasks: [
            {
              task_id: "approval-launch",
              title: "审批上线与奖励承诺",
              owner_role: "运营负责人",
              status: "pending",
              due: "公开上线前",
              approval_required: true,
              evidence_required: ["公告草稿", "奖励配置截图", "回滚方案"],
              approved_by: "ops-lead",
              approval_comment: "材料齐全。",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
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

  it("approves and runs an execution task through the first-party tool API", async () => {
    const task = {
      taskId: "approval-launch",
      title: "审批上线与奖励承诺",
      ownerRole: "运营负责人",
      status: "waiting_approval" as const,
      due: "公开上线前",
      approvalRequired: true,
      evidenceRequired: ["公告草稿", "奖励配置截图", "回滚方案"],
    };

    const approved = await approveExecutionTask({
      task,
      approver: "ops-lead",
      decision: "approved",
      comment: "材料齐全。",
    });
    const executed = await runExecutionTask({
      task: approved.task,
      operator: "ops-owner",
      evidence: {
        公告草稿: "周末充值冲刺公告 v1",
        奖励配置截图: "reward-config.png",
        回滚方案: "关闭活动开关并发布更正公告",
      },
    });

    expect(authenticatedFetch).toHaveBeenCalledWith(
      "/v1/gameops/execution/approve",
      expect.objectContaining({ method: "POST" }),
    );
    expect(authenticatedFetch).toHaveBeenCalledWith(
      "/v1/gameops/execution/run",
      expect.objectContaining({ method: "POST" }),
    );
    expect(approved.task.status).toBe("pending");
    expect(approved.task.approvedBy).toBe("ops-lead");
    expect(executed.task.status).toBe("done");
    expect(executed.toolResult.toolName).toBe("campaign.launch_approval");
    expect(executed.toolResult.evidence.approver).toBe("ops-lead");
    expect(executed.toolResult.receipt).toEqual({
      system: "活动发布审批台",
      operation: "记录上线审批",
      referenceId: "tool-campaign-launch-approval-approval-launch",
      dryRun: true,
      writtenFields: ["公告草稿", "奖励配置截图", "回滚方案", "operator", "approver"],
      verificationNotes: ["工具回执已生成", "写入字段已和执行证据对齐", "执行结果可用于审计追踪"],
    });
    expect(executed.precheckItems.map((item) => item.label)).toEqual([
      "证据完整性",
      "审批状态",
      "任务状态",
      "工具绑定",
    ]);
    expect(executed.precheckItems[0]?.detail).toBe("已提交 3 项必要证据。");
    expect(executed.loopSteps.map((step) => step.phase)).toEqual([
      "precheck",
      "execute",
      "verify",
      "state_update",
    ]);
    expect(executed.loopSteps[2]?.summary).toBe("工具结果和证据已完成一致性校验。");
    expect(executed.recoveryActions).toEqual([]);
    expect(executed.audit.validationNotes[0]).toContain("工具执行结果");
  });

  it("lists execution history records", async () => {
    const history = await listExecutionHistory();

    expect(authenticatedFetch).toHaveBeenCalledWith(
      "/v1/gameops/execution/history",
      expect.objectContaining({ method: "GET" }),
    );
    expect(history.records).toHaveLength(2);
    expect(history.records[0]?.action).toBe("approve");
    expect(history.records[0]?.actor).toBe("ops-lead");
    expect(history.records[0]?.createdAt).toBe("2026-07-04T14:00:00+00:00");
    expect(history.records[0]?.evidence.approver).toBe("ops-lead");
    expect(history.records[1]?.toolName).toBe("campaign.launch_approval");
    expect(history.records[1]?.createdAt).toBe("2026-07-04T14:01:00+00:00");
    expect(history.records[1]?.evidence["公告草稿"]).toBe("周末充值冲刺公告 v1");
    expect(history.records[1]?.validationNotes[0]).toContain("工具执行结果");
  });

  it("lists execution policy rules", async () => {
    const policy = await listExecutionPolicy();

    expect(authenticatedFetch).toHaveBeenCalledWith(
      "/v1/gameops/execution/policy",
      expect.objectContaining({ method: "GET" }),
    );
    expect(policy.rules[0]?.taskId).toBe("approval-launch");
    expect(policy.rules[0]?.toolName).toBe("campaign.launch_approval");
    expect(policy.rules[0]?.targetSystem).toBe("活动发布审批台");
    expect(policy.rules[0]?.operation).toBe("记录上线审批");
    expect(policy.rules[0]?.requiredRole).toBe("运营负责人");
    expect(policy.rules[0]?.riskLevel).toBe("high");
    expect(policy.rules[0]?.retryPolicy).toEqual({ maxAttempts: 2, backoffSeconds: 30 });
    expect(policy.rules[0]?.failureMode).toBe("manual_handoff");
    expect(policy.rules[0]?.approvalRequired).toBe(true);
    expect(policy.rules[0]?.evidenceRequired).toContain("奖励配置截图");
    expect(policy.rules[0]?.guardrails[0]).toContain("不调用外部 Agent");
  });

  it("loads enterprise readiness checks", async () => {
    const readiness = await getEnterpriseReadiness();

    expect(authenticatedFetch).toHaveBeenCalledWith(
      "/v1/gameops/enterprise/readiness",
      expect.objectContaining({ method: "GET" }),
    );
    expect(readiness.overallStatus).toBe("warning");
    expect(readiness.integrationMode).toBe("enterprise-pilot");
    expect(readiness.dryRun).toBe(true);
    expect(readiness.toolCount).toBe(16);
    expect(readiness.items[0]).toMatchObject({
      component: "业务工具适配器",
      status: "warning",
      remediation: "接入企业内部 API。",
    });
  });

  it("loads execution handoff report", async () => {
    const report = await listExecutionReport();

    expect(authenticatedFetch).toHaveBeenCalledWith(
      "/v1/gameops/execution/report",
      expect.objectContaining({ method: "GET" }),
    );
    expect(report.recordCount).toBe(2);
    expect(report.generatedAt).toBe("2026-07-04T14:02:00+00:00");
    expect(report.markdown).toContain("GameOps 执行审计交接报告");
    expect(report.markdown).toContain("campaign.launch_approval");
  });

  it("registers execution tasks and converts persisted task state", async () => {
    const tasks = await registerExecutionTasks([
      {
        taskId: "approval-launch",
        title: "审批上线与奖励承诺",
        ownerRole: "运营负责人",
        status: "waiting_approval",
        due: "公开上线前",
        approvalRequired: true,
        evidenceRequired: ["公告草稿", "奖励配置截图", "回滚方案"],
      },
    ]);

    expect(authenticatedFetch).toHaveBeenCalledWith(
      "/v1/gameops/execution/tasks",
      expect.objectContaining({ method: "POST" }),
    );
    expect(tasks.tasks).toHaveLength(1);
    expect(tasks.tasks[0]?.taskId).toBe("approval-launch");
    expect(tasks.tasks[0]?.status).toBe("pending");
    expect(tasks.tasks[0]?.approvedBy).toBe("ops-lead");
  });
});
