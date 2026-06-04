FROM python:3.9-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_SYSTEM_PYTHON=1

WORKDIR /app

RUN pip install --no-cache-dir uv

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY alembic.ini main.py ./
COPY alembic ./alembic
COPY ledgr ./ledgr

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "ledgr.app:app", "--host", "0.0.0.0", "--port", "8000"]
