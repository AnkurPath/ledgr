## Ledgr

Ledgr is a personal finance and bookkeeping application built with a **Next.js** web app and a **Rust (Axum)** API.

### Features

- Track income and expenses
- Track savings and investments

### Development

- **Requirements**: Node.js + npm (or pnpm/yarn), Rust toolchain (stable) + Cargo

### Repo structure (expected)

- `web/` - Next.js app
- `api/` - Rust Axum server (Cargo crate)

### Setup

```bash
cd web && npm install
cd .. && cargo build
```

### Run locally

- **Web (Next.js)**:

```bash
cd web && npm run dev
```

- **API (Axum)**:

```bash
cargo run -p ledgr
```

### API endpoints (REST)

- `GET /health`
- `POST /expenses`
- `GET /expenses`
- `GET /expenses/{id}`
- `PATCH /expenses/{id}`
- `PUT /expenses/{id}`
- `DELETE /expenses/{id}`

### Configuration

If the app requires environment variables, add them to:

- `web/.env.local`
- `api/.env` (or export them in your shell)

### Database (Postgres)

Set `DATABASE_URL` in the repo-root `.env` (see `.env.example`).

The API connects with **sqlx** (`PgPool`) and runs migrations from `api/migrations/` on startup.

To apply the same SQL manually (optional):

```bash
psql "$DATABASE_URL" -f api/migrations/0001_init.sql
```


