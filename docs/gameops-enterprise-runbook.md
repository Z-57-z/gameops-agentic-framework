# GameOps Agent Enterprise Runbook

This runbook is for operating the GameOps Agent as an enterprise pilot or internal production service.

## Required configuration

Set these before exposing GameOps outside a trusted local machine:

```env
GAMEOPS_API_KEY=replace-with-internal-secret
OMNIGENT_AUTH_ENABLED=1
LLM_PROVIDER=openai-compatible
LLM_BASE_URL=https://your-model-gateway.example.com/v1
LLM_MODEL=your-approved-model
LLM_API_KEY=replace-with-secret
GAMEOPS_EXECUTION_DB_PATH=/data/gameops-execution.db
GAMEOPS_EXECUTION_POLICY_PATH=/app/docs/gameops-execution-policy.example.json
GAMEOPS_KNOWLEDGE_DIR=/data/gameops-knowledge
GAMEOPS_TOOL_DRY_RUN=true
```

Use `GAMEOPS_TOOL_DRY_RUN=false` only after internal announcement, reward, ticket, monitoring, and player-query APIs are bound behind the GameOps tool contract.
The app does not load repository starter documents at runtime; put enterprise policy, activity-rule, support, and incident Markdown files under `GAMEOPS_KNOWLEDGE_DIR`.

## Startup

```bash
cp .env.example .env
docker compose up --build
```

Open:

```text
http://localhost:8080
```

## Health and readiness

```bash
curl http://localhost:8080/health
curl -H "x-gameops-api-key: $GAMEOPS_API_KEY" http://localhost:8080/v1/gameops/enterprise/readiness
curl -H "x-gameops-api-key: $GAMEOPS_API_KEY" http://localhost:8080/v1/gameops/monitoring/metrics
```

Readiness states:

- `ready`: all core checks pass.
- `warning`: safe for a controlled pilot, but at least one item is still dry-run or local-mode.
- `missing`: do not expose; required credentials, policy, or persistence are missing.

## Monitoring

Poll `/v1/gameops/monitoring/metrics` from Prometheus, Datadog, or an internal scheduler. Alert on:

- `blocked_actions` rising faster than normal.
- `task_status_counts.blocked` remaining nonzero for more than the SLA.
- `storage_backend=memory` in non-local deployments.
- `dry_run=false` without a successful enterprise change window.

## Permissions

`GAMEOPS_API_KEY` protects the GameOps API surface. Business permissions are enforced again inside the execution loop through task policy:

- `required_role`
- `approval_required`
- `evidence_required`
- `risk_level`
- `failure_mode`

Keep identity-provider mapping outside the runtime and pass the mapped operator role into execution requests.

## Persistence

Preferred pilot setting:

```env
GAMEOPS_EXECUTION_DB_PATH=/data/gameops-execution.db
```

This stores task state and audit history in SQLite on the Docker volume. JSON paths remain supported for local development.

Backup:

```bash
docker compose exec server cp /data/gameops-execution.db /data/gameops-execution.backup.db
```

## Knowledge source

Populate `GAMEOPS_KNOWLEDGE_DIR` with your own Markdown documents before pilot use. Recommended starting files:

- `support-policy.md`
- `campaign-launch-rules.md`
- `reward-and-compensation-policy.md`
- `incident-runbook.md`

The repository starter documents are only for tests and local evaluation, and are not loaded by the default runtime.

## Business API integration

The runtime already returns structured tool receipts:

- target system
- operation
- reference id
- written fields
- verification notes
- dry-run flag

When integrating real systems, keep the same receipt shape and replace dry-run adapters one target at a time:

1. announcement system
2. reward configuration
3. support ticket system
4. monitoring / incident system
5. player and payment lookup

Every adapter must fail closed: missing evidence, missing approval, role mismatch, or tool failure should return a blocked result with recovery actions.

## Failure handling

Common fallback actions:

- `collect_evidence`: operator must attach required proof.
- `request_approval`: owner approval is required before execution.
- `request_permission`: operator role does not match policy.
- `retry`: retry after preconditions are fixed.
- `manual_handoff`: hand off to a human owner when automated execution cannot continue.

For incidents, keep `GAMEOPS_TOOL_DRY_RUN=true` until the incident command team approves production writes.
