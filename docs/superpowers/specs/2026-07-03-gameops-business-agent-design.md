# GameOps Business Agent Design

Date: 2026-07-03

## Purpose

Turn GameOps Agentic Framework from a general coding-agent fork into a vertical GameOps business product. The product user should experience a purpose-built GameOps Agent, not a wrapper around Codex, Claude Code, Cursor, or another external agent product.

The first production slice is a source-backed GameOps Knowledge Agent. The next two slices are LiveOps Campaign Agent and Player Support Triage Agent. They share the same runtime, knowledge base, evidence model, and safety gates.

## Hard Product Constraint

The GameOps business path must not delegate business work to external agent products.

Allowed:

- Call an LLM API as a reasoning model, including OpenAI-compatible, Anthropic-compatible, or local model endpoints.
- Implement our own routing, planning, retrieval, tool calls, workflow state, answer validation, and output formatting.
- Reuse the existing FastAPI server, database, UI shell, auth, deployment, and model configuration plumbing.
- Use Codex during development as an engineering assistant.

Not allowed in the final business runtime:

- Sending GameOps user requests to Codex Agent, Claude Code, Cursor Agent, or another external agent product for task execution.
- Exposing Codex, Claude Code, Cursor, or vendor names as the primary user workflow.
- Letting an external agent decide business workflow steps, evidence policy, escalation policy, or output contracts.

## Product Shape

The primary user-facing product is GameOps Agent.

The user sees business modes, not model vendors:

- Knowledge Q&A
- LiveOps Campaign
- Player Support Triage
- Incident Runbook

Model/provider configuration remains an operator setting. The UI may show "model configured" or "model unavailable", but ordinary business users should not need to pick Codex, Claude, or GPT to complete a GameOps task.

## Architecture

Add a first-party package area under `omnigent/gameops/`.

Core modules:

- `knowledge_store`: loads curated GameOps documents from repository data files.
- `retriever`: deterministic lexical search with chunk scoring and source metadata.
- `workflow_router`: classifies a request into `knowledge_qa`, `campaign_ops`, `ticket_triage`, or `incident_runbook`.
- `tools`: first-party business tools such as knowledge search, campaign rule check, ticket triage, and runbook lookup.
- `llm_client`: thin API client for configured OpenAI-compatible model settings. It is a model call wrapper, not an external agent client.
- `agent_loop`: our own business loop that chooses tools, gathers evidence, calls the LLM, validates the answer, and returns a structured result.
- `schemas`: typed request/response objects for auditability and tests.

Server integration:

- Add FastAPI routes under `/v1/gameops`.
- Initial endpoint: `POST /v1/gameops/ask`.
- Later endpoints: `POST /v1/gameops/campaign/draft` and `POST /v1/gameops/tickets/triage`.
- Keep the existing general agent framework available for developer/admin use, but the default product path uses the GameOps runtime.

Frontend integration:

- Make the new user entry point a GameOps Agent workspace.
- Show business modes and example prompts.
- Hide external agent choices from the normal GameOps flow.
- Keep model/vendor information in a compact status area or advanced/admin surface.
- Render structured responses with sections for answer, sources, recommended action, risk, and missing information.

## Runtime Loop

For every GameOps request:

1. Normalize the user request.
2. Route it to a business workflow.
3. Retrieve relevant GameOps knowledge chunks.
4. Run workflow-specific first-party tools.
5. Call the configured LLM API with a strict system prompt, retrieved evidence, and output schema.
6. Validate the response:
   - Must cite retrieved sources for policy or factual claims.
   - Must mark unsupported claims as unknown or needs-human-review.
   - Must include risk level when compensation, account action, public announcement, event configuration, or incident handling is involved.
7. Return a structured response and an audit payload.

The loop is bounded. It does not recursively call another agent. The initial implementation can be single-pass with one retrieval step and one LLM call. Later implementation may add a small fixed retry loop for schema repair or missing citations.

## Knowledge Base

Ship a demo knowledge base in the repository so the product works out of the box.

Initial documents:

- `event_rebate_policy.md`: rules for limited-time recharge rebate events.
- `compensation_policy.md`: compensation limits, approval levels, and player communication rules.
- `support_faq.md`: common account, payment, reward, and event questions.
- `incident_runbook.md`: live incident severity, communication cadence, and escalation steps.
- `campaign_checklist.md`: pre-launch checks for activity setup and announcement review.

Each document has stable source metadata:

- source id
- title
- section
- path
- line range or chunk id

The answer renderer shows source references in a user-readable way.

## Phase 1: GameOps Knowledge Agent

Goal: prove the product is not generic model chat.

Capabilities:

- Answer GameOps policy and runbook questions.
- Search the curated knowledge base before answering.
- Cite the documents used.
- Refuse or downgrade unsupported answers.
- Produce recommended next actions.
- Show missing information when the knowledge base lacks coverage.

Acceptance examples:

- "A player missed the recharge rebate reward. What can support promise?"
- "Can we compensate all players with premium currency after a 30 minute login issue?"
- "What should ops check before launching a weekend event?"

Expected behavior:

- The answer references concrete policy/runbook sources.
- If a request asks for something above approval limits, the agent flags it.
- If sources are insufficient, the agent says what document or fact is missing.

## Phase 2: LiveOps Campaign Agent

Goal: make the agent operational, not just informational.

Capabilities:

- Draft event announcement and FAQ from campaign inputs.
- Check campaign setup against launch checklist.
- Flag missing start/end time, reward rules, eligibility, rollback plan, and support wording.
- Produce a risk review for public-facing campaign changes.

This phase reuses the knowledge store, retriever, response schema, and risk gates from Phase 1.

## Phase 3: Player Support Triage Agent

Goal: handle realistic support workflow.

Capabilities:

- Classify incoming player tickets.
- Assign priority and escalation path.
- Suggest support response grounded in policy.
- Identify required missing data such as player id, server id, order id, event id, timestamp, and screenshots.
- Mark sensitive account/payment/ban cases for human review.

This phase reuses the same runtime and adds ticket-specific schemas and tools.

## UI Direction

The default first screen should feel like a GameOps console:

- Title: GameOps Agent.
- Mode tabs: Knowledge, Campaign, Tickets, Incident.
- Prompt examples are business scenarios.
- Responses render as structured operational cards, not free-form chat only.
- External agent pickers are removed from the normal path or moved to an advanced developer area.

The old Codex/Claude/Cursor agent picker can remain for framework demo/admin use, but it must not be the primary GameOps product surface.

## Testing Strategy

Backend:

- Unit tests for document loading and chunk metadata.
- Retriever tests for expected top sources.
- Workflow router tests for the four modes.
- Agent loop tests with a fake LLM client.
- Guardrail tests for unsupported claims, missing citations, and risk escalation.

Frontend:

- Tests that the GameOps entry point hides vendor-first choices.
- Tests that structured responses show sources, risk, and next action.
- Tests for mode switching and example prompt submission.

End-to-end demo:

- Docker stack starts.
- `/v1/info` reports configured model status.
- `/v1/gameops/ask` answers with sources using demo knowledge.
- Browser first screen presents GameOps Agent as the product.

## Out of Scope For This Design

- Full vector database integration.
- Real enterprise ticket system integration.
- Real game backend mutations.
- Public network hardening beyond the existing local demo warning.
- Replacing every inherited Omnigent/Codex/Claude admin surface.

These can follow after the vertical runtime is demonstrably real.

## Implementation Order

1. Add `omnigent/gameops/` runtime modules and demo knowledge files.
2. Add backend endpoint `POST /v1/gameops/ask`.
3. Add tests with fake LLM responses.
4. Add frontend GameOps entry surface.
5. Update README demo walkthrough.
6. Extend the same runtime with campaign and ticket workflows.

## Success Criteria

The project is no longer just "a UI that can call Codex or Claude." It demonstrates a first-party GameOps business agent:

- first-party runtime loop
- first-party business tools
- source-backed knowledge answers
- risk and escalation rules
- business-first UI
- no external agent product in the business execution path

