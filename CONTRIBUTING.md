# Contributing to GameOps Agentic Framework

Thanks for your interest in improving GameOps Agentic Framework. Issues and pull requests are welcome in [Z-57-z/gameops-agentic-framework](https://github.com/Z-57-z/gameops-agentic-framework).

Please do not include secrets, internal URLs, customer data, private configuration, or live credentials in issues, tests, examples, or logs.

## Development setup

```bash
git clone https://github.com/Z-57-z/gameops-agentic-framework.git
cd gameops-agentic-framework
uv python install
uv venv --python "$(cat .python-version)"
uv sync --extra all --extra dev
source .venv/bin/activate    # or prefix commands with `uv run`
```

Common checks:

```bash
uv run pytest
uv run ruff check .
uv run ruff format --check .
```

When touching the frontend:

```bash
cd ap-web
npm install --legacy-peer-deps
npm run lint
npm run type-check
npm run build
```

## Running locally

Use separate terminals:

```bash
uv run gameops-agent server start
uv run gameops-agent host
cd ap-web && npm run dev
```

Open the Vite dev URL, usually `http://localhost:5173/`.

## Testing guidance

A change that alters behavior under `omnigent/` should include a focused unit or integration test. Pure renames, documentation edits, metadata updates, and type-only changes usually do not need new tests.

The internal Python package namespace remains `omnigent` during this first-stage fork rename, so test paths and imports may still use that namespace.
