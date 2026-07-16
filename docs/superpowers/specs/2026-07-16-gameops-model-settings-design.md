# GameOps Model Settings Design

## Goal

Allow a local GameOps operator to select and configure the LLM used by AI compensation approval without editing `.env`. The configuration must never expose a stored API key, must work after a project clone, and must become administrator-only when authentication is enabled.

## Modes

- Local single-user mode: the visible model-settings panel permits configuration because the deployment has no shared user boundary.
- Authenticated mode: only an administrator may view or update model settings. Other users can see non-secret model availability in the GameOps console.
- Fresh clone: no key or model is bundled. The first local operator configures their own provider, or the deployer supplies environment variables.

## Configuration

The panel supports OpenAI, DeepSeek, Tongyi-compatible, and custom OpenAI-compatible providers. It collects provider, model name, optional base URL, and API key.

The server stores a single active GameOps model configuration in its local persistent store. API keys are encrypted at rest with a server-local encryption key. Reads return only provider, model, base URL host, configuration version, configured state, and a masked key suffix. The API key is accepted only by write endpoints and is never returned, logged, audited, or rendered after submission.

Deployment environment variables remain higher priority than saved settings. When environment credentials are present, the UI labels them as deployment-managed and disables key editing.

## API

- `GET /v1/gameops/model-settings`: return non-secret active configuration and whether the caller may edit it.
- `PUT /v1/gameops/model-settings`: validate and save provider, model, URL, and a replacement API key. No key in the request means retain the existing saved key.
- `POST /v1/gameops/model-settings/test`: test the candidate configuration with a minimal model request before saving it.

All endpoints reuse the existing GameOps API key protection. In authenticated mode, they additionally require an administrator identity.

## Runtime

`create_configured_gameops_llm_client()` resolves configuration in this order:

1. Deployment environment variables.
2. The active encrypted GameOps model setting.
3. No client, which makes AI approval fail closed into manual review.

Every AI decision records model ID and configuration version, never the credential.

## UI

Add a compact Model Settings dialog to the GameOps console. It contains provider selection, model, URL, password-style API key input, a test-connection action, save action, active-status label, and clear error state. The panel shows a deployment-managed badge when environment variables override saved settings.

## Safety and Tests

- Validate HTTPS URLs except loopback development endpoints.
- Reject empty model names and empty API keys on first save.
- Keep the prior active configuration if connection validation or persistence fails.
- Test no-key exposure through GET responses, masked key display, environment override, local-mode edit access, authenticated non-admin denial, successful connection test, and fail-closed AI approval when no usable configuration exists.
