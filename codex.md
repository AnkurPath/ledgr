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
- `ledgr/db.py`: SQLModel/SQLAlchemy engine and request session dependency.
- `ledgr/models.py`: SQLModel table models used by Alembic autogenerate.
- `ledgr/expenses.py`: REST endpoints for expense CRUD and daily summaries.
- `ledgr/schemas.py`: Pydantic request and response models plus money conversion helpers.
- `ledgr/config.py`: Environment-backed settings.
- `alembic/env.py`: Alembic migration environment wired to SQLModel metadata.
- `alembic/versions/0001_create_expenses.py`: Initial expenses table migration.
- `tests/test_expenses_api.py`: API tests using an in-memory SQLite database.
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
- Use REST resource naming. Current expense routes live under `/expenses`.
- Store money as integer cents and expose decimal strings through the API.
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
