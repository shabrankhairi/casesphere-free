#!/bin/sh
# Runs inside backup container via cron every night at 02:00 UTC
set -e

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILE="/backups/casesphere_${TIMESTAMP}.sql.gz"

echo "[$(date -u)] Starting backup → ${FILE}"

pg_dump \
  -h "$POSTGRES_HOST" \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  --no-password \
  --format=plain \
  --no-owner \
  --no-acl \
  | gzip > "$FILE"

echo "[$(date -u)] Backup complete: $(du -sh $FILE | cut -f1)"

# Delete backups older than 30 days
find /backups -name "casesphere_*.sql.gz" -mtime +30 -delete
echo "[$(date -u)] Rotation complete."
