#!/usr/bin/env bash
# Qyne — Server Bootstrap Script
# Prepares a fresh Ubuntu 24.04 VPS for Qyne deployment.
#
# Usage:
#   ssh root@your-server 'bash -s' < setup.sh
#
# What it does:
#   1. Updates packages + installs fail2ban
#   2. Installs Docker
#   3. Installs Coolify (includes Traefik for SSL/routing)
#   4. Installs Tailscale (VPN mesh for admin access)
#   5. Creates data directories on server disk
#   6. Runs hardening script
#   7. Prints next steps
#
# Requirements:
#   - Ubuntu 24.04 LTS
#   - Root access
#   - Ports 22, 80, 443 open

set -euo pipefail

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[qyne]${NC} $1"; }
warn() { echo -e "${YELLOW}[qyne]${NC} $1"; }
err()  { echo -e "${RED}[qyne]${NC} $1" >&2; }

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
apt-get install -y -qq curl jq unattended-upgrades fail2ban > /dev/null

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

# --- Tailscale ---
if command -v tailscale &> /dev/null; then
    log "Tailscale already installed: $(tailscale version | head -1)"
else
    log "Installing Tailscale..."
    curl -fsSL https://tailscale.com/install.sh | sh
    log "Tailscale installed. Run 'tailscale up' to authenticate."
fi

# --- Coolify ---
log "Installing Coolify..."
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash

# --- Summary ---
SERVER_IP=$(curl -4s --connect-timeout 5 https://ifconfig.io 2>/dev/null || echo "unknown")
TAILSCALE_IP=$(tailscale ip -4 2>/dev/null || echo "not configured")

echo ""
log "========================================="
log "  Qyne server setup complete"
log "========================================="
echo ""
log "Server IP:       $SERVER_IP"
log "Tailscale IP:    $TAILSCALE_IP"
log "Data directory:  $STORAGE_DIR"
log "Coolify UI:      http://$TAILSCALE_IP:8000 (via Tailscale)"
echo ""
log "Next steps:"
echo "  1. Run 'tailscale up' to authenticate with your Tailscale network"
echo "  2. Open http://<tailscale-ip>:8000 and create Coolify admin account"
echo "  3. Run 'bash infra/harden.sh' to apply security hardening"
echo "  4. Start infra services:"
echo "     cd /opt/nova && docker compose up -d"
echo "  5. Connect GitHub in Coolify and deploy apps"
echo ""
log "Data directories created:"
echo "  $STORAGE_DIR/pg-nova    — Business database (products, orders, customers)"
echo "  $STORAGE_DIR/pg-agno    — Agent database (memories, sessions, traces)"
echo "  $STORAGE_DIR/backups    — pg_dump backup destination"
echo ""
