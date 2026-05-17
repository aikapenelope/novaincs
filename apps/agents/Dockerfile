# Nova Agents — Agno AgentOS container.
# Same pattern as qyne-v1/services/agno/Dockerfile.
FROM python:3.12-slim
WORKDIR /app

# System deps + Node.js (needed for MCP servers via npx).
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl wget libpq5 nodejs npm && rm -rf /var/lib/apt/lists/*

# Install Python dependencies.
COPY pyproject.toml .
RUN pip install --no-cache-dir .

# Create persistent data directory.
RUN mkdir -p /app/data

# Copy application source.
COPY . .

# Non-root user for security.
RUN groupadd --system --gid 1001 qyne && \
    useradd --system --uid 1001 --gid qyne qyne && \
    chown -R qyne:qyne /app/data
USER qyne

ENV PYTHONUNBUFFERED=1
ENV AGNO_TELEMETRY=false

EXPOSE 8100

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
  CMD curl -sf http://127.0.0.1:8100/health || exit 1

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8100"]
