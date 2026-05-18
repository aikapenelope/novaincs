#!/bin/sh
# Qyne API — Production entrypoint.
#
# 1. Runs database migrations (compiled TypeScript, with retry and tracking)
# 2. Starts the API server
#
# Migration is non-fatal: if it fails, the API starts anyway.
# See src/run-migrations.ts for the migration logic.

set -e

echo "[entrypoint] Running database migrations..."
node apps/api/dist/run-migrations.js || echo "[entrypoint] Migration exited with error (non-fatal)."

echo "[entrypoint] Starting Qyne API..."
exec node apps/api/dist/index.js
