#!/usr/bin/env bash
# Prefect startup script: server + services + worker
# Waits for the API to be ready before starting the worker.
set -euo pipefail

# Start the Prefect server (API only, no background services)
prefect server start --no-services &
SERVER_PID=$!

# Wait for the API to become healthy
echo "Waiting for Prefect server..."
for i in $(seq 1 30); do
    if python -c "import urllib.request; urllib.request.urlopen('http://localhost:4200/api/health', timeout=2)" 2>/dev/null; then
        echo "Prefect server ready."
        break
    fi
    sleep 2
done

# Start background services (scheduler, automations, etc.)
prefect server services start &

# Start the worker
prefect worker start --pool nova-pool &

# Keep the container alive by waiting on the server process
wait $SERVER_PID
