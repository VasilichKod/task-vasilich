#!/usr/bin/env python3
"""Activate only an authenticated, dedicated Mail.ru config; never rotate old keys."""
import configparser
import json
import os
from pathlib import Path
import shutil
import subprocess

STAGE = Path('/root/nedplan-recovery-20261105/cloud-credentials')
TARGET = Path('/etc/task-vasilich-backup')


def main():
    if os.geteuid() != 0:
        raise RuntimeError('Run as root')
    os.umask(0o077)
    config = configparser.ConfigParser(interpolation=None)
    config.read(STAGE / 'rclone.conf')
    if (set(config.sections()) != {'nedplan_mailru', 'nedplan_secure'}
            or config['nedplan_mailru'].get('type') != 'mailru'
            or not config['nedplan_mailru'].get('user')
            or config['nedplan_secure'].get('type') != 'crypt'
            or config['nedplan_secure'].get('remote') != 'nedplan_mailru:NePlan-Backups/FirstByte-20261105'
            or not config['nedplan_secure'].get('password')
            or not config['nedplan_secure'].get('password2')):
        raise RuntimeError('Unexpected configuration')
    if b'RCLONE_ENCRYPT_V0:' not in (STAGE / 'recovery.conf.enc').read_bytes()[:128]:
        raise RuntimeError('Recovery config is not password encrypted')
    if (TARGET / 'rclone.conf').exists():
        old = configparser.ConfigParser(interpolation=None)
        old.read(TARGET / 'rclone.conf')
        if (old['nedplan_mailru']['user'] != config['nedplan_mailru']['user']
                or any(old['nedplan_secure'][key] != config['nedplan_secure'][key]
                       for key in ('password', 'password2', 'remote'))):
            raise RuntimeError('Refusing to change account or encryption keys of existing backups')
    checked = subprocess.run(['rclone', '--config', str(STAGE / 'rclone.conf'), 'about',
                              'nedplan_mailru:', '--json'], capture_output=True, timeout=180)
    if checked.returncode:
        raise RuntimeError('Cloud authentication failed; active config was not replaced')
    TARGET.mkdir(mode=0o700, exist_ok=True)
    TARGET.chmod(0o700)
    for name in ('rclone.conf', 'recovery.conf.enc'):
        partial = TARGET / (name + '.new')
        shutil.copyfile(STAGE / name, partial)
        partial.chmod(0o600)
        partial.replace(TARGET / name)
    # Whole-trash cleanup explicitly approved 2026-11-05; pin to this account.
    policy = TARGET / 'retention.json'
    policy.write_text(json.dumps({'keep': 3, 'empty_trash': True,
                                  'account': config['nedplan_mailru']['user']}) + '\n')
    policy.chmod(0o600)
    subprocess.run(['systemctl', 'enable', '--now', 'task-vasilich-cloud-backup.timer'], check=True)
    subprocess.run(['systemctl', 'start', 'task-vasilich-backup.service'], check=True)
    subprocess.run(['systemctl', 'start', 'task-vasilich-cloud-backup.service'], check=True)
    subprocess.run(['python3', '/usr/local/lib/nedplan-backup/cloud-backup.py', '--check'], check=True)
    # Remove exact credential staging files only after a verified cloud upload.
    for name in ('rclone.conf', 'recovery.conf.enc'):
        (STAGE / name).unlink()


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print('Cloud activation failed:', type(exc).__name__)
        raise SystemExit(1)
