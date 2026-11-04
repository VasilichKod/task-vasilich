#!/bin/bash
set -euo pipefail
umask 077
export PATH=/usr/bin:/bin:/usr/sbin:/sbin
ssh_key=/Users/stepansavelev/.ssh/id_ed25519_nedplan
backup_dir='/Users/stepansavelev/VCode/Автоматизации и N8N/TaskVasilich/backups/firstbyte'
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
rsync -a \
  -e "ssh -i $ssh_key -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=2" \
  --include='*.dump' --include='*.sha256' --exclude='*' \
  root@45.144.65.6:/var/backups/task-vasilich/ "$backup_dir/"
cd "$backup_dir"
for checksum in *.sha256; do
  [ -f "$checksum" ] || continue
  shasum -a 256 -c "$checksum"
done
date -u '+Backup sync completed: %Y-%m-%d %H:%M:%S UTC'
