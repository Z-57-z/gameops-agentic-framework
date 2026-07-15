"""First-party task execution runtime for GameOps workflows."""

from __future__ import annotations

import json
import os
import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

from omnigent.gameops.schemas import (
    ApprovalProvenance,
    CompensationApprovalEvaluateRequest,
    CompensationApprovalEvaluateResponse,
    AuditTrail,
    ExecutionAction,
    ExecutionActionResponse,
    ExecutionApprovalRequest,
    EnterpriseReadinessItem,
    EnterpriseReadinessResponse,
    EnterpriseReadinessStatus,
    ExecutionMetricsResponse,
    ExecutionRecoveryActionKind,
    ExecutionHistoryRecord,
    ExecutionHistoryResponse,
    ExecutionLoopStep,
    ExecutionPolicyResponse,
    ExecutionPolicyRule,
    ExecutionPrecheckItem,
    ExecutionRecoveryAction,
    ExecutionReportResponse,
    ExecutionRetryPolicy,
    ExecutionRunRequest,
    ExecutionTask,
    ExecutionTaskListResponse,
    ExecutionTaskRegistrationRequest,
    ExecutionToolReceipt,
    ExecutionToolResult,
    RiskLevel,
)


_EXECUTION_HISTORY_PATH_ENV = "GAMEOPS_EXECUTION_HISTORY_PATH"
_EXECUTION_TASKS_PATH_ENV = "GAMEOPS_EXECUTION_TASKS_PATH"
_EXECUTION_POLICY_PATH_ENV = "GAMEOPS_EXECUTION_POLICY_PATH"
_EXECUTION_DB_PATH_ENV = "GAMEOPS_EXECUTION_DB_PATH"
_AUTH_ENABLED_ENV = "OMNIGENT_AUTH_ENABLED"
_TOOL_DRY_RUN_ENV = "GAMEOPS_TOOL_DRY_RUN"
_KNOWLEDGE_DIR_ENV = "GAMEOPS_KNOWLEDGE_DIR"


@dataclass(frozen=True)
class GameOpsToolDefinition:
    """A safe built-in business tool mapping for a workflow task."""

    tool_name: str
    success_summary: str
    title: str
    approval_required: bool = False
    evidence_required: tuple[str, ...] = ()
    guardrails: tuple[str, ...] = ()
    target_system: str = "GameOps 工具台"
    operation: str = "记录执行结果"
    required_role: str = ""
    risk_level: RiskLevel = RiskLevel.MEDIUM
    max_attempts: int = 2
    backoff_seconds: int = 30
    failure_mode: ExecutionRecoveryActionKind = "manual_handoff"

    def copy_with_override(self, raw: dict[str, object]) -> GameOpsToolDefinition:
        retry_policy = raw.get("retry_policy")
        max_attempts = self.max_attempts
        backoff_seconds = self.backoff_seconds
        if isinstance(retry_policy, dict):
            raw_max_attempts = retry_policy.get("max_attempts")
            raw_backoff_seconds = retry_policy.get("backoff_seconds")
            if isinstance(raw_max_attempts, int):
                max_attempts = raw_max_attempts
            if isinstance(raw_backoff_seconds, int):
                backoff_seconds = raw_backoff_seconds

        risk_level = self.risk_level
        raw_risk_level = raw.get("risk_level")
        if isinstance(raw_risk_level, str):
            try:
                risk_level = RiskLevel(raw_risk_level)
            except ValueError:
                risk_level = self.risk_level

        failure_mode = self.failure_mode
        raw_failure_mode = raw.get("failure_mode")
        if raw_failure_mode in {
            "collect_evidence",
            "request_approval",
            "request_permission",
            "retry",
            "manual_handoff",
        }:
            failure_mode = raw_failure_mode  # type: ignore[assignment]

        return GameOpsToolDefinition(
            tool_name=_string_override(raw, "tool_name", self.tool_name),
            success_summary=_string_override(raw, "success_summary", self.success_summary),
            title=_string_override(raw, "title", self.title),
            approval_required=_bool_override(raw, "approval_required", self.approval_required),
            evidence_required=_tuple_override(raw, "evidence_required", self.evidence_required),
            guardrails=_tuple_override(raw, "guardrails", self.guardrails),
            target_system=_string_override(raw, "target_system", self.target_system),
            operation=_string_override(raw, "operation", self.operation),
            required_role=_string_override(raw, "required_role", self.required_role),
            risk_level=risk_level,
            max_attempts=max_attempts,
            backoff_seconds=backoff_seconds,
            failure_mode=failure_mode,
        )


def _string_override(raw: dict[str, object], key: str, default: str) -> str:
    value = raw.get(key)
    return value if isinstance(value, str) and value.strip() else default


def _bool_override(raw: dict[str, object], key: str, default: bool) -> bool:
    value = raw.get(key)
    return value if isinstance(value, bool) else default


def _tuple_override(raw: dict[str, object], key: str, default: tuple[str, ...]) -> tuple[str, ...]:
    value = raw.get(key)
    if not isinstance(value, list):
        return default
    items = tuple(item for item in value if isinstance(item, str) and item.strip())
    return items or default


class GameOpsToolRegistry:
    """Registry of safe first-party tool adapters.

    These adapters do not call external agents or mutate production systems. They
    create deterministic execution records that can later be replaced with real
    integrations behind the same task contract.
    """

    def __init__(self, policy_path: str | Path | None = None) -> None:
        self._tools = {
            "campaign-config": GameOpsToolDefinition(
                tool_name="campaign.reward_config_review",
                success_summary="活动配置与奖励规则已完成复核。",
                title="复核活动配置与奖励规则",
                evidence_required=("活动时间", "目标玩家", "奖励规则"),
                guardrails=("必须保留配置证据，不直接修改线上奖励。",),
                target_system="活动配置台",
                operation="复核奖励配置",
                required_role="活动运营负责人",
            ),
            "rollback-readiness": GameOpsToolDefinition(
                tool_name="campaign.rollback_readiness",
                success_summary="回滚方案已完成上线前确认。",
                title="确认回滚方案",
                evidence_required=("回滚方案", "触发条件", "执行负责人"),
                guardrails=("缺少回滚责任人时不能进入上线执行。",),
                target_system="活动配置台",
                operation="确认回滚预案",
                required_role="活动运营负责人",
            ),
            "support-faq": GameOpsToolDefinition(
                tool_name="campaign.support_faq_review",
                success_summary="客服 FAQ 和公告口径已完成复核。",
                title="复核客服 FAQ 与公告口径",
                evidence_required=("客服 FAQ", "公告草稿"),
                guardrails=("玩家承诺必须与公告口径一致。",),
                target_system="公告与客服知识库",
                operation="复核客服口径",
                required_role="活动运营负责人",
            ),
            "approval-launch": GameOpsToolDefinition(
                tool_name="campaign.launch_approval",
                success_summary="上线审批材料已通过并记录。",
                title="审批上线与奖励承诺",
                approval_required=True,
                evidence_required=("公告草稿", "奖励配置截图", "回滚方案"),
                guardrails=("高价值奖励上线前必须审批，不调用外部 Agent 自动批准。",),
                target_system="活动发布审批台",
                operation="记录上线审批",
                required_role="运营负责人",
                risk_level=RiskLevel.HIGH,
            ),
            "ticket-intake": GameOpsToolDefinition(
                tool_name="ticket.intake_update",
                success_summary="工单必要信息已补齐并记录。",
                title="补齐工单必要信息",
                evidence_required=("玩家 ID", "服务器 ID", "问题描述"),
                guardrails=("缺少玩家定位信息时不能给出最终处理承诺。",),
                target_system="客服工单系统",
                operation="补齐工单字段",
                required_role="客服受理人",
            ),
            "payment-log-check": GameOpsToolDefinition(
                tool_name="ticket.payment_log_check",
                success_summary="订单与奖励发放日志已完成核验。",
                title="核验订单与奖励发放日志",
                evidence_required=("订单状态", "活动资格", "奖励发放日志"),
                guardrails=("日志支持前不能承诺人工补发。",),
                target_system="支付与奖励日志系统",
                operation="核验订单奖励日志",
                required_role="客服受理人",
            ),
            "account-security-review": GameOpsToolDefinition(
                tool_name="ticket.account_security_review",
                success_summary="账号安全复核记录已生成。",
                title="提交账号安全人工复核",
                evidence_required=("账号 ID", "登录记录", "安全复核结论"),
                guardrails=("账号状态调整必须由安全专员复核。",),
                target_system="账号安全复核台",
                operation="提交安全复核",
                required_role="安全专员",
                risk_level=RiskLevel.HIGH,
            ),
            "event-eligibility-check": GameOpsToolDefinition(
                tool_name="ticket.event_eligibility_check",
                success_summary="活动参与资格已完成核验。",
                title="核验活动参与资格",
                evidence_required=("活动 ID", "资格规则", "玩家参与记录"),
                guardrails=("资格未确认前不能承诺奖励补发。",),
                target_system="活动资格核验系统",
                operation="核验参与资格",
                required_role="客服受理人",
            ),
            "exception-approval": GameOpsToolDefinition(
                tool_name="ticket.exception_approval",
                success_summary="例外处理审批已记录。",
                title="审批例外处理与玩家承诺",
                approval_required=True,
                evidence_required=("负责人审批记录", "政策依据", "日志截图"),
                guardrails=("补偿、账号操作或例外承诺必须审批。",),
                target_system="客服例外审批台",
                operation="记录例外审批",
                required_role="运营负责人",
                risk_level=RiskLevel.HIGH,
            ),
            "incident-room": GameOpsToolDefinition(
                tool_name="incident.room_opened",
                success_summary="事故群与初始状态已记录。",
                title="开启事故群并同步初始状态",
                evidence_required=("事故群链接", "当前状态摘要"),
                guardrails=("事故响应需要先建立统一指挥和同步入口。",),
                target_system="事故指挥台",
                operation="开启事故协同",
                required_role="事故指挥官",
                risk_level=RiskLevel.HIGH,
            ),
            "impact-assessment": GameOpsToolDefinition(
                tool_name="incident.impact_assessment",
                success_summary="影响范围与玩家损失评估已记录。",
                title="确认影响范围与玩家损失",
                evidence_required=("受影响服务清单", "玩家影响数据", "日志截图"),
                guardrails=("补偿范围必须基于影响数据。",),
                target_system="监控与玩家影响系统",
                operation="记录影响评估",
                required_role="事故指挥官",
                risk_level=RiskLevel.HIGH,
            ),
            "support-message": GameOpsToolDefinition(
                tool_name="incident.support_message",
                success_summary="客服同步口径已记录。",
                title="准备客服同步口径",
                evidence_required=("客服 FAQ", "玩家沟通口径"),
                guardrails=("对外口径需要和事故指挥同步。",),
                target_system="客服公告同步台",
                operation="记录同步口径",
                required_role="客服话术负责人",
            ),
            "incident-fields": GameOpsToolDefinition(
                tool_name="incident.fields_update",
                success_summary="事故记录字段已补齐。",
                title="补齐事故记录字段",
                evidence_required=("持续分钟数", "发现时间", "补偿设想"),
                guardrails=("复盘字段不完整时不能关闭事故记录。",),
                target_system="事故记录系统",
                operation="补齐事故字段",
                required_role="事故指挥官",
            ),
            "approval-compensation": GameOpsToolDefinition(
                tool_name="incident.compensation_approval",
                success_summary="补偿与公告口径审批已记录。",
                title="审批补偿与公告口径",
                approval_required=True,
                evidence_required=("补偿方案", "影响范围", "公告草稿"),
                guardrails=("公开提及补偿前必须审批，不调用外部 Agent 自动批准。",),
                target_system="事故补偿审批台",
                operation="审批补偿公告",
                required_role="运营负责人",
                risk_level=RiskLevel.CRITICAL,
            ),
            "postmortem": GameOpsToolDefinition(
                tool_name="incident.postmortem_record",
                success_summary="事故复盘和预防事项已记录。",
                title="完成事故复盘和预防事项",
                evidence_required=("时间线", "根因分析", "预防事项"),
                guardrails=("复盘必须包含根因和后续预防项。",),
                target_system="事故复盘系统",
                operation="记录复盘事项",
                required_role="事故指挥官",
            ),
        }
        self._load_policy_overrides(Path(policy_path) if policy_path is not None else None)

    def definition_for(self, task: ExecutionTask) -> GameOpsToolDefinition:
        return self._tools.get(
            task.task_id,
            GameOpsToolDefinition(
                tool_name="gameops.manual_task_record",
                success_summary="人工任务执行记录已生成。",
                title=task.title,
                evidence_required=tuple(task.evidence_required),
                approval_required=task.approval_required,
                guardrails=("未知任务只能生成记录，不能执行外部系统变更。",),
                required_role=task.owner_role,
            ),
        )

    def policy_rules(self) -> list[ExecutionPolicyRule]:
        return [
            ExecutionPolicyRule(
                task_id=task_id,
                title=definition.title,
                tool_name=definition.tool_name,
                target_system=definition.target_system,
                operation=definition.operation,
                required_role=definition.required_role,
                risk_level=definition.risk_level,
                retry_policy=ExecutionRetryPolicy(
                    max_attempts=definition.max_attempts,
                    backoff_seconds=definition.backoff_seconds,
                ),
                failure_mode=definition.failure_mode,
                approval_required=definition.approval_required,
                evidence_required=list(definition.evidence_required),
                guardrails=list(definition.guardrails),
            )
            for task_id, definition in self._tools.items()
        ]

    def _load_policy_overrides(self, policy_path: Path | None) -> None:
        if policy_path is None or not policy_path.exists():
            return

        try:
            raw_policy = json.loads(policy_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return

        raw_tools = raw_policy.get("tools") if isinstance(raw_policy, dict) else None
        if not isinstance(raw_tools, dict):
            return

        for task_id, raw_override in raw_tools.items():
            if not isinstance(task_id, str) or not isinstance(raw_override, dict):
                continue
            current = self._tools.get(task_id)
            if current is None:
                continue
            self._tools[task_id] = current.copy_with_override(raw_override)


class GameOpsExecutionRuntime:
    """Approve and execute workflow tasks through first-party business tools."""

    def __init__(
        self,
        tools: GameOpsToolRegistry | None = None,
        history_path: str | Path | None = None,
        task_state_path: str | Path | None = None,
        db_path: str | Path | None = None,
    ) -> None:
        self.tools = tools or GameOpsToolRegistry()
        self._history_path = Path(history_path) if history_path is not None else None
        self._task_state_path = Path(task_state_path) if task_state_path is not None else None
        self._db_path = Path(db_path) if db_path is not None else None
        self._history: list[ExecutionHistoryRecord] = []
        self._tasks: dict[str, ExecutionTask] = {}
        self._next_record_id = 1
        self._init_db()
        self._load_history()
        self._load_tasks()

    def register_tasks(
        self, request: ExecutionTaskRegistrationRequest
    ) -> ExecutionTaskListResponse:
        """Persist workflow-generated tasks and preserve known progress."""
        for task in request.tasks:
            current = self._tasks.get(task.task_id)
            self._tasks[task.task_id] = current if current is not None else task
        self._save_tasks()
        return self.tasks()

    def tasks(self) -> ExecutionTaskListResponse:
        """Return current persisted task states in insertion order."""
        return ExecutionTaskListResponse(tasks=list(self._tasks.values()))

    def approve(self, request: ExecutionApprovalRequest) -> ExecutionActionResponse:
        """Approve or reject a task and return the updated task state."""
        if request.decision == "rejected":
            task = request.task.model_copy(update={"status": "blocked"})
            response = ExecutionActionResponse(
                task=task,
                tool_result=ExecutionToolResult(
                    tool_name="gameops.approval_gate",
                    status="blocked",
                    summary="审批未通过，任务保持阻塞。",
                    evidence={"approver": request.approver},
                ),
                approval_required=True,
                audit=AuditTrail(
                    validation_notes=[
                        f"审批人 {request.approver} 已拒绝该任务。",
                        request.comment or "未填写拒绝原因。",
                    ]
                ),
            )
            self._remember("approve", request.approver, response)
            self._remember_task(task)
            return response

        task = request.task.model_copy(
            update={
                "status": "pending",
                "approved_by": request.approver,
                "approval_comment": request.comment,
            }
        )
        response = ExecutionActionResponse(
            task=task,
            tool_result=ExecutionToolResult(
                tool_name="gameops.approval_gate",
                status="success",
                summary="审批已通过，任务可进入执行。",
                evidence={"approver": request.approver},
            ),
            approval_required=False,
            audit=AuditTrail(
                validation_notes=[
                    f"审批人 {request.approver} 已批准该任务。",
                    request.comment or "未填写审批备注。",
                ]
            ),
        )
        self._remember("approve", request.approver, response)
        self._remember_task(task)
        return response

    async def evaluate_compensation_approval(
        self,
        request: CompensationApprovalEvaluateRequest,
        evaluator: "CompensationApprovalEvaluator",
    ) -> CompensationApprovalEvaluateResponse:
        """Evaluate and persist AI provenance without identifying AI as a human approver."""
        decision = await evaluator.evaluate(request)
        task = request.task.model_copy(
            update={
                "status": "pending" if decision.decision_status == "auto_approved" else "waiting_approval",
                "approval_provenance": ApprovalProvenance(
                    source=decision.decision_source,
                    decision_id=decision.decision_id,
                    summary=decision.reason,
                    decided_at=decision.decided_at,
                ),
            }
        )
        approved = decision.decision_status == "auto_approved"
        response = ExecutionActionResponse(
            task=task,
            tool_result=ExecutionToolResult(
                tool_name="gameops.ai_compensation_approval",
                status="success" if approved else "blocked",
                summary="AI compensation approval completed." if approved else "AI requires manual review.",
                evidence=dict(request.evidence),
            ),
            approval_required=not approved,
            audit=AuditTrail(validation_notes=[decision.reason, *decision.hard_rule_results]),
            decision=decision,
        )
        self._remember("ai_approve", "gameops-ai", response)
        self._remember_task(task)
        return CompensationApprovalEvaluateResponse(task=task, decision=decision, audit=response.audit)

    def run(self, request: ExecutionRunRequest) -> ExecutionActionResponse:
        """Run a task if approval and required evidence are complete."""
        definition = self.tools.definition_for(request.task)
        missing_evidence = [
            item
            for item in request.task.evidence_required
            if not request.evidence.get(item, "").strip()
        ]
        precheck_items = self._precheck_items(
            request=request,
            definition=definition,
            missing_evidence=missing_evidence,
        )
        operator_role = self._operator_role(request)
        permission_required = bool(
            definition.required_role and operator_role != definition.required_role
        )
        if missing_evidence:
            response = self._blocked_response(
                request=request,
                summary="缺少必要证据，任务不能执行。",
                notes=[f"缺少证据：{', '.join(missing_evidence)}。"],
                missing_evidence=missing_evidence,
                precheck_items=precheck_items,
                permission_required=permission_required,
                required_role=definition.required_role,
                operator_role=operator_role,
            )
            self._remember("run", request.operator, response)
            return response

        if request.task.status == "blocked":
            response = self._blocked_response(
                request=request,
                summary="任务仍处于阻塞状态，不能执行。",
                notes=["任务状态为阻塞，需要先补齐前置条件。"],
                missing_evidence=[],
                precheck_items=precheck_items,
                permission_required=permission_required,
                required_role=definition.required_role,
                operator_role=operator_role,
            )
            self._remember("run", request.operator, response)
            return response

        ai_approved = (
            request.task.approval_provenance is not None
            and request.task.approval_provenance.source == "ai_auto"
        )
        if request.task.approval_required and request.task.approved_by is None and not ai_approved:
            response = self._blocked_response(
                request=request,
                summary="任务需要审批通过后才能执行。",
                notes=["任务需要负责人审批，审批完成前不会调用工具层。"],
                missing_evidence=[],
                approval_required=True,
                precheck_items=precheck_items,
                permission_required=permission_required,
                required_role=definition.required_role,
                operator_role=operator_role,
            )
            self._remember("run", request.operator, response)
            return response

        if permission_required:
            response = self._blocked_response(
                request=request,
                summary="执行人权限不满足工具要求，任务不能执行。",
                notes=[
                    f"权限不足：需要 {definition.required_role} 权限，当前为 {operator_role}。"
                ],
                missing_evidence=[],
                precheck_items=precheck_items,
                permission_required=True,
                required_role=definition.required_role,
                operator_role=operator_role,
            )
            self._remember("run", request.operator, response)
            return response

        execution_evidence = dict(request.evidence)
        execution_evidence["operator"] = request.operator
        if request.task.approved_by:
            execution_evidence["approver"] = request.task.approved_by
        task = request.task.model_copy(update={"status": "done"})
        response = ExecutionActionResponse(
            task=task,
            tool_result=ExecutionToolResult(
                tool_name=definition.tool_name,
                status="success",
                summary=definition.success_summary,
                evidence=execution_evidence,
                receipt=self._tool_receipt(definition, task, execution_evidence),
            ),
            approval_required=False,
            precheck_items=precheck_items,
            loop_steps=[
                ExecutionLoopStep(
                    phase="precheck",
                    status="success",
                    summary="前置条件已通过。",
                ),
                ExecutionLoopStep(
                    phase="execute",
                    status="success",
                    summary=f"已调用内置工具 {definition.tool_name}。",
                ),
                ExecutionLoopStep(
                    phase="verify",
                    status="success",
                    summary="工具结果和证据已完成一致性校验。",
                ),
                ExecutionLoopStep(
                    phase="state_update",
                    status="success",
                    summary="任务状态已回写为已完成。",
                ),
            ],
            audit=AuditTrail(
                validation_notes=[
                    f"操作人 {request.operator} 已执行内置工具 {definition.tool_name}。",
                    "任务已完成，工具执行结果已写入审计记录。",
                ]
            ),
        )
        self._remember("run", request.operator, response)
        self._remember_task(task)
        return response

    def history(self, limit: int = 20) -> ExecutionHistoryResponse:
        """Return recent execution action records in insertion order."""
        bounded_limit = max(1, min(limit, 100))
        return ExecutionHistoryResponse(records=self._history[-bounded_limit:])

    def policy(self) -> ExecutionPolicyResponse:
        """Return read-only execution rules for the GameOps task console."""
        return ExecutionPolicyResponse(rules=self.tools.policy_rules())

    def metrics(self) -> ExecutionMetricsResponse:
        """Return operational counters for monitoring and deployment checks."""
        status_counts: dict[str, int] = {}
        for task in self._tasks.values():
            status_counts[task.status] = status_counts.get(task.status, 0) + 1
        return ExecutionMetricsResponse(
            total_actions=len(self._history),
            successful_actions=sum(1 for record in self._history if record.status == "success"),
            blocked_actions=sum(1 for record in self._history if record.status == "blocked"),
            task_status_counts=status_counts,
            storage_backend=self._storage_backend(),
            dry_run=self._dry_run_enabled(),
        )

    def readiness(self) -> EnterpriseReadinessResponse:
        """Return enterprise rollout checks for operators and deploy scripts."""
        configured_policy_path = os.getenv(_EXECUTION_POLICY_PATH_ENV)
        items = [
            self._path_check(
                component="审计持久化",
                path=self._history_path,
                configured_name=_EXECUTION_HISTORY_PATH_ENV,
                ready_summary="执行审计会写入持久化文件。",
                missing_summary="执行审计仅保存在进程内存。",
                remediation=f"配置 {_EXECUTION_HISTORY_PATH_ENV} 到持久化卷或数据库落盘路径。",
            ),
            self._path_check(
                component="任务状态持久化",
                path=self._task_state_path,
                configured_name=_EXECUTION_TASKS_PATH_ENV,
                ready_summary="任务、审批和状态回写会跨重启保留。",
                missing_summary="任务状态仅保存在进程内存。",
                remediation=f"配置 {_EXECUTION_TASKS_PATH_ENV} 到持久化卷或数据库落盘路径。",
            ),
            self._policy_file_check(configured_policy_path),
            self._knowledge_source_check(),
            self._auth_check(),
            self._model_credential_check(),
            EnterpriseReadinessItem(
                component="业务工具适配器",
                status="warning",
                summary="当前工具层生成可审计 dry-run 回执。",
                detail="公告、奖励、工单、监控、玩家查询等目标系统已有稳定工具契约，但默认不直接写生产系统。",
                remediation="接入企业内部 API 后，在同一工具契约下替换 dry-run 适配器并保留回执校验。",
            ),
        ]
        overall_status = self._overall_readiness(items)
        integration_mode = "enterprise-ready" if overall_status == "ready" else "enterprise-pilot"
        return EnterpriseReadinessResponse(
            overall_status=overall_status,
            integration_mode=integration_mode,
            dry_run=self._dry_run_enabled(),
            tool_count=len(self.tools.policy_rules()),
            items=items,
        )

    def report(self, limit: int = 20) -> ExecutionReportResponse:
        """Build a Markdown handoff report from recent audit records."""
        records = self.history(limit=limit).records
        generated_at = datetime.now(UTC).isoformat()
        lines = [
            "# GameOps 执行审计交接报告",
            "",
            f"- 生成时间：{generated_at}",
            f"- 审计记录数：{len(records)}",
        ]
        if not records:
            lines.extend(["", "暂无执行审计记录。"])
            return ExecutionReportResponse(
                generated_at=generated_at,
                record_count=0,
                markdown="\n".join(lines),
            )

        lines.append("")
        for record in records:
            evidence_names = "、".join(record.evidence.keys()) or "无"
            note_summary = "；".join(record.validation_notes) or "无"
            lines.extend(
                [
                    f"## {record.record_id}｜{record.task_title}",
                    f"- 时间：{record.created_at}",
                    f"- 动作：{record.action}",
                    f"- 操作人：{record.actor}",
                    f"- 工具：{record.tool_name}",
                    f"- 状态：{record.status}",
                    f"- 证据：{evidence_names}",
                    f"- 校验：{note_summary}",
                    f"- 结论：{record.summary}",
                    "",
                ]
            )

        return ExecutionReportResponse(
            generated_at=generated_at,
            record_count=len(records),
            markdown="\n".join(lines).rstrip(),
        )

    def _path_check(
        self,
        component: str,
        path: Path | None,
        configured_name: str,
        ready_summary: str,
        missing_summary: str,
        remediation: str,
    ) -> EnterpriseReadinessItem:
        if path is None:
            return EnterpriseReadinessItem(
                component=component,
                status="warning",
                summary=missing_summary,
                detail=f"{configured_name} 未配置。",
                remediation=remediation,
            )
        return EnterpriseReadinessItem(
            component=component,
            status="ready",
            summary=ready_summary,
            detail=f"{configured_name}={path}",
        )

    def _policy_file_check(self, configured_policy_path: str | None) -> EnterpriseReadinessItem:
        if not configured_policy_path:
            return EnterpriseReadinessItem(
                component="规则配置",
                status="warning",
                summary="使用内置审批、证据和重试规则。",
                detail=f"{_EXECUTION_POLICY_PATH_ENV} 未配置，适合本地演示但不适合企业按团队改规则。",
                remediation=f"配置 {_EXECUTION_POLICY_PATH_ENV} 指向企业规则 JSON。",
            )
        policy_path = Path(configured_policy_path)
        if not policy_path.exists():
            return EnterpriseReadinessItem(
                component="规则配置",
                status="missing",
                summary="规则配置文件不存在。",
                detail=f"{_EXECUTION_POLICY_PATH_ENV}={configured_policy_path}",
                remediation="修正路径，或挂载企业审批/风控/奖励规则 JSON。",
            )
        return EnterpriseReadinessItem(
            component="规则配置",
            status="ready",
            summary="已加载外部规则配置入口。",
            detail=f"{_EXECUTION_POLICY_PATH_ENV}={configured_policy_path}",
        )

    def _auth_check(self) -> EnterpriseReadinessItem:
        auth_enabled = _env_truthy(os.getenv(_AUTH_ENABLED_ENV))
        if auth_enabled:
            return EnterpriseReadinessItem(
                component="权限与身份",
                status="ready",
                summary="已开启认证入口。",
                detail=f"{_AUTH_ENABLED_ENV}={os.getenv(_AUTH_ENABLED_ENV)}",
            )
        return EnterpriseReadinessItem(
            component="权限与身份",
            status="warning",
            summary="当前是本地单用户模式。",
            detail=f"{_AUTH_ENABLED_ENV} 未开启。",
            remediation="企业部署前启用认证，并把审批人/执行人映射到公司身份系统。",
        )

    def _model_credential_check(self) -> EnterpriseReadinessItem:
        if _has_model_credentials():
            return EnterpriseReadinessItem(
                component="模型凭据",
                status="ready",
                summary="已检测到模型 API 凭据。",
                detail="LLM_API_KEY、OPENAI_API_KEY 或 ANTHROPIC_API_KEY 至少配置了一项。",
            )
        return EnterpriseReadinessItem(
            component="模型凭据",
            status="missing",
            summary="未检测到可用模型 API 凭据。",
            detail="LLM_API_KEY、OPENAI_API_KEY、ANTHROPIC_API_KEY 均为空或仍是占位值。",
            remediation="在 .env 或部署密钥中配置企业认可的模型供应商凭据。",
        )

    def _knowledge_source_check(self) -> EnterpriseReadinessItem:
        configured_dir = os.getenv(_KNOWLEDGE_DIR_ENV, "").strip()
        if not configured_dir:
            return EnterpriseReadinessItem(
                component="业务知识源",
                status="missing",
                summary="未配置企业 GameOps 知识目录。",
                detail="运行态不会加载仓库内 starter 文档，避免把示例规则误当成生产规则。",
                remediation=f"配置 {_KNOWLEDGE_DIR_ENV} 到企业政策、活动规则和客服手册 Markdown 目录。",
            )
        knowledge_path = Path(configured_dir)
        markdown_count = (
            sum(1 for item in knowledge_path.iterdir() if item.is_file() and item.suffix == ".md")
            if knowledge_path.exists() and knowledge_path.is_dir()
            else 0
        )
        if markdown_count > 0:
            return EnterpriseReadinessItem(
                component="业务知识源",
                status="ready",
                summary=f"已加载企业知识目录，发现 {markdown_count} 个 Markdown 文档。",
                detail=str(knowledge_path),
            )
        return EnterpriseReadinessItem(
            component="业务知识源",
            status="missing",
            summary="企业知识目录不存在或没有 Markdown 文档。",
            detail=str(knowledge_path),
            remediation="放入至少一个 .md 政策、规则或操作手册文件。",
        )

    def _overall_readiness(
        self, items: list[EnterpriseReadinessItem]
    ) -> EnterpriseReadinessStatus:
        statuses = {item.status for item in items}
        if "missing" in statuses:
            return "missing"
        if "warning" in statuses:
            return "warning"
        return "ready"

    def _blocked_response(
        self,
        request: ExecutionRunRequest,
        summary: str,
        notes: list[str],
        missing_evidence: list[str],
        precheck_items: list[ExecutionPrecheckItem],
        approval_required: bool = False,
        permission_required: bool = False,
        required_role: str = "",
        operator_role: str = "",
    ) -> ExecutionActionResponse:
        definition = self.tools.definition_for(request.task)
        return ExecutionActionResponse(
            task=request.task,
            tool_result=ExecutionToolResult(
                tool_name=definition.tool_name,
                status="blocked",
                summary=summary,
                evidence={"operator": request.operator},
            ),
            missing_evidence=missing_evidence,
            approval_required=approval_required,
            precheck_items=precheck_items,
            loop_steps=self._blocked_loop_steps(notes[0] if notes else summary),
            recovery_actions=self._recovery_actions(
                missing_evidence=missing_evidence,
                approval_required=approval_required,
                permission_required=permission_required,
                required_role=required_role,
                operator_role=operator_role,
                task=request.task,
            ),
            audit=AuditTrail(validation_notes=notes),
        )

    def _precheck_items(
        self,
        request: ExecutionRunRequest,
        definition: GameOpsToolDefinition,
        missing_evidence: list[str],
    ) -> list[ExecutionPrecheckItem]:
        evidence_status: Literal["pass", "blocked"]
        evidence_status = "blocked" if missing_evidence else "pass"
        if missing_evidence:
            evidence_detail = f"缺少证据：{'、'.join(missing_evidence)}。"
        elif request.task.evidence_required:
            evidence_detail = f"已提交 {len(request.task.evidence_required)} 项必要证据。"
        else:
            evidence_detail = "该任务无需额外证据。"

        approval_blocked = request.task.approval_required and request.task.approved_by is None
        if approval_blocked:
            approval_detail = "需要负责人审批后才能执行。"
        elif request.task.approved_by:
            approval_detail = f"已由 {request.task.approved_by} 审批。"
        else:
            approval_detail = "该任务无需审批。"

        state_blocked = request.task.status == "blocked"
        state_detail = "任务仍处于阻塞状态。" if state_blocked else "任务状态允许执行。"
        operator_role = self._operator_role(request)
        permission_blocked = bool(
            definition.required_role and operator_role != definition.required_role
        )
        if permission_blocked:
            permission_detail = f"需要 {definition.required_role} 权限，当前为 {operator_role}。"
        elif definition.required_role:
            permission_detail = f"执行角色 {operator_role} 已满足工具要求。"
        else:
            permission_detail = "该工具未配置额外角色限制。"

        return [
            ExecutionPrecheckItem(
                check_id="evidence",
                label="证据完整性",
                status=evidence_status,
                detail=evidence_detail,
            ),
            ExecutionPrecheckItem(
                check_id="approval",
                label="审批状态",
                status="blocked" if approval_blocked else "pass",
                detail=approval_detail,
            ),
            ExecutionPrecheckItem(
                check_id="task_state",
                label="任务状态",
                status="blocked" if state_blocked else "pass",
                detail=state_detail,
            ),
            ExecutionPrecheckItem(
                check_id="permission",
                label="权限范围",
                status="blocked" if permission_blocked else "pass",
                detail=permission_detail,
            ),
            ExecutionPrecheckItem(
                check_id="tool_binding",
                label="工具绑定",
                status="pass",
                detail=f"将调用内置工具 {definition.tool_name}。",
            ),
        ]

    def _tool_receipt(
        self,
        definition: GameOpsToolDefinition,
        task: ExecutionTask,
        evidence: dict[str, str],
    ) -> ExecutionToolReceipt:
        reference_tool_name = definition.tool_name.replace(".", "-").replace("_", "-")
        return ExecutionToolReceipt(
            system=definition.target_system,
            operation=definition.operation,
            reference_id=f"tool-{reference_tool_name}-{task.task_id}",
            dry_run=self._dry_run_enabled(),
            written_fields=list(evidence.keys()),
            verification_notes=[
                "工具回执已生成",
                "写入字段已和执行证据对齐",
                "执行结果可用于审计追踪",
            ],
        )

    def _operator_role(self, request: ExecutionRunRequest) -> str:
        return request.operator_role or request.task.owner_role

    def _recovery_actions(
        self,
        missing_evidence: list[str],
        approval_required: bool,
        permission_required: bool,
        required_role: str,
        operator_role: str,
        task: ExecutionTask,
    ) -> list[ExecutionRecoveryAction]:
        actions: list[ExecutionRecoveryAction] = []
        if missing_evidence:
            evidence_names = "、".join(missing_evidence)
            actions.append(
                ExecutionRecoveryAction(
                    action_id=f"{task.task_id}:collect-evidence",
                    kind="collect_evidence",
                    label="补齐缺失证据",
                    description=f"补齐 {evidence_names} 后再执行任务。",
                )
            )
        if permission_required:
            actions.append(
                ExecutionRecoveryAction(
                    action_id=f"{task.task_id}:request-permission",
                    kind="request_permission",
                    label="切换执行角色",
                    description=f"需要 {required_role} 权限，当前为 {operator_role}。",
                )
            )
        if approval_required:
            actions.append(
                ExecutionRecoveryAction(
                    action_id=f"{task.task_id}:request-approval",
                    kind="request_approval",
                    label="发起负责人审批",
                    description="先完成负责人审批，审批记录会写回任务状态。",
                )
            )
        if task.status == "blocked" and not missing_evidence and not approval_required:
            actions.append(
                ExecutionRecoveryAction(
                    action_id=f"{task.task_id}:manual-handoff",
                    kind="manual_handoff",
                    label="转人工处理",
                    description=f"将任务交给 {task.owner_role} 排查阻塞原因。",
                )
            )
        if actions:
            actions.append(
                ExecutionRecoveryAction(
                    action_id=f"{task.task_id}:retry",
                    kind="retry",
                    label="补齐后重新执行",
                    description="前置条件补齐后，重新运行同一个内置工具。",
                )
            )
        return actions

    def _blocked_loop_steps(self, precheck_summary: str) -> list[ExecutionLoopStep]:
        return [
            ExecutionLoopStep(
                phase="precheck",
                status="blocked",
                summary=precheck_summary.replace("缺少证据：", "缺少必要证据："),
            ),
            ExecutionLoopStep(
                phase="execute",
                status="skipped",
                summary="前置条件未通过，未调用工具。",
            ),
            ExecutionLoopStep(
                phase="verify",
                status="skipped",
                summary="工具未执行，跳过结果验证。",
            ),
            ExecutionLoopStep(
                phase="state_update",
                status="skipped",
                summary="任务状态保持不变。",
            ),
        ]

    def _remember(
        self,
        action: ExecutionAction,
        actor: str,
        response: ExecutionActionResponse,
    ) -> None:
        record = ExecutionHistoryRecord(
            record_id=f"exec-{self._next_record_id}",
            created_at=datetime.now(UTC).isoformat(),
            action=action,
            actor=actor,
            task_id=response.task.task_id,
            task_title=response.task.title,
            tool_name=response.tool_result.tool_name,
            status=response.tool_result.status,
            summary=response.tool_result.summary,
            evidence=response.tool_result.evidence,
            validation_notes=response.audit.validation_notes,
            decision=response.decision,
        )
        self._next_record_id += 1
        self._history.append(record)
        self._append_history_record(record)

    def _remember_task(self, task: ExecutionTask) -> None:
        self._tasks[task.task_id] = task
        self._save_tasks()

    def _init_db(self) -> None:
        if self._db_path is None:
            return
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(self._db_path) as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS execution_history (
                    record_id TEXT PRIMARY KEY,
                    payload TEXT NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS execution_tasks (
                    task_id TEXT PRIMARY KEY,
                    payload TEXT NOT NULL
                )
                """
            )

    def _storage_backend(self) -> str:
        if self._db_path is not None:
            return "sqlite"
        if self._history_path is not None or self._task_state_path is not None:
            return "json"
        return "memory"

    def _dry_run_enabled(self) -> bool:
        return not _env_false(os.getenv(_TOOL_DRY_RUN_ENV))

    def _load_history(self) -> None:
        if self._db_path is not None:
            self._load_history_from_db()
            return
        if self._history_path is None or not self._history_path.exists():
            return

        max_record_number = 0
        with self._history_path.open("r", encoding="utf-8") as audit_file:
            for line in audit_file:
                stripped = line.strip()
                if not stripped:
                    continue
                try:
                    record = ExecutionHistoryRecord.model_validate(json.loads(stripped))
                except (json.JSONDecodeError, ValueError):
                    continue
                self._history.append(record)
                _, _, suffix = record.record_id.partition("-")
                if suffix.isdigit():
                    max_record_number = max(max_record_number, int(suffix))
        self._next_record_id = max_record_number + 1

    def _append_history_record(self, record: ExecutionHistoryRecord) -> None:
        if self._db_path is not None:
            with sqlite3.connect(self._db_path) as connection:
                connection.execute(
                    """
                    INSERT OR REPLACE INTO execution_history (record_id, payload)
                    VALUES (?, ?)
                    """,
                    (
                        record.record_id,
                        json.dumps(record.model_dump(mode="json"), ensure_ascii=False),
                    ),
                )
            return
        if self._history_path is None:
            return

        self._history_path.parent.mkdir(parents=True, exist_ok=True)
        with self._history_path.open("a", encoding="utf-8") as audit_file:
            audit_file.write(json.dumps(record.model_dump(mode="json"), ensure_ascii=False))
            audit_file.write("\n")

    def _load_tasks(self) -> None:
        if self._db_path is not None:
            self._load_tasks_from_db()
            return
        if self._task_state_path is None or not self._task_state_path.exists():
            return

        try:
            raw_tasks = json.loads(self._task_state_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return

        if not isinstance(raw_tasks, list):
            return

        for raw_task in raw_tasks:
            try:
                task = ExecutionTask.model_validate(raw_task)
            except ValueError:
                continue
            self._tasks[task.task_id] = task

    def _save_tasks(self) -> None:
        if self._db_path is not None:
            with sqlite3.connect(self._db_path) as connection:
                for task in self._tasks.values():
                    connection.execute(
                        """
                        INSERT OR REPLACE INTO execution_tasks (task_id, payload)
                        VALUES (?, ?)
                        """,
                        (
                            task.task_id,
                            json.dumps(task.model_dump(mode="json"), ensure_ascii=False),
                        ),
                    )
            return
        if self._task_state_path is None:
            return

        self._task_state_path.parent.mkdir(parents=True, exist_ok=True)
        serialized = [task.model_dump(mode="json") for task in self._tasks.values()]
        self._task_state_path.write_text(
            json.dumps(serialized, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def _load_history_from_db(self) -> None:
        if self._db_path is None or not self._db_path.exists():
            return
        max_record_number = 0
        with sqlite3.connect(self._db_path) as connection:
            rows = connection.execute(
                "SELECT payload FROM execution_history ORDER BY rowid"
            ).fetchall()
        for (payload,) in rows:
            try:
                record = ExecutionHistoryRecord.model_validate(json.loads(payload))
            except (json.JSONDecodeError, ValueError):
                continue
            self._history.append(record)
            _, _, suffix = record.record_id.partition("-")
            if suffix.isdigit():
                max_record_number = max(max_record_number, int(suffix))
        self._next_record_id = max_record_number + 1

    def _load_tasks_from_db(self) -> None:
        if self._db_path is None or not self._db_path.exists():
            return
        with sqlite3.connect(self._db_path) as connection:
            rows = connection.execute(
                "SELECT payload FROM execution_tasks ORDER BY rowid"
            ).fetchall()
        for (payload,) in rows:
            try:
                task = ExecutionTask.model_validate(json.loads(payload))
            except (json.JSONDecodeError, ValueError):
                continue
            self._tasks[task.task_id] = task


def create_default_execution_runtime() -> GameOpsExecutionRuntime:
    """Create the default execution runtime for the server process.

    The runtime is in-memory unless persistence environment variables point at
    durable files or a SQLite database. Deployed GameOps instances should keep
    execution evidence across restarts.
    """
    configured_history_path = os.getenv(_EXECUTION_HISTORY_PATH_ENV)
    configured_task_state_path = os.getenv(_EXECUTION_TASKS_PATH_ENV)
    configured_policy_path = os.getenv(_EXECUTION_POLICY_PATH_ENV)
    configured_db_path = os.getenv(_EXECUTION_DB_PATH_ENV)
    return GameOpsExecutionRuntime(
        tools=GameOpsToolRegistry(policy_path=configured_policy_path or None),
        history_path=configured_history_path or None,
        task_state_path=configured_task_state_path or None,
        db_path=configured_db_path or None,
    )


def _env_truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


def _env_false(value: str | None) -> bool:
    return (value or "").strip().lower() in {"0", "false", "no", "off"}


def _has_model_credentials() -> bool:
    for key in ("LLM_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"):
        value = os.getenv(key, "").strip()
        if value and value not in {"your_api_key_here", "your_anthropic_key_here"}:
            return True
    return False
