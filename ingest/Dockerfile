FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim

WORKDIR /app

ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy
ENV PATH="/app/.venv/bin:$PATH"

RUN apt-get update \
  && apt-get install -y --no-install-recommends poppler-utils tesseract-ocr \
  && rm -rf /var/lib/apt/lists/*

COPY ingest/pyproject.toml ingest/uv.lock ingest/README.md ./
COPY ingest/src ./src
COPY db/migrations /db/migrations

RUN uv sync --frozen --no-dev

CMD ["uv", "run", "ingest", "doctor"]
