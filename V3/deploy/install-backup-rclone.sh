#!/bin/bash
set -euo pipefail
umask 077
stage=$(mktemp -d /root/nedplan-rclone.XXXXXXXX)
trap 'rm -f -- "$stage/rclone.zip" "$stage/SHA256SUMS"; rmdir "$stage" 2>/dev/null || true' EXIT
base=https://downloads.rclone.org/v1.75.2
curl --fail --silent --show-error --location "$base/rclone-v1.75.2-linux-amd64.zip" -o "$stage/rclone.zip"
curl --fail --silent --show-error --location "$base/SHA256SUMS" -o "$stage/SHA256SUMS"
expected=$(awk '$2 == "rclone-v1.75.2-linux-amd64.zip" { print $1 }' "$stage/SHA256SUMS")
test "${#expected}" -eq 64
printf '%s  %s\n' "$expected" "$stage/rclone.zip" | sha256sum --check -
unzip -p "$stage/rclone.zip" rclone-v1.75.2-linux-amd64/rclone > "$stage/rclone"
install -o root -g root -m 755 "$stage/rclone" /usr/local/bin/rclone
rm -f -- "$stage/rclone"
/usr/local/bin/rclone version
