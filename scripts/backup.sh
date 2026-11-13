#!/usr/bin/env bash
# Dumps the Postgres database and the uploads volume. Run from the project directory (where docker-compose.yml is).
# Usage: scripts/backup.sh [backup_dir] [keep_days]
set -euo pipefail
DIR="${1:-./backups}"
KEEP="${2:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$DIR"

docker compose exec -T db pg_dump -U aptitude -d aptitude --no-owner | gzip > "$DIR/db-$STAMP.sql.gz"
docker compose exec -T app tar -C /app -czf - storage > "$DIR/uploads-$STAMP.tar.gz"

# Verify the dump is a readable gzip before pruning anything.
gzip -t "$DIR/db-$STAMP.sql.gz"
find "$DIR" -type f \( -name 'db-*.sql.gz' -o -name 'uploads-*.tar.gz' \) -mtime "+$KEEP" -delete
echo "Backup written: $DIR/db-$STAMP.sql.gz, $DIR/uploads-$STAMP.tar.gz"
