#!/bin/bash
set -euo pipefail
umask 077

# Runs as root via systemd; PostgreSQL authentication uses the local postgres user.
backup_dir=/var/backups/task-vasilich
install -d -m 700 "$backup_dir"
exec 9>/run/lock/nedplan-backup.lock
flock -n 9 || exit 0
stamp=$(date -u +%Y%m%dT%H%M%S%NZ)
name="task_vasilich_v3_${stamp}.dump"
partial="$backup_dir/$name.partial"
trap 'if [ -f "$partial" ]; then rm -f -- "$partial"; fi' EXIT
runuser -u postgres -- pg_dump --format=custom --dbname=task_vasilich_v3 > "$partial"
pg_restore --list "$partial" >/dev/null
mv -- "$partial" "$backup_dir/$name"
cd "$backup_dir"
sha256sum "$name" > "$name.sha256"
printf 'Database backup verified: %s\n' "$name"
