# Ledgr Frontend

React + TypeScript frontend for the Ledgr FastAPI backend.

## Run

Start the backend from the project root:

```sh
uv run alembic upgrade head
uv run main.py
```

Start the frontend:

```sh
cd frontend
npm install
npm run dev
```

The frontend runs on `http://127.0.0.1:5173`.

During local development, Vite proxies `/health`, `/expenses`, and `/users` to `http://127.0.0.1:8000`.
For a separate deployment, set `VITE_API_BASE_URL`.
