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

## Expense Endpoints

- `GET /health`
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
