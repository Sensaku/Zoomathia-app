# syntax=docker/dockerfile:1

FROM python:3.12-slim-bookworm AS builder

COPY --from=ghcr.io/astral-sh/uv:0.12.11 /uv /uvx /bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=0

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project


FROM python:3.12-slim-bookworm AS runtime

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOST=0.0.0.0 \
    PORT=3001

WORKDIR /app

RUN groupadd --system zoomathia \
    && useradd --system --gid zoomathia --create-home zoomathia \
    && mkdir -p /app/storage \
    && chown zoomathia:zoomathia /app/storage

COPY --from=builder --chown=zoomathia:zoomathia /app/.venv /app/.venv
COPY --chown=zoomathia:zoomathia app ./app
COPY --chown=zoomathia:zoomathia data/files ./data/files
COPY --chown=zoomathia:zoomathia data/queries ./data/queries

USER zoomathia

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:3001/', timeout=3)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "3001", "--proxy-headers", "--forwarded-allow-ips", "*"]
