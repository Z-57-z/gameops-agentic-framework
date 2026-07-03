import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentTerminalPage } from "./AgentTerminalPage";
import type { Conversation } from "@/hooks/useConversations";
import { useConversations } from "@/hooks/useConversations";
import { useSessionRunnerOnline } from "@/hooks/RunnerHealthProvider";
import { useSession } from "@/hooks/useSession";
import { type TerminalInfo, useTerminals } from "@/hooks/useTerminals";
import type { Session } from "@/lib/types";

vi.mock("@/components/blocks/TerminalView", () => ({
  TerminalView: ({
    sessionId,
    terminalId,
    readOnly,
    onStateChange,
    onActivity,
    onInput,
  }: {
    sessionId: string;
    terminalId: string;
    readOnly?: boolean;
    onStateChange?: (state: { kind: "connected" } | { kind: "error" } | null) => void;
    onActivity?: () => void;
    onInput?: () => void;
  }) => (
    <div
      data-testid="terminal-view"
      data-session-id={sessionId}
      data-terminal-id={terminalId}
      data-read-only={String(readOnly ?? false)}
    >
      <button type="button" onClick={() => onStateChange?.({ kind: "connected" })}>
        mock connect
      </button>
      <button type="button" onClick={() => onStateChange?.({ kind: "error" })}>
        mock error
      </button>
      <button
        type="button"
        onClick={() => {
          onActivity?.();
          onInput?.();
        }}
      >
        mock io
      </button>
    </div>
  ),
}));

vi.mock("@/hooks/useConversations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useConversations")>()),
  useConversations: vi.fn(),
}));
vi.mock("@/hooks/useSession", () => ({ useSession: vi.fn() }));
vi.mock("@/hooks/RunnerHealthProvider", () => ({
  useSessionRunnerOnline: vi.fn(),
}));
vi.mock("@/hooks/useTerminals", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useTerminals")>()),
  useTerminals: vi.fn(),
}));

const useConversationsMock = vi.mocked(useConversations);
const useSessionMock = vi.mocked(useSession);
const useSessionRunnerOnlineMock = vi.mocked(useSessionRunnerOnline);
const useTerminalsMock = vi.mocked(useTerminals);

const AGENT_TERMINAL: TerminalInfo = {
  id: "terminal_tui_main",
  name: "tui",
  session: "main",
  running: true,
};
const SHELL_TERMINAL: TerminalInfo = {
  id: "terminal_bash_s1",
  name: "bash",
  session: "s1",
  running: true,
};

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: "conv_abc",
    object: "conversation",
    title: "GameOps demo",
    created_at: 1,
    updated_at: 2,
    labels: {},
    permission_level: null,
    archived: false,
    agent_name: "gameops-agent",
    ...overrides,
  };
}

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: "conv_abc",
    agentId: "ag_gameops",
    agentName: "gameops-agent",
    status: "running",
    createdAt: 1,
    title: "GameOps demo",
    items: [],
    permissionLevel: null,
    ...overrides,
  } as Session;
}

function conversationsStub(rows: Conversation[] = [conversation()]) {
  return {
    data: { pages: [{ data: rows }] },
    isLoading: false,
  } as unknown as ReturnType<typeof useConversations>;
}

function renderPage(path = "/c/conv_abc/terminal") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/c/:conversationId/terminal" element={<AgentTerminalPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useConversationsMock.mockReturnValue(conversationsStub());
  useSessionMock.mockReturnValue({ session: session(), isLoading: false, error: null });
  useSessionRunnerOnlineMock.mockReturnValue(true);
  useTerminalsMock.mockReturnValue({
    terminals: [AGENT_TERMINAL, SHELL_TERMINAL],
    isLoading: false,
    error: null,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AgentTerminalPage", () => {
  it("prefers the agent terminal as the main visual console", () => {
    renderPage();

    expect(screen.getByText("Agent Terminal Console")).toBeInTheDocument();
    expect(screen.getAllByText("Agent TTY").length).toBeGreaterThan(0);
    expect(screen.getByTestId("terminal-view")).toHaveAttribute("data-session-id", "conv_abc");
    expect(screen.getByTestId("terminal-view")).toHaveAttribute(
      "data-terminal-id",
      "terminal_tui_main",
    );
  });

  it("falls back to a user shell and labels the fallback clearly", () => {
    useTerminalsMock.mockReturnValue({
      terminals: [SHELL_TERMINAL],
      isLoading: false,
      error: null,
    });

    renderPage();

    expect(screen.getAllByText("Shell fallback").length).toBeGreaterThan(0);
    expect(screen.getByTestId("terminal-view")).toHaveAttribute(
      "data-terminal-id",
      "terminal_bash_s1",
    );
  });

  it("shows a recoverable empty state when no terminal resources exist", () => {
    useTerminalsMock.mockReturnValue({ terminals: [], isLoading: false, error: null });

    renderPage();

    expect(screen.getByText("No terminal resources found")).toBeInTheDocument();
    expect(screen.getByText(/Return to chat and send a message/)).toBeInTheDocument();
    expect(screen.queryByTestId("terminal-view")).toBeNull();
  });

  it("attaches read-only for non-owner viewers", () => {
    useSessionMock.mockReturnValue({
      session: session({ permissionLevel: 1 }),
      isLoading: false,
      error: null,
    });

    renderPage();

    expect(screen.getByTestId("terminal-view")).toHaveAttribute("data-read-only", "true");
    expect(screen.getByText("Read-only")).toBeInTheDocument();
  });

  it("updates bridge status from TerminalView callbacks", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "mock connect" }));

    expect(screen.getAllByText("Bridge connected").length).toBeGreaterThan(0);
  });

  it("can switch from the preferred agent terminal to another resource", () => {
    renderPage();

    const resources = screen.getByText("Terminal resources").closest("div")?.parentElement;
    expect(resources).not.toBeNull();
    fireEvent.click(within(resources as HTMLElement).getByText("bash"));

    expect(screen.getByTestId("terminal-view")).toHaveAttribute(
      "data-terminal-id",
      "terminal_bash_s1",
    );
  });
});
