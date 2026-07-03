from omnigent.gameops.schemas import WorkflowKind
from omnigent.gameops.workflow_router import route_workflow


def test_routes_campaign_launch_questions_to_campaign_ops() -> None:
    assert (
        route_workflow("Draft weekend event announcement and check launch setup")
        == WorkflowKind.CAMPAIGN_OPS
    )


def test_routes_payment_ticket_to_ticket_triage() -> None:
    assert route_workflow("Player ticket: payment succeeded but rewards missing") == WorkflowKind.TICKET_TRIAGE


def test_routes_incident_to_incident_runbook() -> None:
    assert (
        route_workflow("30 minute login outage, what escalation cadence should ops use?")
        == WorkflowKind.INCIDENT_RUNBOOK
    )


def test_defaults_to_knowledge_qa() -> None:
    assert route_workflow("Can support promise a rebate replacement?") == WorkflowKind.KNOWLEDGE_QA


def test_routes_login_issue_compensation_to_incident_runbook() -> None:
    assert (
        route_workflow("Can we compensate all players with premium currency after a 30 minute login issue?")
        == WorkflowKind.INCIDENT_RUNBOOK
    )
