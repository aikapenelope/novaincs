#!/usr/bin/env bash
# Nova — Standalone Bootstrap (No Coolify, No PaaS)
#
# Deploys the entire Nova stack on a fresh Ubuntu 24.04 VPS using only
# Docker Compose + GHCR images + Watchtower for auto-updates.
#
# What it does:
#   1. System setup (Docker, Tailscale, fail2ban)
#   2. Authenticates with GHCR (to pull private images)
#   3. Generates passwords and creates .env (if not exists)
#   4. Clones the repo and starts all services via docker-compose.prod.yml
#   5. Runs database migrations
#   6. Sets up automated backups (cron)
#   7. Applies security hardening
#
# Usage:
#   # Option A: Run directly on a fresh VPS
#   curl -fsSL https://raw.githubusercontent.com/aikapenelope/novaincs/main/infra/bootstrap-standalone.sh | sudo bash
#
#   # Option B: Clone first, then run
#   git clone https://github.com/aikapenelope/novaincs.git /opt/nova
#   cd /opt/nova
#   sudo bash infra/bootstrap-standalone.sh
#
# After this script completes:
#   1. Run 'tailscale up' to authenticate with your Tailscale network
#   2. Edit /opt/nova/.env with your API keys (Clerk, OpenRouter, etc.)
#   3. Run: cd /opt/nova && docker compose -f docker-compose.prod.yml up -d
#   4. Configure DNS (A records for your domain)
#
# For fully automated deploy (no manual .env editing):
#   - Pre-populate .env before running this script
#   - Or use Pulumi ESC to inject secrets via cloud-init
#
# Requirements:
#   - Ubuntu 24.04 LTS
#   - Root access
#   - Ports 22, 80, 443 open
#   - GitHub PAT with packages:read scope (for GHCR)

set -euo pipefail

NOVA_DIR="/opt/nova"
REPO_URL="https://github.com/aikapenelope/novaincs.git"
GHCR_USER="${GHCR_USER:-}"
GHCR_TOKEN="${GHCR_TOKEN:-}"

# --- Colors ---
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[nova]${NC} $1"; }
warn() { echo -e "${YELLOW}[nova]${NC} $1"; }
err()  { echo -e "${RED}[nova]${NC} $1" >&2; }
info() { echo -e "${CYAN}[nova]${NC} $1"; }

# --- Preflight ---
if [ "$(id -u)" -ne 0 ]; then
    err "This script must be run as root (use sudo)."
    exit 1
fi

if ! grep -qi "ubuntu" /etc/os-release 2>/dev/null; then
    warn "This script is designed for Ubuntu 24.04. Proceed with caution."
fi

log "Starting Nova standalone bootstrap..."

# =========================================================================
# Step 1: System setup
# =========================================================================
log "Step 1/7: System setup..."

apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq curl jq unattended-upgrades fail2ban openssl git > /dev/null

# Docker
if command -v docker &> /dev/null; then
    log "  Docker already installed: $(docker --version)"
else
    log "  Installing Docker..."
    curl -fsSL https://get.docker.com | sh
fi

# Tailscale
if command -v tailscale &> /dev/null; then
    log "  Tailscale already installed"
else
    log "  Installing Tailscale..."
    curl -fsSL https://tailscale.com/install.sh | sh
fi

# =========================================================================
# Step 2: Authenticate with GHCR
# =========================================================================
log "Step 2/7: GHCR authentication..."

DOCKER_CONFIG_DIR="/root/.docker"
mkdir -p "$DOCKER_CONFIG_DIR"

if [ -n "$GHCR_TOKEN" ] && [ -n "$GHCR_USER" ]; then
    echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
    log "  Authenticated with GHCR as $GHCR_USER"
elif [ -f "$DOCKER_CONFIG_DIR/config.json" ] && grep -q "ghcr.io" "$DOCKER_CONFIG_DIR/config.json"; then
    log "  GHCR credentials already configured"
else
    warn "  GHCR credentials not provided. Set GHCR_USER and GHCR_TOKEN env vars."
    warn "  Images won't pull until authenticated. Run:"
    warn "    echo \$GHCR_TOKEN | docker login ghcr.io -u \$GHCR_USER --password-stdin"
fi

# =========================================================================
# Step 3: Generate passwords and create .env
# =========================================================================
log "Step 3/7: Environment configuration..."

# Create data directories
mkdir -p /var/lib/nova/pg-nova
mkdir -p /var/lib/nova/pg-agno
mkdir -p /var/lib/nova/backups

# Clone or update repo
if [ -d "$NOVA_DIR/.git" ]; then
    log "  Repo already exists at $NOVA_DIR, pulling latest..."
    cd "$NOVA_DIR" && git pull origin main
else
    log "  Cloning repo to $NOVA_DIR..."
    git clone "$REPO_URL" "$NOVA_DIR"
fi

cd "$NOVA_DIR"

ENV_FILE="$NOVA_DIR/.env"

if [ -f "$ENV_FILE" ]; then
    log "  .env already exists — skipping generation"
    log "  To regenerate, delete $ENV_FILE and re-run this script"
else
    PG_NOVA_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
    PG_NOVA_APP_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
    PG_AGNO_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
    PG_PREFECT_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
    REDIS_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
    NOVA_INTERNAL_SECRET=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)

    cat > "$ENV_FILE" << EOF
# Nova — Production Environment
# Generated by bootstrap-standalone.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ)
# DO NOT commit this file. Keep it safe.

# === Infrastructure (auto-generated) ===
PG_NOVA_PASSWORD=$PG_NOVA_PASSWORD
PG_NOVA_APP_PASSWORD=$PG_NOVA_APP_PASSWORD
PG_AGNO_PASSWORD=$PG_AGNO_PASSWORD
PG_PREFECT_PASSWORD=$PG_PREFECT_PASSWORD
REDIS_PASSWORD=$REDIS_PASSWORD
NOVA_INTERNAL_SECRET=$NOVA_INTERNAL_SECRET

# === Domains (EDIT THESE) ===
DOMAIN_API=api.example.com
DOMAIN_DASHBOARD=app.example.com
DOMAIN_CATALOG=catalog.example.com
ACME_EMAIL=admin@example.com

# === Auth (EDIT THESE — from https://dashboard.clerk.com) ===
CLERK_SECRET_KEY=
CLERK_PUBLISHABLE_KEY=

# === AI / LLM (EDIT THESE) ===
OPENROUTER_API_KEY=
GROQ_API_KEY=
OPENAI_API_KEY=

# === Image Processing (EDIT THESE — from https://fal.ai) ===
FAL_KEY=

# === Storage (EDIT THESE — from Cloudflare R2) ===
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_ENDPOINT=
R2_BUCKET=qyne-images
R2_PUBLIC_URL=

# === Notifications (optional) ===
# Watchtower notification URL (Discord/Slack/Telegram webhook)
WATCHTOWER_NOTIFICATION_URL=
EOF

    chmod 600 "$ENV_FILE"
    log "  Generated .env with random passwords"
    warn "  IMPORTANT: Edit $ENV_FILE to add your API keys and domains"
fi

# =========================================================================
# Step 4: Start all services
# =========================================================================
log "Step 4/7: Starting services..."

# Source .env for this script
set -a
source "$ENV_FILE"
set +a

# Pull images (may fail if GHCR not authenticated — that's ok for infra-only start)
docker compose -f docker-compose.prod.yml pull 2>/dev/null || warn "  Some images failed to pull (GHCR auth needed for app images)"

# Start infrastructure first (databases + redis)
docker compose -f docker-compose.prod.yml up -d pg-nova pg-agno pg-prefect redis
log "  Waiting for databases to be healthy..."
sleep 10

# Wait for pg-nova
for i in $(seq 1 30); do
    if docker exec pg-nova pg_isready -U nova -q 2>/dev/null; then
        log "  pg-nova is ready"
        break
    fi
    if [ "$i" -eq 30 ]; then
        err "pg-nova did not become healthy in 30 seconds"
        exit 1
    fi
    sleep 1
done

# Start remaining services
docker compose -f docker-compose.prod.yml up -d

# =========================================================================
# Step 5: Run database migrations
# =========================================================================
log "Step 5/7: Running database migrations..."

MIGRATION_DIR="$NOVA_DIR/apps/api/drizzle"

if [ -d "$MIGRATION_DIR" ]; then
    for sql_file in "$MIGRATION_DIR"/0*.sql; do
        filename=$(basename "$sql_file")
        log "  Applying $filename..."
        docker exec -i pg-nova psql -U nova -d nova < "$sql_file" 2>&1 | grep -v "^$" | head -3 || true
    done
    log "  All migrations applied"

    # Create application role
    docker exec -i pg-nova psql -U nova -d nova << EOSQL || true
ALTER ROLE qyne_app PASSWORD '${PG_NOVA_APP_PASSWORD}';
EOSQL
    log "  qyne_app role configured"
else
    warn "  Migration directory not found. Migrations will run on API container startup."
fi

# =========================================================================
# Step 6: Set up automated backups
# =========================================================================
log "Step 6/7: Setting up backup cron..."

cp "$NOVA_DIR/infra/backup.sh" /opt/nova/backup.sh 2>/dev/null || true
chmod +x /opt/nova/backup.sh 2>/dev/null || true

CRON_LINE_NOVA="0 3 * * * /opt/nova/backup.sh pg-nova >> /var/log/nova-backup.log 2>&1"
CRON_LINE_AGNO="30 3 * * 0 /opt/nova/backup.sh pg-agno >> /var/log/nova-backup.log 2>&1"

(crontab -l 2>/dev/null || true) | grep -q "backup.sh pg-nova" || {
    (crontab -l 2>/dev/null || true; echo "$CRON_LINE_NOVA"; echo "$CRON_LINE_AGNO") | crontab -
    log "  Backup cron installed"
}

# =========================================================================
# Step 7: Security hardening
# =========================================================================
log "Step 7/7: Applying security hardening..."

if [ -f "$NOVA_DIR/infra/harden.sh" ]; then
    bash "$NOVA_DIR/infra/harden.sh"
else
    warn "  harden.sh not found, skipping"
fi

# =========================================================================
# Summary
# =========================================================================
SERVER_IP=$(curl -4s --connect-timeout 5 https://ifconfig.io 2>/dev/null || echo "unknown")
TAILSCALE_IP=$(tailscale ip -4 2>/dev/null || echo "not configured — run 'tailscale up'")

echo ""
log "==========================================="
log "  Nova standalone bootstrap complete"
log "==========================================="
echo ""
info "Server IP:       $SERVER_IP"
info "Tailscale IP:    $TAILSCALE_IP"
info "Data directory:  /var/lib/nova"
info "Compose file:    $NOVA_DIR/docker-compose.prod.yml"
info "Environment:     $ENV_FILE"
echo ""
log "Services:"
docker compose -f docker-compose.prod.yml ps --format "  {{.Name}}: {{.Status}}" 2>/dev/null || true
echo ""
log "Next steps:"
echo ""
echo "  1. Edit .env with your API keys and domains:"
echo "     nano $ENV_FILE"
echo ""
echo "  2. Authenticate Tailscale:"
echo "     tailscale up"
echo ""
echo "  3. Authenticate with GHCR (if not done):"
echo "     echo \$GHCR_TOKEN | docker login ghcr.io -u \$GHCR_USER --password-stdin"
echo ""
echo "  4. Restart services with updated .env:"
echo "     cd $NOVA_DIR && docker compose -f docker-compose.prod.yml up -d"
echo ""
echo "  5. Configure DNS (A records pointing to $SERVER_IP):"
echo "     api.yourdomain.com  -> $SERVER_IP"
echo "     app.yourdomain.com  -> $SERVER_IP"
echo ""
echo "  After DNS + .env are configured, the system is fully operational."
echo "  Push to main on GitHub → images build → Watchtower auto-pulls → deployed."
echo ""
