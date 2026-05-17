# --- Stage 1: Install dependencies ---
FROM python:3.12-slim AS builder

WORKDIR /app

# Install build dependencies for psycopg (PostgreSQL driver).
RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends gcc libpq-dev && \
    rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./

# Install production dependencies into a virtual environment.
RUN python -m venv /app/.venv && \
    /app/.venv/bin/pip install --no-cache-dir -e .

# --- Stage 2: Production runtime ---
FROM python:3.12-slim AS runner

WORKDIR /app

# Runtime dependency for psycopg.
RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends libpq5 wget && \
    rm -rf /var/lib/apt/lists/*

# Copy virtual environment from builder.
COPY --from=builder /app/.venv /app/.venv

# Copy application source.
COPY pyproject.toml ./
COPY src/ ./src/

ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1
ENV AGNO_TELEMETRY=false

# Non-root user for security.
RUN groupadd --system --gid 1001 qyne && \
    useradd --system --uid 1001 --gid qyne qyne
USER qyne

EXPOSE 8100

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8100/health || exit 1

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8100", "--workers", "2"]
