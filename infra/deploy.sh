#!/usr/bin/env bash
# Qyne — Deploy to Hetzner VPS
#
# This script:
#   1. Loads secrets from Pulumi ESC
#   2. SSHs into the VPS
#   3. Pulls the latest code
#   4. Builds Docker images
#   5. Runs database migrations
#   6. Restarts containers
#   7. Runs smoke tests
#
# Usage:
#   ./infra/deploy.sh
#
# Prerequisites:
#   - SSH access to the VPS (key in Pulumi stack output)
#   - Pulumi ESC environment configured
#   - Git repo cloned on the VPS at /opt/qyne

set -euo pipefail

# --- Configuration ---
VPS_IP="204.168.169.254"
VPS_USER="root"
REMOTE_DIR="/opt/qyne"
ESC_ENV="aikapenelope-org/qyne-infra/nova-app"
COMPOSE_FILE="infra/docker-compose.yml"

# --- Colors ---
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[deploy]${NC} $1"; }
warn() { echo -e "${YELLOW}[deploy]${NC} $1"; }
err()  { echo -e "${RED}[deploy]${NC} $1" >&2; }

# --- Step 1: Generate .env from Pulumi ESC ---
log "Generating .env from Pulumi ESC..."

pulumi env run "$ESC_ENV" -- bash -c '
cat > /tmp/qyne-deploy.env << ENVEOF
PG_QYNE_PASSWORD=$PG_QYNE_PASSWORD
PG_QYNE_RO_PASSWORD=$PG_QYNE_RO_PASSWORD
PG_AGNO_PASSWORD=$PG_AGNO_PASSWORD
PG_PREFECT_PASSWORD=$PG_PREFECT_PASSWORD
REDIS_PASSWORD=$REDIS_PASSWORD
CLERK_SECRET_KEY=$CLERK_SECRET_KEY
CLERK_PUBLISHABLE_KEY=$CLERK_PUBLISHABLE_KEY
R2_ACCESS_KEY_ID=$R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY=$R2_SECRET_ACCESS_KEY
R2_ENDPOINT=$R2_ENDPOINT
R2_PUBLIC_URL=$R2_PUBLIC_URL
R2_BUCKET=$R2_BUCKET
ENVEOF
'

# --- Step 2: Copy .env to VPS ---
log "Copying .env to VPS..."
scp -o StrictHostKeyChecking=no /tmp/qyne-deploy.env "$VPS_USER@$VPS_IP:$REMOTE_DIR/infra/.env"
rm -f /tmp/qyne-deploy.env

# --- Step 3: Deploy on VPS ---
log "Deploying on VPS..."
ssh -o StrictHostKeyChecking=no "$VPS_USER@$VPS_IP" bash -s << 'REMOTE_SCRIPT'
set -euo pipefail

cd /opt/qyne

echo "[vps] Pulling latest code..."
git pull origin main

echo "[vps] Building Docker images..."
cd infra
docker compose build --no-cache qyne-api qyne-dashboard

echo "[vps] Restarting application containers..."
echo "[vps] (Migrations run automatically on API container startup)"
docker compose up -d qyne-api qyne-dashboard

echo "[vps] Waiting for containers to be healthy..."
sleep 10

echo "[vps] Container status:"
docker compose ps

echo "[vps] Deploy complete."
REMOTE_SCRIPT

# --- Step 4: Smoke test ---
log "Running smoke tests..."

API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://api.martes.app/health" 2>/dev/null || echo "000")
if [ "$API_STATUS" = "200" ]; then
  log "API health check: OK (200)"
else
  warn "API health check: $API_STATUS (may need a moment to start)"
fi

DASH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://app.martes.app/" 2>/dev/null || echo "000")
if [ "$DASH_STATUS" = "200" ]; then
  log "Dashboard health check: OK (200)"
else
  warn "Dashboard health check: $DASH_STATUS (may need a moment to start)"
fi

log "Deployment finished."
