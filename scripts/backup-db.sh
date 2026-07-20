#!/usr/bin/env bash
# District Cure — daily PostgreSQL backup with 14-day rotation.
# Dumps the 'districtcure' database (compressed) to /opt/districtcure/backups.
set -euo pipefail

BACKUP_DIR="/opt/districtcure/backups"
DB="districtcure"
KEEP_DAYS=14
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="${BACKUP_DIR}/districtcure-${STAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

# Dump as the postgres superuser (peer auth — no password needed) and gzip.
sudo -u postgres pg_dump --no-owner --no-privileges "$DB" | gzip -9 > "$OUT"

# Keep only the most recent backups; delete older than KEEP_DAYS.
find "$BACKUP_DIR" -name 'districtcure-*.sql.gz' -type f -mtime +"$KEEP_DAYS" -delete

echo "$(date '+%Y-%m-%d %H:%M:%S')  backup OK -> $OUT ($(du -h "$OUT" | cut -f1))"
