import json
from datetime import datetime
from pathlib import Path

from omnigent.gameops.execution import GameOpsExecutionRuntime, GameOpsToolRegistry
from omnigent.gameops.schemas import (
    ExecutionApprovalRequest,
    ExecutionRunRequest,
    ExecutionTask,
    ExecutionTaskRegistrationRequest,
)


def _task(
    task_id: str = "custom-task",
    *,
    status: str = "pending",
    approval_required: bool = False,
    evidence_required: list[str] | None = None,
    owner_role: str = "operator",
) -> ExecutionTask:
    return ExecutionTask(
        task_id=task_id,
        title="Execute business task",
        owner_role=owner_role,
        status=status,  # type: ignore[arg-type]
        due="now",
        approval_required=approval_required,
        evidence_required=evidence_required or ["evidence"],
    )


def test_execution_runtime_blocks_tasks_missing_evidence() -> None:
    runtime = GameOpsExecutionRuntime()
    response = runtime.run(ExecutionRunRequest(task=_task(), operator="ops", evidence={}))

    assert response.task.status == "pending"
    assert response.tool_result.status == "blocked"
    assert response.missing_evidence == ["evidence"]
    assert response.loop_steps[0].status == "blocked"
    assert [action.kind for action in response.recovery_actions] == [
        "collect_evidence",
        "retry",
    ]


def test_execution_runtime_requires_approval_before_running_task() -> None:
    runtime = GameOpsExecutionRuntime()
    task = _task(status="waiting_approval", approval_required=True)

    response = runtime.run(
        ExecutionRunRequest(task=task, operator="ops", evidence={"evidence": "ok"})
    )

    assert response.tool_result.status == "blocked"
    assert response.approval_required is True
    assert response.recovery_actions[0].kind == "request_approval"


def test_execution_runtime_approves_then_runs_task_with_receipt() -> None:
    runtime = GameOpsExecutionRuntime()
    task = _task(status="waiting_approval", approval_required=True)

    approved = runtime.approve(
        ExecutionApprovalRequest(
            task=task,
            approver="lead",
            decision="approved",
            comment="ok",
        )
    )
    executed = runtime.run(
        ExecutionRunRequest(
            task=approved.task,
            operator="ops",
            evidence={"evidence": "ok"},
        )
    )

    assert approved.task.status == "pending"
    assert executed.task.status == "done"
    assert executed.tool_result.status == "success"
    assert executed.tool_result.receipt is not None
    assert executed.tool_result.receipt.dry_run is True
    assert executed.tool_result.evidence["approver"] == "lead"
    assert [step.status for step in executed.loop_steps] == [
        "success",
        "success",
        "success",
        "success",
    ]


def test_execution_runtime_keeps_recent_action_history() -> None:
    runtime = GameOpsExecutionRuntime()
    task = _task(status="waiting_approval", approval_required=True)

    approved = runtime.approve(
        ExecutionApprovalRequest(task=task, approver="lead", decision="approved")
    )
    runtime.run(
        ExecutionRunRequest(
            task=approved.task,
            operator="ops",
            evidence={"evidence": "ok"},
        )
    )

    history = runtime.history(limit=10)

    assert [record.action for record in history.records] == ["approve", "run"]
    assert history.records[0].actor == "lead"
    assert history.records[1].actor == "ops"
    assert datetime.fromisoformat(history.records[1].created_at)


def test_execution_runtime_persists_action_history_across_instances(tmp_path: Path) -> None:
    audit_path = tmp_path / "execution-audit.jsonl"
    first_runtime = GameOpsExecutionRuntime(history_path=audit_path)
    task = _task()

    first_runtime.run(ExecutionRunRequest(task=task, operator="ops", evidence={"evidence": "ok"}))

    restarted_runtime = GameOpsExecutionRuntime(history_path=audit_path)

    assert audit_path.exists()
    assert restarted_runtime.history(limit=10).records[0].record_id == "exec-1"
    assert restarted_runtime.history(limit=10).records[0].task_id == "custom-task"


def test_execution_runtime_persists_history_and_tasks_in_sqlite(tmp_path: Path) -> None:
    db_path = tmp_path / "gameops.db"
    first_runtime = GameOpsExecutionRuntime(db_path=db_path)
    task = _task()

    first_runtime.register_tasks(ExecutionTaskRegistrationRequest(tasks=[task]))
    first_runtime.run(ExecutionRunRequest(task=task, operator="ops", evidence={"evidence": "ok"}))

    restarted_runtime = GameOpsExecutionRuntime(db_path=db_path)

    assert db_path.exists()
    assert restarted_runtime.history(limit=10).records[0].task_id == "custom-task"
    assert restarted_runtime.tasks().tasks[0].status == "done"
    assert restarted_runtime.metrics().storage_backend == "sqlite"


def test_execution_runtime_builds_audit_handoff_report() -> None:
    runtime = GameOpsExecutionRuntime()
    runtime.run(ExecutionRunRequest(task=_task(), operator="ops", evidence={"evidence": "ok"}))

    report = runtime.report(limit=10)

    assert report.record_count == 1
    assert datetime.fromisoformat(report.generated_at)
    assert "gameops.manual_task_record" in report.markdown


def test_execution_runtime_exposes_policy_rules_for_business_tasks() -> None:
    runtime = GameOpsExecutionRuntime()

    policy = runtime.policy()

    approval_rule = next(rule for rule in policy.rules if rule.task_id == "approval-launch")
    assert approval_rule.tool_name == "campaign.launch_approval"
    assert approval_rule.risk_level == "high"
    assert approval_rule.approval_required is True
    assert approval_rule.retry_policy.max_attempts >= 1


def test_execution_runtime_loads_configurable_policy_overrides(tmp_path: Path) -> None:
    policy_path = tmp_path / "gameops-policy.json"
    policy_path.write_text(
        json.dumps(
            {
                "tools": {
                    "approval-launch": {
                        "target_system": "enterprise-approval",
                        "operation": "submit-launch-approval",
                        "required_role": "senior-ops",
                        "risk_level": "critical",
                        "retry_policy": {"max_attempts": 3, "backoff_seconds": 60},
                        "failure_mode": "request_permission",
                    }
                }
            }
        ),
        encoding="utf-8",
    )
    runtime = GameOpsExecutionRuntime(tools=GameOpsToolRegistry(policy_path=policy_path))

    rule = next(rule for rule in runtime.policy().rules if rule.task_id == "approval-launch")

    assert rule.target_system == "enterprise-approval"
    assert rule.operation == "submit-launch-approval"
    assert rule.required_role == "senior-ops"
    assert rule.risk_level == "critical"
    assert rule.retry_policy.max_attempts == 3
    assert rule.failure_mode == "request_permission"


def test_execution_runtime_blocks_operator_without_required_role() -> None:
    runtime = GameOpsExecutionRuntime()
    task = _task(owner_role="support")

    response = runtime.run(
        ExecutionRunRequest(
            task=task,
            operator="ops",
            operator_role="wrong-role",
            evidence={"evidence": "ok"},
        )
    )

    assert response.tool_result.status == "blocked"
    assert response.recovery_actions[0].kind == "request_permission"


def test_execution_runtime_registers_and_updates_task_state() -> None:
    runtime = GameOpsExecutionRuntime()
    task = _task(status="waiting_approval", approval_required=True)

    registered = runtime.register_tasks(ExecutionTaskRegistrationRequest(tasks=[task]))
    approved = runtime.approve(
        ExecutionApprovalRequest(task=registered.tasks[0], approver="lead", decision="approved")
    )
    runtime.run(
        ExecutionRunRequest(
            task=approved.task,
            operator="ops",
            evidence={"evidence": "ok"},
        )
    )

    task_state = runtime.tasks().tasks

    assert len(task_state) == 1
    assert task_state[0].task_id == "custom-task"
    assert task_state[0].status == "done"
    assert task_state[0].approved_by == "lead"


def test_execution_runtime_persists_task_state_across_instances(tmp_path: Path) -> None:
    task_state_path = tmp_path / "gameops-execution-tasks.json"
    first_runtime = GameOpsExecutionRuntime(task_state_path=task_state_path)

    first_runtime.register_tasks(ExecutionTaskRegistrationRequest(tasks=[_task()]))

    restarted_runtime = GameOpsExecutionRuntime(task_state_path=task_state_path)

    assert task_state_path.exists()
    assert restarted_runtime.tasks().tasks[0].task_id == "custom-task"


def test_execution_runtime_exposes_monitoring_metrics() -> None:
    runtime = GameOpsExecutionRuntime()

    runtime.run(ExecutionRunRequest(task=_task(), operator="ops", evidence={"evidence": "ok"}))

    metrics = runtime.metrics()

    assert metrics.total_actions == 1
    assert metrics.successful_actions == 1
    assert metrics.blocked_actions == 0
    assert metrics.task_status_counts["done"] == 1
    assert metrics.storage_backend == "memory"
    assert metrics.dry_run is True
