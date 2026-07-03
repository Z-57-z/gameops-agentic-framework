import {
  ActivityIcon,
  AlertTriangleIcon,
  ArrowLeftIcon,
  Loader2Icon,
  RadioTowerIcon,
  ShieldCheckIcon,
  TerminalIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { TerminalView } from "@/components/blocks/TerminalView";
import type { ConnectionState } from "@/components/blocks/TerminalSession";
import { Button } from "@/components/ui/button";
import { useConversations } from "@/hooks/useConversations";
import { useSessionRunnerOnline } from "@/hooks/RunnerHealthProvider";
import { useSession } from "@/hooks/useSession";
import {
  AGENT_TERMINAL_IDS,
  selectPreferredTerminal,
  type TerminalInfo,
  useTerminals,
} from "@/hooks/useTerminals";
import { derivePermissionLevel, isOwnerLevel } from "@/lib/permissionsApi";
import { Link, useParams } from "@/lib/routing";
import { cn } from "@/lib/utils";
import { TerminalStatusBadge } from "@/shell/terminalStatus";
import { useTerminalStatuses } from "@/shell/useTerminalStatuses";

/**
 * Portfolio-ready terminal console for an existing agent session.
 *
 * This page intentionally reuses the established terminal resource protocol:
 * HTTP seeds terminal resources through `useTerminals`, and `TerminalView`
 * owns the xterm/WebSocket bridge. The page only adds demo-friendly runtime
 * chrome around that live PTY surface.
 */
export function AgentTerminalPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const sessionId = conversationId ?? null;
  const { session, isLoading: sessionLoading } = useSession(sessionId);
  const conversationsQuery = useConversations("", true);
  const activeConversation = useMemo(() => {
    if (!conversationId) return null;
    return (
      conversationsQuery.data?.pages.flatMap((page) => page.data).find((c) => c.id === conversationId) ??
      null
    );
  }, [conversationId, conversationsQuery.data]);
  const permissionLevel = derivePermissionLevel(
    session,
    sessionLoading,
    activeConversation,
    conversationId,
    conversationsQuery.data !== undefined,
  );
  const readOnly = !isOwnerLevel(permissionLevel);
  const runnerOnline = useSessionRunnerOnline(conversationId);
  const { terminals, isLoading: terminalsLoading, error: terminalsError } = useTerminals(sessionId, {
    reconcileWhilePending: session?.terminalPending ?? false,
  });
  const preferred = useMemo(() => selectPreferredTerminal(terminals), [terminals]);
  const [selectedTerminalId, setSelectedTerminalId] = useState<string | null>(null);
  const activeTerminal = useMemo(
    () => terminals.find((t) => t.id === selectedTerminalId) ?? preferred.terminal,
    [terminals, selectedTerminalId, preferred.terminal],
  );
  const activeKind = activeTerminal === null ? "none" : getRuntimeSurfaceKind(activeTerminal);
  const { getStatus, setTerminalConnectionState, markTerminalActive } = useTerminalStatuses(terminals);
  const [connectionState, setConnectionState] = useState<ConnectionState | null>(null);
  const [lastActivityAt, setLastActivityAt] = useState<number | null>(null);
  const [lastInputAt, setLastInputAt] = useState<number | null>(null);

  if (!conversationId) {
    return <TerminalShellState title="No session selected" description="Open a session first." />;
  }

  const title = session?.title ?? activeConversation?.title ?? conversationId;
  const agentName = session?.agentName ?? activeConversation?.agent_name ?? "Agent runtime";
  const permissionLabel = permissionLevel === null ? "Owner / single-user" : readOnly ? "Read-only" : "Owner";
  const runnerLabel = runnerOnline === true ? "Runner online" : runnerOnline === false ? "Runner offline" : "Runner unknown";
  const connectionLabel = connectionStateLabel(connectionState);
  const showLoading = terminalsLoading && terminals.length === 0;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[radial-gradient(circle_at_top_left,var(--muted),transparent_26rem),linear-gradient(135deg,var(--card),var(--card-solid))] px-4 pt-16 pb-4">
      <div className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:linear-gradient(var(--foreground)_1px,transparent_1px),linear-gradient(90deg,var(--foreground)_1px,transparent_1px)] [background-size:36px_36px]" />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-3">
        <header className="flex shrink-0 flex-col gap-3 rounded-xl border border-border/70 bg-card/85 p-3 shadow-sm backdrop-blur md:flex-row md:items-center md:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2 py-1 font-medium text-primary text-xs">
                <TerminalIcon className="size-3.5" />
                Agent Terminal Console
              </span>
              {activeKind === "agent" ? (
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-emerald-700 text-xs dark:text-emerald-300">
                  Agent TTY
                </span>
              ) : activeKind === "shell" ? (
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-700 text-xs dark:text-amber-300">
                  Shell fallback
                </span>
              ) : null}
            </div>
            <div className="min-w-0">
              <h1 className="truncate font-semibold text-foreground text-lg">{title}</h1>
              <p className="truncate text-muted-foreground text-sm">{agentName}</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <StatusPill label={runnerLabel} tone={runnerOnline === false ? "danger" : runnerOnline === true ? "ok" : "muted"} />
            <StatusPill label={connectionLabel} tone={connectionTone(connectionState)} />
            <StatusPill label={permissionLabel} tone={readOnly ? "warning" : "ok"} icon="shield" />
            <Button asChild variant="outline" size="sm">
              <Link to={`/c/${conversationId}`}>
                <ArrowLeftIcon className="size-3.5" />
                Back to chat
              </Link>
            </Button>
          </div>
        </header>

        <section className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_19rem]">
          <div className="flex min-h-[32rem] min-w-0 flex-col overflow-hidden rounded-xl border border-border/70 bg-card/95 shadow-lg">
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/70 px-3 py-2">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 font-medium text-xs">
                <RadioTowerIcon className="size-3.5 text-muted-foreground" />
                {activeTerminal ? activeTerminal.name || activeTerminal.id : "No terminal"}
                {activeTerminal?.session ? (
                  <span className="text-muted-foreground/70">- {activeTerminal.session}</span>
                ) : null}
              </span>
              {activeTerminal ? <TerminalStatusBadge status={getStatus(activeTerminal)} /> : null}
              <span className="ml-auto text-muted-foreground text-xs">
                WS attach - resource-addressed terminal
              </span>
            </div>
            <div className="min-h-0 flex-1 p-3">
              {showLoading ? (
                <TerminalShellState
                  title="Terminal resources loading..."
                  description="Waiting for the runner to publish terminal resources."
                  loading
                />
              ) : terminalsError ? (
                <TerminalShellState
                  title="Failed to load terminals"
                  description={terminalsError.message}
                  tone="danger"
                />
              ) : activeTerminal ? (
                <div className="h-full min-h-[26rem] overflow-hidden rounded-lg border border-border bg-card">
                  <TerminalView
                    key={activeTerminal.id}
                    sessionId={conversationId}
                    terminalId={activeTerminal.id}
                    readOnly={readOnly}
                    onStateChange={(state) => {
                      setConnectionState(state);
                      setTerminalConnectionState(activeTerminal.id, state);
                    }}
                    onActivity={() => {
                      setLastActivityAt(Date.now());
                      markTerminalActive(activeTerminal.id);
                    }}
                    onInput={() => setLastInputAt(Date.now())}
                  />
                </div>
              ) : (
                <TerminalShellState
                  title="No terminal resources found"
                  description="This session may not declare an agent terminal yet, or the runner is still starting. Return to chat and send a message to launch the agent runtime."
                />
              )}
            </div>
          </div>

          <aside className="flex min-h-0 flex-col gap-3">
            <RuntimeCard
              sessionId={conversationId}
              terminal={activeTerminal}
              runtimeSurfaceKind={activeKind}
              connectionLabel={connectionLabel}
              lastActivityAt={lastActivityAt}
              lastInputAt={lastInputAt}
              readOnly={readOnly}
            />
            <div className="min-h-0 rounded-xl border border-border/70 bg-card/90 p-3 shadow-sm">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="font-medium text-sm">Terminal resources</h2>
                <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs">
                  {terminals.length}
                </span>
              </div>
              {terminals.length === 0 ? (
                <p className="text-muted-foreground text-xs">
                  No open PTY resources are visible for this session yet.
                </p>
              ) : (
                <div className="flex max-h-72 flex-col gap-1 overflow-y-auto pr-1">
                  {terminals.map((terminal) => (
                    <button
                      key={terminal.id}
                      type="button"
                      onClick={() => {
                        setSelectedTerminalId(terminal.id);
                        setConnectionState(null);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg border px-2 py-2 text-left text-xs transition-colors",
                        activeTerminal?.id === terminal.id
                          ? "border-primary/40 bg-primary/10 text-foreground"
                          : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted",
                      )}
                    >
                      <TerminalIcon className="size-3.5 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{terminal.name || terminal.id}</span>
                        <span className="block truncate text-muted-foreground/75">
                          {terminal.session || terminal.id}
                        </span>
                      </span>
                      <TerminalStatusBadge status={getStatus(terminal)} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}

function getRuntimeSurfaceKind(terminal: TerminalInfo): "agent" | "shell" {
  return AGENT_TERMINAL_IDS.has(terminal.id) ? "agent" : "shell";
}

function connectionStateLabel(state: ConnectionState | null): string {
  if (state === null) return "Bridge idle";
  if (state.kind === "connecting") return "Bridge connecting";
  if (state.kind === "connected") return "Bridge connected";
  if (state.kind === "error") return "Bridge error";
  return state.reason ? `Bridge closed: ${state.reason}` : "Bridge closed";
}

function connectionTone(state: ConnectionState | null): "ok" | "warning" | "danger" | "muted" {
  if (state?.kind === "connected") return "ok";
  if (state?.kind === "connecting") return "warning";
  if (state?.kind === "error" || state?.kind === "closed") return "danger";
  return "muted";
}

function StatusPill({
  label,
  tone,
  icon,
}: {
  label: string;
  tone: "ok" | "warning" | "danger" | "muted";
  icon?: "shield";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs",
        tone === "ok" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        tone === "warning" && "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        tone === "danger" && "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
        tone === "muted" && "border-border bg-muted text-muted-foreground",
      )}
    >
      {icon === "shield" ? <ShieldCheckIcon className="size-3.5" /> : <span className="size-1.5 rounded-full bg-current" />}
      {label}
    </span>
  );
}

function RuntimeCard({
  sessionId,
  terminal,
  runtimeSurfaceKind,
  connectionLabel,
  lastActivityAt,
  lastInputAt,
  readOnly,
}: {
  sessionId: string;
  terminal: TerminalInfo | null;
  runtimeSurfaceKind: "agent" | "shell" | "none";
  connectionLabel: string;
  lastActivityAt: number | null;
  lastInputAt: number | null;
  readOnly: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/90 p-3 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <ActivityIcon className="size-4 text-primary" />
        <h2 className="font-medium text-sm">Runtime HUD</h2>
      </div>
      <dl className="grid gap-2 text-xs">
        <InfoRow label="Session" value={sessionId} />
        <InfoRow label="Terminal" value={terminal?.id ?? "n/a"} />
        <InfoRow label="Surface" value={runtimeSurfaceKind === "agent" ? "Agent TTY" : runtimeSurfaceKind === "shell" ? "Shell fallback" : "None"} />
        <InfoRow label="Bridge" value={connectionLabel} />
        <InfoRow label="Mode" value={readOnly ? "View-only attach" : "Interactive attach"} />
        <InfoRow label="Last output" value={formatTimestamp(lastActivityAt)} />
        <InfoRow label="Last input" value={formatTimestamp(lastInputAt)} />
      </dl>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2 rounded-lg bg-muted/45 px-2 py-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate font-mono text-foreground">{value}</dd>
    </div>
  );
}

function formatTimestamp(value: number | null): string {
  if (value === null) return "n/a";
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function TerminalShellState({
  title,
  description,
  loading = false,
  tone = "muted",
}: {
  title: string;
  description: string;
  loading?: boolean;
  tone?: "muted" | "danger";
}) {
  return (
    <div className="flex h-full min-h-[20rem] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center">
      <div
        className={cn(
          "flex size-10 items-center justify-center rounded-full border",
          tone === "danger" ? "border-red-500/30 bg-red-500/10 text-red-600" : "border-border bg-card text-muted-foreground",
        )}
      >
        {loading ? (
          <Loader2Icon className="size-4 animate-spin" />
        ) : tone === "danger" ? (
          <AlertTriangleIcon className="size-4" />
        ) : (
          <TerminalIcon className="size-4" />
        )}
      </div>
      <div className="max-w-md space-y-1">
        <h2 className="font-medium text-foreground text-sm">{title}</h2>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
    </div>
  );
}
