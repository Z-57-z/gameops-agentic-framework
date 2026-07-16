# GameOps Model Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let local GameOps operators configure the LLM from the console while keeping credentials secret and enforcing administrator-only changes when authentication is enabled.

**Architecture:** A small persisted settings repository encrypts the API key before writing it to the existing GameOps SQLite store. Routes expose only a redacted status object and test a candidate before saving. The AI approval client resolves deployment environment variables first, then the saved setting, then fails closed. The console renders a model-settings dialog.

**Tech Stack:** Python, FastAPI, Pydantic, SQLite, `cryptography.fernet`, React, TypeScript, Vitest, pytest.

---

### Task 1: Define non-secret settings contracts

**Files:**
- Modify: `omnigent/gameops/schemas.py`
- Create: `tests/gameops/test_model_settings.py`

- [ ] **Step 1: Write failing redaction tests.**

```python
def test_public_settings_never_expose_api_key() -> None:
    public = ModelSettingsPublic(provider="openai", model="gpt-4o-mini", base_url="https://api.openai.com/v1", configured=True, key_suffix="...1234", source="saved", version=1)
    assert "api_key" not in public.model_dump()
```

- [ ] **Step 2: Run `pytest tests/gameops/test_model_settings.py -q`; expect an import failure.**

- [ ] **Step 3: Add `ModelSettingsUpdateRequest`, `ModelSettingsPublic`, and `ModelSettingsTestRequest` models.** The update request accepts `provider`, `model`, optional `base_url`, and write-only `api_key`; the public model contains `configured`, `key_suffix`, `source`, and `version`, but no credential field.

- [ ] **Step 4: Re-run the test; expect PASS.**

- [ ] **Step 5: Commit:** `git add omnigent/gameops/schemas.py tests/gameops/test_model_settings.py && git commit -m "feat: define model settings contracts"`.

### Task 2: Persist encrypted model settings

**Files:**
- Create: `omnigent/gameops/model_settings.py`
- Modify: `tests/gameops/test_model_settings.py`

- [ ] **Step 1: Write failing persistence tests.**

```python
def test_saved_api_key_is_encrypted_and_redacted(tmp_path: Path) -> None:
    store = GameOpsModelSettingsStore(tmp_path / "settings.db", encryption_key=Fernet.generate_key())
    store.save(_update(api_key="sk-test-1234"))
    assert "sk-test-1234" not in (tmp_path / "settings.db").read_bytes().decode("latin1")
    assert store.public().key_suffix == "...1234"
```

- [ ] **Step 2: Run `pytest tests/gameops/test_model_settings.py -q`; expect `GameOpsModelSettingsStore` to be missing.**

- [ ] **Step 3: Implement `GameOpsModelSettingsStore`.** Create a SQLite `gameops_model_settings` table with one active row. Obtain a Fernet key from `GAMEOPS_MODEL_SETTINGS_ENCRYPTION_KEY`; create a local random key file beside the SQLite database only in unauthenticated local mode. Encrypt before save, decrypt only in `resolved()`, and preserve the existing encrypted key when an update omits `api_key`.

- [ ] **Step 4: Add validation tests for empty first-save key, non-HTTPS remote URL, loopback HTTP URL, and replacement-key masking.**

- [ ] **Step 5: Re-run the tests; expect PASS. Commit:** `git add omnigent/gameops/model_settings.py tests/gameops/test_model_settings.py && git commit -m "feat: store encrypted GameOps model settings"`.

### Task 3: Resolve settings and test model connectivity

**Files:**
- Modify: `omnigent/gameops/llm_client.py`
- Modify: `omnigent/gameops/compensation_approval.py`
- Modify: `tests/gameops/test_model_settings.py`

- [ ] **Step 1: Write failing resolution tests.**

```python
def test_environment_credentials_override_saved_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LLM_API_KEY", "env-key")
    client = create_configured_gameops_llm_client(store=_saved_store())
    assert client.model_id == "env-model"
```

- [ ] **Step 2: Run the test; expect the factory not to accept a store.**

- [ ] **Step 3: Extend the factory.** Resolve environment variables first, then `store.resolved()`, otherwise return `None`. Add `test_model_settings(request)` that sends a minimal JSON-only request through a temporary `OpenAICompatibleGameOpsLLMClient` and returns a non-secret status. Pass the settings version through `AiApprovalDecision` so decisions identify the configuration revision.

- [ ] **Step 4: Re-run focused tests; expect PASS. Commit:** `git add omnigent/gameops/llm_client.py omnigent/gameops/compensation_approval.py tests/gameops/test_model_settings.py && git commit -m "feat: resolve configured GameOps models"`.

### Task 4: Expose protected settings endpoints

**Files:**
- Modify: `omnigent/server/routes/gameops.py`
- Modify: `tests/server/test_gameops_execution_route.py`

- [ ] **Step 1: Write failing endpoint tests.**

```python
def test_model_settings_get_is_redacted() -> None:
    body = _client(model_settings_store=_store()).get("/v1/gameops/model-settings").json()
    assert body["configured"] is True
    assert "api_key" not in body
```

- [ ] **Step 2: Run the test; expect 404.**

- [ ] **Step 3: Add `GET`, `PUT`, and `POST /v1/gameops/model-settings/test` routes.** In local mode, allow writes. With `OMNIGENT_AUTH_ENABLED=1`, require the existing administrator identity dependency before PUT or test. Reuse the existing GameOps API-key dependency and return only `ModelSettingsPublic`.

- [ ] **Step 4: Add authenticated non-admin denial and failed-connection-preserves-old-settings tests. Re-run; expect PASS.**

- [ ] **Step 5: Commit:** `git add omnigent/server/routes/gameops.py tests/server/test_gameops_execution_route.py && git commit -m "feat: expose GameOps model settings"`.

### Task 5: Add the GameOps settings dialog

**Files:**
- Modify: `ap-web/src/lib/gameopsApi.ts`
- Modify: `ap-web/src/pages/GameOpsPage.tsx`
- Modify: `ap-web/src/pages/GameOpsPage.test.tsx`

- [ ] **Step 1: Write failing UI tests.**

```tsx
it("shows saved model status without rendering the API key", async () => {
  render(<GameOpsPage />);
  await userEvent.click(screen.getByRole("button", { name: "模型设置" }));
  expect(await screen.findByText("gpt-4o-mini")).toBeInTheDocument();
  expect(screen.queryByText("sk-test-1234")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run `npm --prefix ap-web test -- GameOpsPage.test.tsx`; expect failure.**

- [ ] **Step 3: Add typed settings clients and a dialog.** Add provider presets, model, URL, password input, `测试连接`, and `保存配置`. Display deployment-managed status when `source === "environment"`; in local mode show the dialog, and in authenticated mode hide edit controls when `canEdit` is false.

- [ ] **Step 4: Add tests for connection failure, successful save, masked suffix, and non-admin read-only mode. Run UI tests and `npm --prefix ap-web run type-check`; expect PASS.**

- [ ] **Step 5: Commit:** `git add ap-web/src/lib/gameopsApi.ts ap-web/src/pages/GameOpsPage.tsx ap-web/src/pages/GameOpsPage.test.tsx && git commit -m "feat: configure GameOps models from console"`.

### Task 6: Verify deployment behavior

**Files:**
- Modify: `docs/local-docker-deploy.md`
- Modify: `tests/gameops/test_model_settings.py`

- [ ] **Step 1: Add an integration test proving a saved configuration enables a previously fail-closed AI approval evaluator.**

- [ ] **Step 2: Run backend verification:** `pytest tests/gameops/test_model_settings.py tests/gameops/test_compensation_approval.py tests/server/test_gameops_execution_route.py -q`. Expected: PASS.

- [ ] **Step 3: Document local configuration, Docker volume persistence, environment override, encryption-key backup, and the fact that keys are never returned by the API.**

- [ ] **Step 4: Run `npm --prefix ap-web test -- GameOpsPage.test.tsx && npm --prefix ap-web run build`; expect exit code 0.**

- [ ] **Step 5: Check and commit:** `git diff --check && git add docs/local-docker-deploy.md tests/gameops/test_model_settings.py && git commit -m "docs: explain GameOps model settings"`.

## Plan Review

- The six tasks cover every design requirement: local configuration, authenticated restrictions, encrypted persistence, non-secret reads, environment precedence, connection testing, AI-decision versioning, UI behavior, and deployment guidance.
- No implementation path logs or returns an API key.
