FROM python:3.9-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_SYSTEM_PYTHON=1

WORKDIR /app

RUN pip install --no-cache-dir uv

COPY . .
RUN uv sync --frozen --no-dev

EXPOSE 8000

CMD ["sh", "-c", "uv run python scripts/bootstrap_db.py && uv run uvicorn ledgr.app:app --host 0.0.0.0 --port 8000"]
