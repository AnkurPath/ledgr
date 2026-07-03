# Codex Guide

This guide describes the current repository shape and recent behavior changes so agents can make safe, focused updates.

## Project Snapshot

`ledgr` is a FastAPI backend with a Vite + React frontend.

- Backend runtime: Python 3.9 (`.python-version`)
- Backend package + deps: `pyproject.toml`, `uv.lock`
- API entry point: `main.py` -> `ledgr.app:app`
- Database: SQLModel + SQLAlchemy, local PostgreSQL via `docker-compose.yml`
- Migrations: Alembic under `migrations/`
- Frontend: Vite React TypeScript app under `frontend/`
- Global reference data: categories/tags are seeded on API startup (non-test mode)

## Key Paths

- `ledgr/app.py`: FastAPI app setup (`/health`, users router, transactions router) + global data seeding
- `ledgr/utils/globaldata.py`: default global categories/tags + seeding helpers
- `ledgr/features/users/`: auth, profile, accounts, categories, tags, goals
- `ledgr/features/transactions/`: transaction create/list/update behavior
- `tests/test_user_api.py`: user + setup API coverage
- `tests/test_transactions_api.py`: transaction API coverage
- `frontend/src/App.tsx`: auth + dashboard shell + workspace sections
- `frontend/src/api.ts`: frontend API client methods
- `frontend/src/types.ts`: frontend API types
- `frontend/src/styles.css`: frontend styling

## Backend API Areas Covered by Tests

### `tests/test_user_api.py`

- register + token issuance flow
- `/users/me` profile response
- setup account CRUD surface relevant to create/list/patch
- account type validation for wallet/bank/credit card fields
- duplicate account/category conflict handling
- global + user category grouping by kind
- tags creation/list behavior
- goals create/list behavior and per-user scoping

### `tests/test_transactions_api.py`

- expense/income/investment/refund transaction balance effects
- insufficient funds validation for expenses and transfers
- duplicate transactions allowed when payloads match
- ownership checks for account access across users
- transfer behavior:
  - account-to-account transfer (two transactions + balance movement)
  - same-account rejection
  - unauthorized destination rejection
  - single-account transfer category cases (e.g. credit card transfer) now debit account balance
- transaction edit behavior:
  - updates rebalance affected account(s)
  - transfer edits are rejected
  - category kind mismatch is rejected

## Frontend Scope Implemented

`frontend/src/App.tsx` implements:

- Auth: login/register + token persistence + `/users/me`
- Dashboard section:
  - total balance (from `/users/setup/accounts`)
  - monthly spend (from `/transactions`)
  - recent transactions list
- Transaction section:
  - header-level "Add transaction" toggle composer available from any page
  - transaction create form for income/expense/transfer/investment/refund
  - category dropdown filtered by selected transaction type
  - recent transactions list with type-aware amount coloring/sign
  - inline transaction edit flow for non-transfer transactions
- Accounts section:
  - account create form (wallet/bank/credit card)
  - accounts list with balances
- Goal section:
  - goal create form
  - goals list with progress summary
- Profile section:
  - user profile details and account/transaction counts
  - goals count

Supporting frontend API methods are in `frontend/src/api.ts` and typed in `frontend/src/types.ts`.

## Backend Endpoints in Current Use

- Users/auth/profile:
  - `POST /users/register`
  - `POST /users/token`
  - `GET /users/me`
- User setup:
  - `GET/POST/PATCH /users/setup/accounts`
  - `GET/POST /users/setup/categories`
  - `GET/POST /users/setup/tags`
  - `GET/POST /users/setup/goals`
- Transactions:
  - `GET /transactions`
  - `POST /transactions`
  - `PATCH /transactions/{transaction_id}`

## Common Commands

From repository root:

```sh
uv run alembic upgrade head
uv run main.py
uv run pytest
```

From `frontend/`:

```sh
npm run dev
npm run build
```

## Development Notes

- Keep backend feature code under `ledgr/features/<feature>/`.
- Prefer API changes with accompanying tests in `tests/`.
- Keep frontend API contracts aligned with backend schema/router responses.
- When adding DB fields/models, update SQLModel models first, then create Alembic migration.
- Transaction category kind must align with transaction type (`income`, `expense`, `transfer`, `investment`, `refund`).
- Transfer edit endpoint intentionally rejects transfer edits to avoid breaking paired-transfer semantics.
- Vite dev proxy must include `/transactions`, `/users`, and `/health` for local frontend API calls.
- Do not commit local env files (`.env`, `.env.*`, `.venv`, `.DS_Store`).
