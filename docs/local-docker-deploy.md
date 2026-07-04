# Local Docker deployment

This document describes the local Docker Compose app for GameOps Agentic Framework. It is intended for local development, GitHub reviewers, and portfolio walkthroughs: clone the repository, provide your own model API key, and run the app in containers.

The project remains a personal learning project / MVP based on the Apache-2.0 Omnigent open-source framework. The Docker stack is not a hardened production SaaS template.

## What the stack runs

Root `docker-compose.yml` starts:

- `postgres` — local Postgres database on a Docker volume.
- `server` — FastAPI/WebSocket coordination server with the built ap-web SPA embedded.
- `host` — Linux host/runner container with git, tmux, PTY support, and coding-agent CLIs.

The browser talks to `http://localhost:8080`. The `host` container connects to the server over the Compose network at `http://server:8000`, so Windows users do not need native `tmux`, `pty`, `fcntl`, `termios`, WSL IP routing, or POSIX process features on the host OS.

## Quickstart

```bash
git clone https://github.com/Z-57-z/gameops-agentic-framework.git
cd gameops-agentic-framework
cp .env.example .env
```

Edit `.env` and replace the placeholder model API settings with your own provider details. Then run:

```bash
docker compose up --build
```

Open:

```text
http://localhost:8080
```

To stop the app:

```bash
docker compose down
```

To reset all local container data, including Postgres and app volumes:

```bash
docker compose down -v
```

## Bring your own model API

The app does not include shared API keys. You must provide your own model API credentials in `.env`; usage and billing belong to your model provider.

### OpenAI-compatible providers

OpenAI-compatible mode covers OpenAI, DeepSeek, 通义千问 / DashScope compatible mode, Moonshot, SiliconFlow, OpenRouter, LM Studio, vLLM, and Ollama's OpenAI-compatible gateway.

```env
LLM_PROVIDER=openai-compatible
LLM_MODEL=gpt-4o-mini
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=your_api_key_here
```

Examples:

```env
# DeepSeek
LLM_PROVIDER=openai-compatible
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL=deepseek-chat
LLM_API_KEY=your_deepseek_key

# 通义千问 DashScope compatible mode
LLM_PROVIDER=openai-compatible
LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
LLM_MODEL=qwen-plus
LLM_API_KEY=your_dashscope_key

# Moonshot
LLM_PROVIDER=openai-compatible
LLM_BASE_URL=https://api.moonshot.cn/v1
LLM_MODEL=moonshot-v1-8k
LLM_API_KEY=your_moonshot_key

# SiliconFlow
LLM_PROVIDER=openai-compatible
LLM_BASE_URL=https://api.siliconflow.cn/v1
LLM_MODEL=Qwen/Qwen2.5-72B-Instruct
LLM_API_KEY=your_siliconflow_key
```

For a local model server running on the host machine, Docker Desktop usually exposes the host as `host.docker.internal`:

```env
# Ollama OpenAI-compatible gateway example
LLM_PROVIDER=openai-compatible
LLM_BASE_URL=http://host.docker.internal:11434/v1
LLM_MODEL=qwen2.5-coder:7b
LLM_API_KEY=ollama
```

The `host` service maps these generic `LLM_*` settings to the standard `OPENAI_*` and `HARNESS_OPENAI_AGENTS_MODEL` environment variables before starting `omnigent host`, so spawned runners can use OpenAI-compatible credentials without Docker Compose nested variable expansion.

### Anthropic / Claude API

```env
LLM_PROVIDER=anthropic
LLM_MODEL=claude-sonnet-4-6
LLM_BASE_URL=https://api.anthropic.com/v1
LLM_API_KEY=your_anthropic_key_here
```

You can also use Anthropic's standard names:

```env
LLM_PROVIDER=anthropic
ANTHROPIC_MODEL=claude-sonnet-4-6
ANTHROPIC_BASE_URL=https://api.anthropic.com/v1
ANTHROPIC_API_KEY=your_anthropic_key_here
```

The `host` service maps Anthropic mode to `ANTHROPIC_*` and `HARNESS_CLAUDE_SDK_MODEL` for runner processes.

## Model status in the UI

`GET /v1/info` includes a `model_config` object with non-secret status only:

```json
{
  "provider": "openai-compatible",
  "model": "gpt-4o-mini",
  "base_url_host": "api.openai.com",
  "configured": true,
  "credential_source": "env:LLM_API_KEY",
  "message": "OpenAI-compatible model API is configured."
}
```

The API intentionally does not return API keys or bearer tokens. The new-session page warns when model configuration is missing and shows the current provider/model when configured.

## GameOps execution state

The GameOps approval and execution panel persists two local files when the execution paths are set. The root Docker stack sets:

```env
GAMEOPS_EXECUTION_HISTORY_PATH=/data/gameops-execution-audit.jsonl
GAMEOPS_EXECUTION_TASKS_PATH=/data/gameops-execution-tasks.json
GAMEOPS_EXECUTION_DB_PATH=/data/gameops-execution.db
GAMEOPS_EXECUTION_POLICY_PATH=/app/docs/gameops-execution-policy.example.json
GAMEOPS_KNOWLEDGE_DIR=/data/gameops-knowledge
GAMEOPS_API_KEY=
GAMEOPS_TOOL_DRY_RUN=true
```

Because the server mounts `/data` on the `app-data` Docker volume, generated task state, approval decisions, blocked executions, tool names, and validation notes survive container restarts. When `GAMEOPS_EXECUTION_DB_PATH` is set, SQLite is used as the production-style local store and takes precedence over the JSON files. `docker compose down -v` removes that volume and resets local state.

The app does not load repository starter knowledge at runtime. Add your own Markdown policies, activity rules, support handbooks, and incident runbooks under `GAMEOPS_KNOWLEDGE_DIR`; readiness reports `missing` until at least one `.md` file is present.

## GameOps rule configuration

The execution runtime ships with built-in GameOps tool rules for activity launch, support tickets, incidents, approvals, evidence, retries, and fallback handling. For local development or enterprise pilots, point `GAMEOPS_EXECUTION_POLICY_PATH` at a JSON file to override those rules without changing code.

The included example is:

```text
docs/gameops-execution-policy.example.json
```

It can override per-task fields such as:

- `target_system` — visible business system name, for example 活动发布审批台.
- `operation` — visible tool operation, for example 记录上线审批.
- `required_role` — execution role required by the permission precheck.
- `risk_level` — `low`, `medium`, `high`, or `critical`.
- `retry_policy.max_attempts` and `retry_policy.backoff_seconds`.
- `failure_mode` — `collect_evidence`, `request_approval`, `request_permission`, `retry`, or `manual_handoff`.
- `approval_required`, `evidence_required`, and `guardrails`.

Invalid JSON or unknown task IDs are ignored, so a bad override cannot remove the built-in defaults. After changing the policy file, restart the `server` container:

```bash
docker compose restart server
```

## Security notes

- Do not commit `.env`.
- Do not share screenshots or logs that include real API keys.
- The root Compose stack defaults to `OMNIGENT_AUTH_ENABLED=0` for local single-user use. Do not expose it to an untrusted network in this mode.
- Only `./workspace` is bind-mounted into the host/runner container by default. Put local evaluation files there instead of mounting your whole home directory.
- This is service-level container isolation. It separates server, database, and host/runner processes, but it is not yet one fresh sandbox container per session.

## Troubleshooting

Validate Compose interpolation and service definitions:

```bash
docker compose config
```

Build the images:

```bash
docker compose build
```

Start the stack and watch logs:

```bash
docker compose up
```

Check the public capability probe:

```bash
curl http://localhost:8080/v1/info
```

Check the GameOps API health and execution policy:

```bash
curl http://localhost:8080/health
curl http://localhost:8080/v1/gameops/execution/policy
curl http://localhost:8080/v1/gameops/enterprise/readiness
curl http://localhost:8080/v1/gameops/monitoring/metrics
```

For an enterprise pilot, the readiness response should be reviewed before exposing the service. It checks persistent audit paths, task-state persistence, external policy rules, configured knowledge source, auth mode, model credentials, and whether the business-tool layer is still dry-run. `missing` means the deployment is not ready; `warning` means it is suitable for a controlled pilot but still needs real business-system adapters or stricter auth/configuration.

If `GAMEOPS_API_KEY` is set, add `-H "x-gameops-api-key: $GAMEOPS_API_KEY"` to GameOps API calls. See `docs/gameops-enterprise-runbook.md` for the full operational checklist.

If the app says the model API is not configured, check `.env` for:

```env
LLM_API_KEY=...
LLM_BASE_URL=...
LLM_MODEL=...
```

If the host/runner does not appear in the web UI, check:

```bash
docker compose logs host
```

If a local Ollama / LM Studio / vLLM endpoint cannot be reached from Docker, use `host.docker.internal` instead of `localhost` in `LLM_BASE_URL`.
