#!/bin/bash
set -euo pipefail
source_dir=$(cd -- "$(dirname -- "$0")" && pwd)
install -d -o root -g root -m 755 /usr/local/lib/nedplan-backup
for name in backup-database.sh cloud-backup.py activate-cloud-backup.py; do
    install -o root -g root -m 644 "$source_dir/$name" "/usr/local/lib/nedplan-backup/$name"
done
for name in task-vasilich-backup.service task-vasilich-backup.timer task-vasilich-cloud-backup.service task-vasilich-cloud-backup.timer; do
    install -o root -g root -m 644 "$source_dir/$name" "/etc/systemd/system/$name"
done
systemctl daemon-reload
# Credential wizard enables the cloud timer later. Local schedule is independent.
systemctl enable --now task-vasilich-backup.timer
