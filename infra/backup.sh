#!/usr/bin/env bash
# Nova — PostgreSQL Backup Script
# Runs daily via cron. Retains 7 daily backups for pg-nova, 4 weekly for pg-agno.
#
# Usage:
#   /opt/nova/backup.sh pg-nova   # Daily business database backup
#   /opt/nova/backup.sh pg-agno   # Weekly agent database backup

set -euo pipefail

BACKUP_DIR="/var/lib/nova/backups"
DATE=$(date +%Y%m%d_%H%M%S)
TARGET="${1:-}"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [nova-backup] $1"; }

if [ -z "$TARGET" ]; then
    log "ERROR: Usage: $0 <pg-nova|pg-agno>"
    exit 1
fi

case "$TARGET" in
    pg-nova)
        DB_USER="nova"
        DB_NAME="nova"
        CONTAINER="pg-nova"
        RETAIN_DAYS=7
        ;;
    pg-agno)
        DB_USER="agno"
        DB_NAME="agno"
        CONTAINER="pg-agno"
        RETAIN_DAYS=28
        ;;
    *)
        log "ERROR: Unknown target: $TARGET. Use pg-nova or pg-agno."
        exit 1
        ;;
esac

BACKUP_FILE="${BACKUP_DIR}/${TARGET}-${DATE}.sql.gz"

# Check container is running
if ! docker inspect --format={{.State.Running}} "$CONTAINER" 2>/dev/null | grep -q true; then
    log "ERROR: Container $CONTAINER is not running. Skipping backup."
    exit 1
fi

# Run pg_dump inside the container, compress on the host
log "Starting backup of $TARGET ($DB_NAME)..."
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --no-privileges | gzip > "$BACKUP_FILE"

# Verify backup is not empty
BACKUP_SIZE=$(stat -c%s "$BACKUP_FILE" 2>/dev/null || echo 0)
if [ "$BACKUP_SIZE" -lt 100 ]; then
    log "ERROR: Backup file is suspiciously small ($BACKUP_SIZE bytes). Check container logs."
    rm -f "$BACKUP_FILE"
    exit 1
fi

log "Backup complete: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

# Prune old backups
PRUNED=0
find "$BACKUP_DIR" -name "${TARGET}-*.sql.gz" -mtime +${RETAIN_DAYS} -delete -print | while read f; do
    log "Pruned old backup: $f"
    PRUNED=$((PRUNED + 1))
done

# List current backups
log "Current backups for $TARGET:"
ls -lh "$BACKUP_DIR"/${TARGET}-*.sql.gz 2>/dev/null

log "Done."
