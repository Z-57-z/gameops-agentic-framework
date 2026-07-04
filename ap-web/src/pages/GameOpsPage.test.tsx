import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GameOpsPage } from "./GameOpsPage";

vi.mock("@/lib/clipboard", () => ({
  copyText: vi.fn(async () => undefined),
}));

vi.mock("@/lib/gameopsApi", () => ({
  askGameOps: vi.fn(async () => ({
    answer: "Support should verify eligibility before promising compensation.",
    workflow: "knowledge_qa",
    riskLevel: "medium",
    sources: [
      {
        sourceId: "policy",
        title: "Policy",
        section: "Rewards",
        path: "policy.md",
        chunkId: "policy#rewards",
        lineStart: 1,
        lineEnd: 8,
      },
    ],
    nextActions: ["Verify eligibility", "Escalate exceptions"],
    missingInformation: [],
    confidence: 0.84,
    audit: { retrievedChunkIds: ["policy#rewards"], validationNotes: ["checked"] },
  })),
  draftCampaign: vi.fn(async () => ({
    workflow: "campaign_ops",
    announcementTitle: "Launch Review",
    announcementBody: "Announcement body",
    supportFaq: ["FAQ item"],
    launchChecks: [{ label: "Schedule", status: "pass", detail: "Ready" }],
    riskLevel: "high",
    sources: [],
    nextActions: ["Get approval"],
    executionTasks: [],
    missingInformation: [],
    audit: { retrievedChunkIds: [], validationNotes: ["campaign checked"] },
  })),
  triageTicket: vi.fn(async () => ({
    workflow: "ticket_triage",
    category: "payment_reward",
    priority: "high",
    escalationPath: "Escalate to support lead.",
    suggestedReply: "Ask for order details.",
    riskLevel: "high",
    sources: [],
    nextActions: ["Collect order id"],
    executionTasks: [],
    missingInformation: ["order_id"],
    audit: { retrievedChunkIds: [], validationNotes: ["ticket checked"] },
  })),
  planIncident: vi.fn(async () => ({
    workflow: "incident_runbook",
    severity: "sev1",
    communicationCadence: "Update every 15 minutes.",
    escalationPath: "Open incident room.",
    compensationGuidance: "Do not promise premium currency before approval.",
    riskLevel: "critical",
    sources: [],
    nextActions: ["Assign commander"],
    executionTasks: [],
    missingInformation: [],
    audit: { retrievedChunkIds: [], validationNotes: ["incident checked"] },
  })),
  registerExecutionTasks: vi.fn(async (tasks) => ({ tasks })),
  approveExecutionTask: vi.fn(),
  runExecutionTask: vi.fn(),
  listExecutionHistory: vi.fn(async () => ({ records: [] })),
  listExecutionReport: vi.fn(async () => ({
    generatedAt: "2026-07-05T00:00:00+00:00",
    recordCount: 0,
    markdown: "# GameOps Audit",
  })),
  listExecutionPolicy: vi.fn(async () => ({ rules: [] })),
  getEnterpriseReadiness: vi.fn(async () => ({
    overallStatus: "warning",
    integrationMode: "enterprise-pilot",
    dryRun: true,
    toolCount: 16,
    items: [
      {
        component: "Business adapters",
        status: "warning",
        summary: "Dry-run receipts are enabled.",
        detail: "Production systems are not mutated.",
        remediation: "Bind internal APIs before disabling dry-run.",
      },
    ],
  })),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

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

    expect(screen.getByRole("heading", { name: /GameOps/ })).toBeInTheDocument();
    expect(screen.getByTestId("gameops-page")).toBeInTheDocument();
    expect(screen.queryByText("Codex")).not.toBeInTheDocument();
    expect(screen.queryByText("Claude")).not.toBeInTheDocument();
  });

  it("keeps the GameOps workspace scrollable inside the app shell", () => {
    renderPage();

    expect(screen.getByTestId("gameops-page")).toHaveClass("overflow-hidden");
    expect(screen.getByTestId("gameops-workspace")).toHaveClass("overflow-y-auto");
  });

  it("starts without demo prompts or prefilled module data", () => {
    renderPage();

    expect(screen.queryAllByText(/player-123|Weekend|Recharge|周末|示例/)).toHaveLength(0);
    expect(
      screen
        .getAllByRole("textbox")
        .every(
          (field) => field.getAttribute("value") === null || field.getAttribute("value") === "",
        ),
    ).toBe(true);

    const tabs = screen.getAllByRole("tab");
    fireEvent.click(tabs[1]!);
    expect(
      screen
        .getAllByRole("textbox")
        .every(
          (field) => field.getAttribute("value") === null || field.getAttribute("value") === "",
        ),
    ).toBe(true);

    fireEvent.click(tabs[2]!);
    expect(
      screen
        .getAllByRole("textbox")
        .every(
          (field) => field.getAttribute("value") === null || field.getAttribute("value") === "",
        ),
    ).toBe(true);

    fireEvent.click(tabs[3]!);
    expect(
      screen
        .getAllByRole("textbox")
        .every(
          (field) => field.getAttribute("value") === null || field.getAttribute("value") === "",
        ),
    ).toBe(true);
  });

  it("shows enterprise readiness from the backend", async () => {
    renderPage();

    expect(await screen.findByTestId("enterprise-readiness-card")).toBeInTheDocument();
    expect(screen.getByText(/enterprise-pilot/)).toBeInTheDocument();
    expect(screen.getAllByText(/Dry-run/i).length).toBeGreaterThan(0);
  });

  it("submits a business question and renders structured answer sections", async () => {
    renderPage();

    fireEvent.change(screen.getAllByRole("textbox")[0]!, {
      target: { value: "A player missed a reward." },
    });
    fireEvent.click(screen.getByRole("button", { name: /GameOps/ }));

    await waitFor(() =>
      expect(screen.getByText(/Support should verify eligibility/)).toBeInTheDocument(),
    );
    expect(screen.getByTestId("result-flow")).toHaveClass("xl:columns-2");
  });
});
