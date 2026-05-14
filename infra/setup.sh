#!/usr/bin/env bash
# Nova — Server Bootstrap Script
# Prepares a fresh Ubuntu 24.04 VPS for Nova deployment.
#
# Usage:
#   ssh root@your-server 'bash -s' < setup.sh
#
# What it does:
#   1. Updates packages
#   2. Installs Docker + Docker Compose
#   3. Installs Dokploy (includes Traefik for SSL/routing)
#   4. Creates data directories on server disk
#   5. Prints next steps
#
# Requirements:
#   - Ubuntu 24.04 LTS
#   - Root access
#   - Ports 22, 80, 443, 3000 free

set -euo pipefail

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[nova]${NC} $1"; }
warn() { echo -e "${YELLOW}[nova]${NC} $1"; }
err()  { echo -e "${RED}[nova]${NC} $1" >&2; }

# --- Preflight checks ---
if [ "$(id -u)" -ne 0 ]; then
    err "This script must be run as root."
    exit 1
fi

if ! grep -qi "ubuntu" /etc/os-release 2>/dev/null; then
    warn "This script is designed for Ubuntu. Proceed with caution."
fi

# --- System update ---
log "Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq curl jq unattended-upgrades > /dev/null

# --- Docker ---
if command -v docker &> /dev/null; then
    log "Docker already installed: $(docker --version)"
else
    log "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    log "Docker installed: $(docker --version)"
fi

# --- Data directories ---
STORAGE_DIR="/var/lib/nova"

log "Creating data directories at $STORAGE_DIR..."
mkdir -p "$STORAGE_DIR/pg-nova"
mkdir -p "$STORAGE_DIR/pg-agno"
mkdir -p "$STORAGE_DIR/backups"

# --- Dokploy ---
log "Installing Dokploy (Docker Swarm + Traefik)..."

# Custom addr pool avoids CIDR conflict if server is on a 10.0.0.0/16 VPC
export DOCKER_SWARM_INIT_ARGS="--default-addr-pool 172.20.0.0/16 --default-addr-pool-mask-length 24"
curl -sSL https://dokploy.com/install.sh | sh

# --- Summary ---
SERVER_IP=$(curl -4s --connect-timeout 5 https://ifconfig.io 2>/dev/null || echo "unknown")

echo ""
log "========================================="
log "  Nova server setup complete"
log "========================================="
echo ""
log "Server IP:       $SERVER_IP"
log "Data directory:  $STORAGE_DIR"
log "Dokploy UI:      http://$SERVER_IP:3000"
echo ""
log "Next steps:"
echo "  1. Open http://$SERVER_IP:3000 and create admin account"
echo "  2. Copy infra/.env.example to infra/.env and fill in secrets"
echo "  3. Deploy containers:"
echo "     cd infra && docker compose up -d"
echo "  4. Configure domain + SSL in Dokploy"
echo ""
log "Data directories created:"
echo "  $STORAGE_DIR/pg-nova    — Business database (products, orders, customers)"
echo "  $STORAGE_DIR/pg-agno    — Agent database (memories, sessions, traces)"
echo "  $STORAGE_DIR/backups    — pg_dump backup destination"
echo ""
