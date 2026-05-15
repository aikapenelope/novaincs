#!/usr/bin/env bash
# Qyne — Server Hardening Script
# Applies security configurations that live outside Docker containers.
# Idempotent: safe to run multiple times.
#
# What it does:
#   1. SSH hardening (disable password auth, limit retries)
#   2. fail2ban for SSH brute-force protection
#   3. Kernel network hardening (disable redirects, log martians)
#   4. Docker log rotation defaults
#   5. Traefik ACME email + HTTP->HTTPS redirect
#   6. .env file permissions
#
# Usage:
#   ssh root@your-server 'bash -s' < infra/harden.sh
#   # or from the server:
#   bash /opt/qyne/infra/harden.sh
#
# Requirements:
#   - Ubuntu 24.04 LTS
#   - Root access
#   - Docker installed
#   - Dokploy + Traefik installed

set -euo pipefail

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[harden]${NC} $1"; }
warn() { echo -e "${YELLOW}[harden]${NC} $1"; }
err()  { echo -e "${RED}[harden]${NC} $1" >&2; }

# --- Preflight ---
if [ "$(id -u)" -ne 0 ]; then
    err "This script must be run as root."
    exit 1
fi

ACME_EMAIL="${ACME_EMAIL:-angelpdi100@gmail.com}"

# =========================================================================
# 1. SSH Hardening
# =========================================================================
log "1/6 SSH hardening..."

cat > /etc/ssh/sshd_config.d/99-hardening.conf << 'EOF'
PasswordAuthentication no
PermitRootLogin prohibit-password
MaxAuthTries 3
LoginGraceTime 30
PermitEmptyPasswords no
X11Forwarding no
EOF

# Reload SSH (Ubuntu 24.04 uses 'ssh', not 'sshd')
if systemctl is-active --quiet ssh; then
    systemctl reload ssh
elif systemctl is-active --quiet sshd; then
    systemctl reload sshd
fi
log "  SSH: password auth disabled, max 3 retries, 30s grace"

# =========================================================================
# 2. fail2ban
# =========================================================================
log "2/6 fail2ban..."

if ! command -v fail2ban-client &> /dev/null; then
    apt-get update -qq && apt-get install -y -qq fail2ban > /dev/null
fi

cat > /etc/fail2ban/jail.local << 'EOF'
[sshd]
enabled = true
port = ssh
filter = sshd
maxretry = 5
bantime = 3600
findtime = 600
EOF

systemctl enable fail2ban > /dev/null 2>&1
systemctl restart fail2ban
BANNED=$(fail2ban-client status sshd 2>/dev/null | grep "Currently banned" | awk '{print $NF}')
log "  fail2ban: active, ${BANNED:-0} IPs currently banned"

# =========================================================================
# 3. Kernel Hardening
# =========================================================================
log "3/6 Kernel hardening..."

cat > /etc/sysctl.d/99-nova-hardening.conf << 'EOF'
# Disable ICMP redirects (not a router)
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv6.conf.default.accept_redirects = 0

# Ignore ICMP broadcast requests
net.ipv4.icmp_echo_ignore_broadcasts = 1

# Log martian packets
net.ipv4.conf.all.log_martians = 1
EOF

sysctl --system > /dev/null 2>&1
log "  Kernel: redirects disabled, martian logging enabled"

# =========================================================================
# 4. Docker Log Rotation
# =========================================================================
log "4/6 Docker log rotation..."

DAEMON_JSON="/etc/docker/daemon.json"
NEEDS_RESTART=false

if [ ! -f "$DAEMON_JSON" ] || ! grep -q "max-size" "$DAEMON_JSON" 2>/dev/null; then
    cat > "$DAEMON_JSON" << 'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF
    NEEDS_RESTART=true
    log "  Docker: daemon.json created (10m max, 3 files)"
else
    log "  Docker: log rotation already configured"
fi

if [ "$NEEDS_RESTART" = true ]; then
    warn "  Docker daemon needs restart for log config. Run: systemctl restart docker"
    warn "  (Not restarting automatically to avoid downtime)"
fi

# =========================================================================
# 5. Traefik: ACME Email + HTTP->HTTPS Redirect
# =========================================================================
log "5/6 Traefik configuration..."

# Update ACME email
TRAEFIK_CFG=$(find /etc/dokploy -name "traefik.yml" 2>/dev/null | head -1)
if [ -n "$TRAEFIK_CFG" ]; then
    if grep -q "test@localhost.com" "$TRAEFIK_CFG"; then
        sed -i "s/email: test@localhost.com/email: ${ACME_EMAIL}/" "$TRAEFIK_CFG"
        log "  ACME email: updated to ${ACME_EMAIL}"
    else
        CURRENT_EMAIL=$(grep "email:" "$TRAEFIK_CFG" | awk '{print $2}')
        log "  ACME email: already set to ${CURRENT_EMAIL}"
    fi
else
    warn "  Traefik config not found (Dokploy not installed?)"
fi

# HTTP -> HTTPS redirect
DYNAMIC_DIR=$(find /etc/dokploy -name "dynamic" -type d 2>/dev/null | head -1)
if [ -n "$DYNAMIC_DIR" ]; then
    cat > "$DYNAMIC_DIR/http-redirect.yml" << 'EOF'
http:
  middlewares:
    redirect-to-https:
      redirectScheme:
        scheme: https
        permanent: true
  routers:
    http-catchall:
      rule: "HostRegexp(`.+`)"
      entrypoints:
        - web
      middlewares:
        - redirect-to-https
      service: noop@internal
EOF
    log "  HTTP->HTTPS redirect: configured"
else
    warn "  Traefik dynamic dir not found"
fi

# =========================================================================
# 6. .env File Permissions
# =========================================================================
log "6/6 Secret file permissions..."

for envfile in /opt/nova/.env /opt/qyne/infra/.env; do
    if [ -f "$envfile" ]; then
        chmod 600 "$envfile"
        log "  ${envfile}: 600 (owner-only)"
    fi
done

# =========================================================================
# Summary
# =========================================================================
echo ""
log "========================================="
log "  Hardening complete"
log "========================================="
echo ""
log "Applied:"
echo "  [x] SSH: password auth disabled, key-only, max 3 retries"
echo "  [x] fail2ban: SSH jail active (5 retries, 1h ban)"
echo "  [x] Kernel: ICMP redirects disabled, martian logging"
echo "  [x] Docker: log rotation 10m x 3 files"
echo "  [x] Traefik: ACME email set, HTTP->HTTPS redirect"
echo "  [x] Secrets: .env files chmod 600"
echo ""
if [ "$NEEDS_RESTART" = true ]; then
    warn "ACTION REQUIRED: Restart Docker to apply log rotation:"
    echo "  systemctl restart docker"
    echo ""
fi
