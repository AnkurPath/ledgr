# Ledgr

Personal finance REST API built with FastAPI, SQLModel, Alembic, and PostgreSQL.
The first implemented resource is daily expenses.

## Run

```sh
uv run alembic upgrade head
uv run main.py
```

The API starts on `http://127.0.0.1:8000`.

Interactive docs are available at `http://127.0.0.1:8000/docs`.

## Local Database

Start PostgreSQL with Docker Compose:

```sh
docker compose up -d
```

The compose setup starts Postgres on `127.0.0.1:5433`.

Use this local development database URL:

```sh
export LEDGR_DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5433/ledgr
```

Then run migrations and start the app locally:

```sh
uv run alembic upgrade head
uv run main.py
```

## Test

```sh
uv run pytest
```

## Code Organization

The backend is organized by feature so finance domains can grow independently:

- `ledgr/core/`: shared infrastructure such as settings and database sessions.
- `ledgr/features/users/`: user setup for accounts, income/expense categories, non-income/non-expense categories, and tags.
- `ledgr/features/expenses/`: current expense CRUD and daily summaries.
- `ledgr/features/budget_transactions/`: planned budget transaction tracking.
- `ledgr/features/budgets/`: planned budget planning and limits.
- `ledgr/features/mutual_funds/`: planned Indian mutual fund portfolio tracking.
- `ledgr/features/equity_portfolio/`: planned Indian equity portfolio tracking.
- `ledgr/features/global_portfolio/`: planned non-India/global asset tracking.

Each feature should keep its own `models.py`, `schemas.py`, `router.py`, and service/query helpers. Shared cross-feature utilities belong under `ledgr/core/`. New SQLModel table classes must be imported from `ledgr/models.py` so Alembic autogenerate can see them.

## Bruno Collection

Open the `bruno/` directory in Bruno.

Use the `Local` environment. It defines:

- `base_url`: `http://127.0.0.1:8000`
- `user_id`: `1`
- `expense_id`: `1`

Create a user first, then update `user_id` to the returned `id` for account, category, and tag setup requests.
After creating an expense, update `expense_id` to the returned `id` for get, update, replace, and delete requests.

## Migrations

Create schema changes with Alembic:

```sh
uv run alembic revision --autogenerate -m "describe change"
uv run alembic upgrade head
```

Set the database connection with `LEDGR_DATABASE_URL`. By default the app uses:

```sh
postgresql+psycopg://postgres:postgres@localhost:5433/ledgr
```

## API Endpoints

- `GET /health`
- `POST /users`
- `GET /users`
- `GET /users/{user_id}`
- `PATCH /users/{user_id}`
- `POST /users/{user_id}/setup/accounts`
- `GET /users/{user_id}/setup/accounts`
- `PATCH /users/{user_id}/setup/accounts/{account_id}`
- `DELETE /users/{user_id}/setup/accounts/{account_id}`
- `POST /users/{user_id}/setup/categories`
- `GET /users/{user_id}/setup/categories`
- `PATCH /users/{user_id}/setup/categories/{category_id}`
- `DELETE /users/{user_id}/setup/categories/{category_id}`
- `POST /users/{user_id}/setup/tags`
- `GET /users/{user_id}/setup/tags`
- `PATCH /users/{user_id}/setup/tags/{tag_id}`
- `DELETE /users/{user_id}/setup/tags/{tag_id}`
- `POST /expenses`
- `GET /expenses`
- `GET /expenses/{expense_id}`
- `PUT /expenses/{expense_id}`
- `PATCH /expenses/{expense_id}`
- `DELETE /expenses/{expense_id}`
- `GET /expenses/summary/daily`

Example request:

```sh
curl -X POST http://127.0.0.1:8000/expenses \
  -H 'Content-Type: application/json' \
  -d '{
    "expense_date": "2026-06-03",
    "description": "Coffee",
    "amount": "4.50",
    "category": "Food",
    "payment_method": "Card"
  }'
```
