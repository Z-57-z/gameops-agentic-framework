# GameOps Agentic Framework

GameOps Agentic Framework is a portfolio-ready agent platform for game operations knowledge work. It combines a FastAPI/WebSocket coordination server, a browser UI, CLI-driven agent sessions, RAG-oriented workflows, and multi-agent orchestration patterns that can be adapted for game operations, live-ops support, content operations, and internal knowledge assistants.

> **Provenance and license**
> This repository is a fork/derivative work based on the Apache-2.0 licensed Omnigent project. Original license and copyright notices are preserved in [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE). This project is not affiliated with or endorsed by the original Omnigent maintainers.

## Why this project exists

This fork is prepared as a GameOps-focused engineering project for GitHub and résumé展示：

- **GameOps knowledge workflows**: model game operations scenarios such as event FAQ, runbook Q&A, support triage, and source-backed answer generation.
- **Agentic orchestration**: run and supervise coding/analysis agents through a shared server and CLI harness.
- **RAG-friendly backend**: keep the architecture ready for retrieval, evidence display, evaluation, and bad-case analysis.
- **Deployable demo surface**: include a web UI, Docker deployment, server APIs, and local CLI flows suitable for project demonstrations.
- **Engineering depth**: preserve the original framework's sandboxing, policies, runtime, SDKs, tests, and deployment templates while rebranding the public project identity.

## Repository identity

- Repository: [Z-57-z/gameops-agentic-framework](https://github.com/Z-57-z/gameops-agentic-framework)
- Python distribution: `gameops-agentic-framework`
- CLI command: `gameops-agent`
- Client SDK distribution: `gameops-agentic-client`
- UI SDK distribution: `gameops-agentic-ui-sdk`
- Server image target: `ghcr.io/z-57-z/gameops-agentic-framework-server`
- Host image target: `ghcr.io/z-57-z/gameops-agentic-framework-host`

Implementation note: the internal Python package namespace is still `omnigent` in this first-stage fork rename. That keeps the existing runtime, tests, import paths, and packaging data stable while the public project name, repository, distribution metadata, CLI, docs, and deployment targets move to GameOps Agentic Framework.

## Local Docker app quickstart

The easiest way to run the demo from a fresh clone is the root Docker Compose stack. It starts Postgres, the FastAPI/WebSocket server, the embedded web UI, and a separate Linux host/runner container that owns tmux/PTY terminal processes.

```bash
git clone https://github.com/Z-57-z/gameops-agentic-framework.git
cd gameops-agentic-framework
cp .env.example .env
# Edit .env with YOUR OWN model API key, base URL, and model.
docker compose up --build
```

Open http://localhost:8080 after the server finishes booting.

This local stack is a single-user Demo/MVP deployment. It is useful for GitHub reviewers, résumé walkthroughs, and local development, but it should not be exposed to an untrusted network without enabling real authentication and reviewing the deployment settings.

Model access is bring-your-own-key: `.env` stays on your machine, is ignored by git, and should contain your own OpenAI-compatible or Anthropic API settings. The app reports only non-secret provider/model status through `/v1/info`; it never returns API keys to the browser.

See [`docs/local-docker-deploy.md`](docs/local-docker-deploy.md) for provider examples and troubleshooting.

## Quick start from this repository

For native development without Docker:

```bash
git clone https://github.com/Z-57-z/gameops-agentic-framework.git
cd gameops-agentic-framework
uv python install
uv venv --python "$(cat .python-version)"
uv sync --extra all --extra dev
uv run gameops-agent --help
```

For a Git source install:

```bash
uv tool install -q --python 3.12 git+https://github.com/Z-57-z/gameops-agentic-framework.git
gameops-agent --help
```

## Run locally

Start the local server and web UI:

```bash
uv run gameops-agent server start
uv run gameops-agent host
```

Then open the local web UI printed by the server. The host process lets the web UI start sessions on your machine and stream terminal/session events back to the browser.

## Development checks

Python checks:

```bash
uv run pytest
uv run ruff check .
uv run ruff format --check .
```

Frontend checks:

```bash
cd ap-web
npm install --legacy-peer-deps
npm run lint
npm run type-check
npm run test
npm run build
```

## Deployment notes

Deployment templates are under [`deploy/`](deploy/). The public image names have been retargeted to this repository namespace:

- `ghcr.io/z-57-z/gameops-agentic-framework-server:latest`
- `ghcr.io/z-57-z/gameops-agentic-framework-host:latest`

Before enabling public image or PyPI release workflows, verify the repository settings, GitHub Actions permissions, GHCR package visibility, and PyPI trusted publisher configuration for `Z-57-z/gameops-agentic-framework`.

## What is safe to publish

This repository is intended to be uploaded to the user's own GitHub repository after these checks pass:

```bash
git status --short --branch
git remote -v
# Scan for accidental local-machine paths, private files, old upstream repository,
# old upstream domain, or old upstream image references before publishing.
# Keep LICENSE/NOTICE provenance references intact.
```

## License

Apache-2.0. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE). Original notices are preserved because this is a derivative work.
