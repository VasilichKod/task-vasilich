#!/usr/bin/env python3
"""VPS-only encrypted backups; verified readback before narrowly scoped retention."""
import argparse
import configparser
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tarfile
import tempfile
from datetime import datetime, timezone

APP = Path('/var/www/task-vasilich')
BACKUPS = Path('/var/backups/task-vasilich')
CONFIG_DIR = Path('/etc/task-vasilich-backup')
CONFIG = CONFIG_DIR / 'rclone.conf'
KIT = CONFIG_DIR / 'recovery.conf.enc'
STATUS = BACKUPS / 'cloud-status.json'
REMOTE = 'nedplan_secure:'
RECOVERY = 'nedplan_mailru:NePlan-Recovery/FirstByte-20261105/'
DUMP_RE = re.compile(r'task_vasilich_v3_(\d{8}T\d{15}Z)\.dump\Z')
BUNDLE_RE = re.compile(r'nedplan-backup-\d{8}T\d{15}Z\.tar\.gz\Z')
KEEP = 3


def now():
    return datetime.now(timezone.utc).isoformat()


def require_fresh_stamp(stamp):
    created = datetime.strptime(stamp[:15], '%Y%m%dT%H%M%S').replace(tzinfo=timezone.utc)
    age = (datetime.now(timezone.utc) - created).total_seconds()
    if age < -600 or age > 8 * 3600:
        raise RuntimeError('Database snapshot is stale or has a future timestamp')


def digest(path):
    value = hashlib.sha256()
    with Path(path).open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()


def atomic_json(path, data):
    partial = path.with_name(path.name + '.partial')
    partial.write_text(json.dumps(data, indent=2) + '\n')
    partial.chmod(0o600)
    partial.replace(path)


def rclone(*args):
    # Provider stderr may contain tokens/signed URLs. Never expose it to journals.
    result = subprocess.run(['rclone', '--config', str(CONFIG), '--contimeout', '20s',
                             '--timeout', '2m', '--retries', '3', '--low-level-retries', '3',
                             '--transfers', '1', '--checkers', '2', *map(str, args)],
                            capture_output=True, timeout=1800)
    if result.returncode:
        raise RuntimeError('Cloud operation failed (exit %s)' % result.returncode)
    return result.stdout


def readback(target, expected, work):
    downloaded = work / 'readback.bin'
    try:
        rclone('copyto', target, downloaded)
        if digest(downloaded) != expected:
            raise RuntimeError('Cloud SHA256 readback mismatch')
    finally:
        downloaded.unlink(missing_ok=True)


def copy_verified(source, target, work):
    rclone('copyto', source, target, '--immutable')
    readback(target, digest(source), work)


def validate_receipt(data, bundle):
    if not BUNDLE_RE.fullmatch(bundle) or not isinstance(data, dict):
        raise RuntimeError('Unsafe backup name')
    if data.get('version') != 1 or data.get('bundle') != bundle:
        raise RuntimeError('Invalid backup receipt')
    files = data.get('files')
    if not isinstance(files, list) or len(files) != 2:
        raise RuntimeError('Incomplete backup receipt')
    names = set()
    for item in files:
        if not isinstance(item, dict):
            raise RuntimeError('Invalid file metadata')
        name = item.get('name')
        if (name not in (bundle, bundle + '.sha256') or name in names
                or type(item.get('size')) is not int or item['size'] <= 0
                or not isinstance(item.get('sha256'), str)
                or not re.fullmatch(r'[a-f0-9]{64}', item['sha256'])):
            raise RuntimeError('Unsafe file metadata')
        names.add(name)
    if names != {bundle, bundle + '.sha256'}:
        raise RuntimeError('Missing backup payload')
    return data


def listing():
    entries = json.loads(rclone('lsjson', REMOTE, '--files-only', '--max-depth', '1'))
    result = {}
    for entry in entries:
        name = entry.get('Path')
        if (not isinstance(name, str) or '/' in name or '\\' in name or name in result
                or type(entry.get('Size')) is not int):
            raise RuntimeError('Ambiguous cloud listing')
        result[name] = entry['Size']
    return result


def prune(current_bundle, work):
    objects = listing()
    receipts = {}
    for name, size in objects.items():
        if name.endswith('.verified.json') and BUNDLE_RE.fullmatch(name[:-14]):
            if size > 65536:
                raise RuntimeError('Oversized backup receipt')
            bundle = name[:-14]
            receipts[bundle] = validate_receipt(json.loads(rclone('cat', REMOTE + name)), bundle)
    retained = sorted(receipts, reverse=True)[:KEEP]
    if current_bundle not in retained:
        raise RuntimeError('Newest complete backup is not retained; no cleanup allowed')
    expired = sorted(set(receipts) - set(retained))
    if expired:
        if len(retained) != KEEP:
            raise RuntimeError('Not enough replacement backups')
        # Verify ALL retained copies again, not just cloud-reported size.
        for bundle in retained:
            for item in receipts[bundle]['files']:
                if objects.get(item['name']) != item['size']:
                    raise RuntimeError('Retained backup missing or changed')
                readback(REMOTE + item['name'], item['sha256'], work)
        for bundle in expired:
            for item in receipts[bundle]['files']:
                if item['name'] in objects:
                    rclone('deletefile', REMOTE + item['name'])
            # Receipt last: interrupted deletion can safely resume next run.
            rclone('deletefile', REMOTE + bundle + '.verified.json')
    # Owner approved whole-trash cleanup ONLY for the dedicated pinned account.
    policy = CONFIG_DIR / 'retention.json'
    if policy.exists():
        data = json.loads(policy.read_text())
        if data.get('empty_trash') is True:
            config = configparser.ConfigParser(interpolation=None)
            config.read(CONFIG)
            if not data.get('account') or config['nedplan_mailru']['user'] != data['account']:
                raise RuntimeError('Refusing trash cleanup for an unapproved account')
            rclone('cleanup', 'nedplan_mailru:')
    return {'retained': len(retained), 'expired_copies_removed': len(expired)}


def verify_local_bundle(bundle):
    expected = bundle.with_name(bundle.name + '.sha256').read_text().split()
    if len(expected) != 2 or expected[1] != bundle.name or digest(bundle) != expected[0]:
        raise RuntimeError('Local archive checksum mismatch')
    with tarfile.open(bundle, 'r:gz') as archive:
        manifest = json.load(archive.extractfile('manifest.json'))
        for item in manifest['files']:
            member = archive.extractfile(item['name'])
            value = hashlib.sha256()
            for block in iter(lambda: member.read(1024 * 1024), b''):
                value.update(block)
            if value.hexdigest() != item['sha256']:
                raise RuntimeError('Archive manifest mismatch')


def build_bundle(dump):
    match = DUMP_RE.fullmatch(dump.name)
    if not match:
        raise RuntimeError('Unexpected database backup name')
    checksum = dump.with_name(dump.name + '.sha256').read_text().split()
    if len(checksum) != 2 or checksum[1] != dump.name or digest(dump) != checksum[0]:
        raise RuntimeError('Database checksum mismatch')
    subprocess.run(['pg_restore', '--list', str(dump)], check=True, stdout=subprocess.DEVNULL,
                   stderr=subprocess.DEVNULL)
    cloud_dir = BACKUPS / 'cloud'
    cloud_dir.mkdir(mode=0o700, exist_ok=True)
    bundle = cloud_dir / ('nedplan-backup-' + match[1] + '.tar.gz')
    if bundle.exists():
        verify_local_bundle(bundle)
        return bundle
    with tempfile.TemporaryDirectory(prefix='bundle-', dir=cloud_dir) as temp:
        work = Path(temp)
        source = work / 'source.tar.gz'
        git = ['git', '-c', 'safe.directory=' + str(APP), '-C', str(APP)]
        subprocess.run(git + ['archive', '--format=tar.gz', '-o', str(source), 'HEAD', 'V3'], check=True)
        commit = subprocess.check_output(git + ['rev-parse', 'HEAD'], text=True).strip()
        files = [(dump, 'database.dump'), (source, 'source.tar.gz')]
        required = [APP / 'V3/.env', Path('/etc/nginx/sites-available/nedplan'),
                    Path('/etc/systemd/system/task-vasilich-v3.service')]
        for path in required:
            if not path.is_file():
                raise RuntimeError('Required server configuration missing')
        optional = [Path('/etc/nginx/nginx.conf'), Path('/etc/nginx/conf.d/00-tls12.conf')]
        optional += list(Path('/etc/nginx/snippets').glob('*tls*'))
        optional += list(Path('/etc/systemd/system').glob('task-vasilich-*.*'))
        optional += list(Path('/etc/letsencrypt/live/nedplan.ru').glob('*.pem'))
        optional += [Path('/etc/letsencrypt/renewal/nedplan.ru.conf')]
        for path in sorted(set(required + optional)):
            if path.is_file():
                files.append((path, 'server' + str(path)))
        manifest = {'version': 1, 'created_at': now(), 'commit': commit,
                    'postgresql_major': 17,
                    'files': [{'name': name, 'sha256': digest(path), 'size': path.stat().st_size}
                              for path, name in files]}
        manifest_path = work / 'manifest.json'
        atomic_json(manifest_path, manifest)
        partial = work / 'bundle.tar.gz'
        with tarfile.open(partial, 'w:gz', dereference=True) as archive:
            for path, name in files + [(manifest_path, 'manifest.json')]:
                archive.add(path, arcname=name, recursive=False)
        partial.replace(bundle)
        bundle.with_name(bundle.name + '.sha256').write_text(digest(bundle) + '  ' + bundle.name + '\n')
    verify_local_bundle(bundle)
    return bundle


def upload(bundle, work):
    verify_local_bundle(bundle)
    kit_target = RECOVERY + 'recovery-' + digest(KIT)[:16] + '.conf.enc'
    copy_verified(KIT, kit_target, work)  # Outside crypt: recovery does not require lost crypt keys.
    sources = (bundle, bundle.with_name(bundle.name + '.sha256'))
    for source in sources:
        copy_verified(source, REMOTE + source.name, work)
    receipt = validate_receipt({'version': 1, 'bundle': bundle.name,
                               'files': [{'name': p.name, 'size': p.stat().st_size, 'sha256': digest(p)}
                                         for p in sources]}, bundle.name)
    path = work / (bundle.name + '.verified.json')
    atomic_json(path, receipt)
    copy_verified(path, REMOTE + path.name, work)
    return prune(bundle.name, work)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true', help='Fail if no verified upload within 8 hours')
    args = parser.parse_args()
    os.umask(0o077)
    previous = json.loads(STATUS.read_text()) if STATUS.exists() else {}
    if args.check:
        stamp = previous.get('last_success_at')
        if not stamp or (datetime.now(timezone.utc) - datetime.fromisoformat(stamp)).total_seconds() > 8 * 3600:
            raise RuntimeError('No recent verified cloud backup')
        if previous.get('status') != 'success':
            raise RuntimeError('Last cloud backup attempt failed')
        bundle = previous.get('bundle', '')
        if not BUNDLE_RE.fullmatch(bundle):
            raise RuntimeError('Missing snapshot name')
        require_fresh_stamp(bundle.removeprefix('nedplan-backup-').removesuffix('.tar.gz'))
        print('Cloud backup verified:', previous['bundle'], stamp)
        return
    with Path('/run/lock/nedplan-cloud-backup.lock').open('w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        result = {'status': 'running', 'started_at': now(),
                  'last_success_at': previous.get('last_success_at')}
        try:
            if not CONFIG.is_file() or not KIT.is_file():
                raise RuntimeError('Cloud account has not been connected')
            dumps = sorted(p for p in BACKUPS.iterdir() if DUMP_RE.fullmatch(p.name) and p.is_file())
            if not dumps:
                raise RuntimeError('No database backup available')
            # Hourly retries must not make an old database snapshot look fresh.
            require_fresh_stamp(DUMP_RE.fullmatch(dumps[-1].name)[1])
            bundle = build_bundle(dumps[-1])
            with tempfile.TemporaryDirectory(prefix='cloud-readback-') as temp:
                result['retention'] = upload(bundle, Path(temp))
            result.update(status='success', last_success_at=now(), bundle=bundle.name)
            atomic_json(STATUS, result)
            print('Encrypted cloud backup verified:', bundle.name)
        except Exception as exc:
            result.update(status='error', failed_at=now(), error_type=type(exc).__name__)
            atomic_json(STATUS, result)
            raise


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        # Do not print arbitrary exception messages containing secrets/provider output.
        print('Cloud backup failed:', type(exc).__name__)
        raise SystemExit(1)
