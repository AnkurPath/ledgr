# Codex Guide

This file is a working guide for LLM agents editing this repository.

## Project Snapshot

`ledgr` is a Python FastAPI backend for a personal finance application.

- Runtime: Python 3.9, pinned by `.python-version`.
- Package metadata: `pyproject.toml`.
- Lockfile/tooling: `uv.lock`, generated for `uv`.
- Entry point: `main.py`, which runs `ledgr.app:app` with Uvicorn.
- Persistence: PostgreSQL through SQLModel/SQLAlchemy.
- Migrations: Alembic in `alembic/`.
- First domain resource: daily expenses.
- Dependencies: FastAPI, SQLModel, psycopg, Alembic, and Uvicorn. Dev dependencies include pytest and httpx.
- Container runtime: `docker-compose.yml` for local PostgreSQL.

The repository history/status may still reference an older Rust API and Next.js web app, but those files are not present in the current workspace. Do not assume `Cargo.toml`, `api/`, or `web/` exist unless they are restored.

## Files

- `main.py`: Python executable entry point for the API server.
- `ledgr/app.py`: FastAPI app, health endpoint, router registration.
- `ledgr/core/config.py`: Environment-backed settings.
- `ledgr/core/db.py`: SQLModel/SQLAlchemy engine and request session dependency.
- `ledgr/features/users/`: User models, setup models, schemas, service helpers, and REST router for user-scoped accounts, categories, and tags.
- `ledgr/features/expenses/`: Expense models, schemas, service helpers, and REST router.
- `ledgr/features/budget_transactions/`: Placeholder package for budget transaction tracking.
- `ledgr/features/budgets/`: Placeholder package for budget planning and limits.
- `ledgr/features/mutual_funds/`: Placeholder package for Indian mutual fund portfolio tracking.
- `ledgr/features/equity_portfolio/`: Placeholder package for Indian equity portfolio tracking.
- `ledgr/features/global_portfolio/`: Placeholder package for global asset tracking.
- `ledgr/db.py`, `ledgr/models.py`, `ledgr/expenses.py`, `ledgr/schemas.py`, `ledgr/config.py`: Compatibility facades for older imports.
- `alembic/env.py`: Alembic migration environment wired to SQLModel metadata.
- `alembic/versions/0001_create_expenses.py`: Initial expenses table migration.
- `alembic/versions/0002_create_user_setup.py`: Users plus user-scoped setup tables for accounts, categories, and tags.
- `tests/test_expenses_api.py`, `tests/test_user_setup_api.py`: API tests using an in-memory SQLite database.
- `bruno/`: Bruno API collection for local manual testing.
- `Dockerfile`: Builds the FastAPI app image using `uv`, but is not used by the current development compose setup.
- `docker-compose.yml`: Starts only PostgreSQL for local development.
- `.dockerignore`: Keeps local env, cache, and VCS files out of Docker build context.
- `pyproject.toml`: Python project definition for package `ledgr`, version `0.1.0`, Python `>=3.9`, dependencies, and dev dependency group.
- `uv.lock`: Lockfile for the current Python project.
- `.python-version`: Requests Python `3.9`.
- `.env.example`: Documents `LEDGR_DATABASE_URL`.
- `README.md`: Setup, run, test, and endpoint overview.
- `.gitignore`: Ignores Rust `target/` and local environment files.

## Common Commands

Use these from the repository root:

```sh
uv run alembic upgrade head
uv run main.py
```

If `uv` is unavailable, the current app can also run directly:

```sh
python main.py
```

Run tests:

```sh
uv run pytest
```

Open API collection:

```sh
bruno/
```

Run with Docker:

```sh
docker compose up -d
```

## Development Notes

- Keep changes scoped to the active Python project unless the user explicitly asks to restore or rebuild the older Rust/Next architecture.
- Keep feature-specific code under `ledgr/features/<feature>/`. Prefer `models.py`, `schemas.py`, `router.py`, and service/query helpers within the feature package.
- Keep shared infrastructure under `ledgr/core/`.
- Import every SQLModel table model from `ledgr/models.py` so Alembic autogenerate sees all feature tables.
- User setup data must be scoped by `user_id`; do not expose global account, category, or tag setup lists.
- Use REST resource naming. Current expense routes live under `/expenses`.
- Store Indian currency amounts as decimal rupee values with two fractional digits.
- Use Alembic for schema changes. Update SQLAlchemy models first, then run `uv run alembic revision --autogenerate -m "..."`.
- In Docker Compose, only Postgres runs. Local app and Alembic should use `postgresql+psycopg://postgres:postgres@localhost:5433/ledgr`.
- If adding dependencies, update `pyproject.toml` and refresh `uv.lock` with `uv`.
- If adding application configuration, update `.env.example`.
- Keep tests focused around API behavior and persistence boundaries.
- Keep the Bruno collection in sync when adding or changing API routes.
- Do not commit `.env`, `.env.*`, `.venv`, or `.DS_Store`.

## Current Gaps

- `.gitignore` still contains `/target`, which only matters if Rust code is restored.
- No formatter or linter has been chosen yet.
