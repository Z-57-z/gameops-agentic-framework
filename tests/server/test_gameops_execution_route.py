from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient
from pytest import MonkeyPatch

from omnigent.gameops.execution import GameOpsExecutionRuntime
from omnigent.server.routes.gameops import create_gameops_router


def _client(execution_runtime: GameOpsExecutionRuntime | None = None) -> TestClient:
    app = FastAPI()
    app.include_router(create_gameops_router(execution_runtime=execution_runtime), prefix="/v1")
    return TestClient(app)


def _task(
    task_id: str = "custom-task",
    *,
    status: str = "pending",
    approval_required: bool = False,
    evidence_required: list[str] | None = None,
) -> dict[str, object]:
    return {
        "task_id": task_id,
        "title": "Execute business task",
        "owner_role": "operator",
        "status": status,
        "due": "now",
        "approval_required": approval_required,
        "evidence_required": evidence_required or ["evidence"],
    }


def test_gameops_execution_endpoint_runs_task() -> None:
    client = _client()

    response = client.post(
        "/v1/gameops/execution/run",
        json={
            "task": _task(),
            "operator": "ops",
            "evidence": {"evidence": "ok"},
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["task"]["status"] == "done"
    assert body["tool_result"]["tool_name"] == "gameops.manual_task_record"
    assert body["tool_result"]["receipt"]["dry_run"] is True
    assert [step["phase"] for step in body["loop_steps"]] == [
        "precheck",
        "execute",
        "verify",
        "state_update",
    ]


def test_gameops_execution_history_endpoint_can_reload_persisted_audit(tmp_path: Path) -> None:
    audit_path = tmp_path / "gameops-execution-audit.jsonl"
    client = _client(GameOpsExecutionRuntime(history_path=audit_path))

    client.post(
        "/v1/gameops/execution/run",
        json={
            "task": _task(),
            "operator": "ops",
            "evidence": {"evidence": "ok"},
        },
    )

    restarted_client = _client(GameOpsExecutionRuntime(history_path=audit_path))
    history = restarted_client.get("/v1/gameops/execution/history")

    assert history.status_code == 200
    assert history.json()["records"][0]["record_id"] == "exec-1"


def test_gameops_execution_report_endpoint_returns_handoff_markdown() -> None:
    client = _client()
    client.post(
        "/v1/gameops/execution/run",
        json={
            "task": _task(),
            "operator": "ops",
            "evidence": {"evidence": "ok"},
        },
    )

    response = client.get("/v1/gameops/execution/report")

    assert response.status_code == 200
    assert response.json()["record_count"] == 1
    assert "gameops.manual_task_record" in response.json()["markdown"]


def test_gameops_execution_router_uses_configured_audit_path(
    tmp_path: Path,
    monkeypatch: MonkeyPatch,
) -> None:
    audit_path = tmp_path / "configured-audit.jsonl"
    monkeypatch.setenv("GAMEOPS_EXECUTION_HISTORY_PATH", str(audit_path))
    client = _client()

    response = client.post(
        "/v1/gameops/execution/run",
        json={
            "task": _task(),
            "operator": "ops",
            "evidence": {"evidence": "ok"},
        },
    )

    assert response.status_code == 200
    assert audit_path.exists()


def test_gameops_execution_endpoint_rejects_empty_operator() -> None:
    client = _client()

    response = client.post(
        "/v1/gameops/execution/run",
        json={"task": _task(), "operator": "   ", "evidence": {}},
    )

    assert response.status_code == 422


def test_gameops_execution_endpoint_returns_recovery_actions_for_blocked_run() -> None:
    client = _client()

    response = client.post(
        "/v1/gameops/execution/run",
        json={"task": _task(), "operator": "ops", "evidence": {}},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["tool_result"]["status"] == "blocked"
    assert [action["kind"] for action in body["recovery_actions"]] == [
        "collect_evidence",
        "retry",
    ]


def test_gameops_execution_policy_endpoint_returns_business_rules() -> None:
    client = _client()

    response = client.get("/v1/gameops/execution/policy")

    assert response.status_code == 200
    rules = response.json()["rules"]
    approval_rule = next(rule for rule in rules if rule["task_id"] == "approval-launch")
    assert approval_rule["tool_name"] == "campaign.launch_approval"
    assert approval_rule["approval_required"] is True


def test_gameops_enterprise_readiness_endpoint_reports_missing_model_credentials(
    monkeypatch: MonkeyPatch,
) -> None:
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    client = _client()

    response = client.get("/v1/gameops/enterprise/readiness")

    assert response.status_code == 200
    body = response.json()
    assert body["overall_status"] == "missing"
    assert body["dry_run"] is True
    assert body["tool_count"] > 0


def test_gameops_enterprise_readiness_endpoint_reports_configured_state(
    tmp_path: Path,
    monkeypatch: MonkeyPatch,
) -> None:
    audit_path = tmp_path / "audit.jsonl"
    task_path = tmp_path / "tasks.json"
    policy_path = tmp_path / "policy.json"
    knowledge_path = tmp_path / "knowledge"
    knowledge_path.mkdir()
    (knowledge_path / "policy.md").write_text("# Policy\n\n## Review\nPolicy.", encoding="utf-8")
    policy_path.write_text('{"tools": {}}', encoding="utf-8")
    monkeypatch.setenv("GAMEOPS_EXECUTION_HISTORY_PATH", str(audit_path))
    monkeypatch.setenv("GAMEOPS_EXECUTION_TASKS_PATH", str(task_path))
    monkeypatch.setenv("GAMEOPS_EXECUTION_POLICY_PATH", str(policy_path))
    monkeypatch.setenv("GAMEOPS_KNOWLEDGE_DIR", str(knowledge_path))
    monkeypatch.setenv("OMNIGENT_AUTH_ENABLED", "1")
    monkeypatch.setenv("LLM_API_KEY", "test-key")
    client = _client()

    response = client.get("/v1/gameops/enterprise/readiness")

    assert response.status_code == 200
    body = response.json()
    assert body["overall_status"] == "warning"
    assert body["integration_mode"] == "enterprise-pilot"
    assert any(item["status"] == "ready" for item in body["items"])


def test_gameops_monitoring_metrics_endpoint_reports_execution_state() -> None:
    client = _client()
    client.post(
        "/v1/gameops/execution/run",
        json={
            "task": _task(),
            "operator": "ops",
            "evidence": {"evidence": "ok"},
        },
    )

    response = client.get("/v1/gameops/monitoring/metrics")

    assert response.status_code == 200
    body = response.json()
    assert body["total_actions"] == 1
    assert body["successful_actions"] == 1
    assert body["task_status_counts"]["done"] == 1
    assert body["storage_backend"] == "memory"


def test_gameops_routes_require_api_key_when_configured(monkeypatch: MonkeyPatch) -> None:
    monkeypatch.setenv("GAMEOPS_API_KEY", "secret")
    client = _client()

    denied = client.get("/v1/gameops/execution/policy")
    allowed = client.get("/v1/gameops/execution/policy", headers={"x-gameops-api-key": "secret"})

    assert denied.status_code == 401
    assert allowed.status_code == 200


def test_gameops_execution_task_endpoints_persist_task_state(tmp_path: Path) -> None:
    task_state_path = tmp_path / "gameops-execution-tasks.json"
    client = _client(GameOpsExecutionRuntime(task_state_path=task_state_path))

    registered = client.post("/v1/gameops/execution/tasks", json={"tasks": [_task()]})
    listed = client.get("/v1/gameops/execution/tasks")
    restarted_client = _client(GameOpsExecutionRuntime(task_state_path=task_state_path))
    reloaded = restarted_client.get("/v1/gameops/execution/tasks")

    assert registered.status_code == 200
    assert listed.status_code == 200
    assert listed.json()["tasks"][0]["task_id"] == "custom-task"
    assert task_state_path.exists()
    assert reloaded.json()["tasks"][0]["task_id"] == "custom-task"
