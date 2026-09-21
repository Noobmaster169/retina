# syntax=docker/dockerfile:1
#
# Retina's doc-extract, a service of the compose stack (backend/compose.local.yaml
# on a laptop, deploy/compose.yaml on the box). Built from this directory:
#   docker build -t retina-doc-extract services/doc-extract
#
# No character recogniser: a page with no text layer is drawn and handed to a model
# that can see it, which is why this image carries no tesseract and no language
# packs. The Python dependencies come from uv.lock, so the image runs exactly what
# `uv run pytest` tested.

FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /bin/uv

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
COPY app.py settings.py models.py storage.py registry.py ./
COPY extractors ./extractors

RUN useradd --create-home --uid 10002 docextract
USER docextract

# UVICORN_WORKERS=4: one process is bound by the GIL, and parsing a document is
# CPU work. Four processes was measured as the point where the cores rather than
# the interpreter became the limit. Each carries roughly 0.4 GB.
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    UVICORN_WORKERS=4
EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=5 \
    CMD curl -fsS --max-time 2 http://127.0.0.1:8000/healthz >/dev/null || exit 1

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
