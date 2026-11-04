#!/usr/bin/env python3
"""Offline tests against real rclone crypt + temporary local storage, never Mail.ru."""
import configparser
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('cloud_backup', Path(__file__).with_name('cloud-backup.py'))
backup = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(backup)


@unittest.skipUnless(shutil.which('rclone'), 'rclone required')
class CloudTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='nedplan-cloud-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.work = self.root / 'work'
        self.work.mkdir()
        config = self.root / 'rclone.conf'
        password = subprocess.check_output(['rclone', 'obscure', '-'], input=b'offline-only-test-key').decode().strip()
        cfg = configparser.ConfigParser()
        cfg['nedplan_secure'] = {'type': 'crypt', 'remote': str(self.root / 'encrypted'), 'password': password, 'password2': password,
                                 'filename_encryption': 'standard', 'directory_name_encryption': 'true'}
        with config.open('w') as target:
            cfg.write(target)
        kit = self.root / 'kit.enc'
        kit.write_bytes(b'synthetic-recovery-kit')
        for name, value in {'CONFIG': config, 'KIT': kit, 'CONFIG_DIR': self.root / 'policy',
                            'RECOVERY': str(self.root / 'recovery') + '/'}.items():
            mock = patch.object(backup, name, value)
            mock.start()
            self.addCleanup(mock.stop)

    def bundle(self, number):
        path = self.root / ('nedplan-backup-20261105T%02d0000000000000Z.tar.gz' % number)
        payload = ('database number %d' % number).encode()
        manifest = {'files': [{'name': 'database.dump', 'sha256': __import__('hashlib').sha256(payload).hexdigest()}]}
        with tarfile.open(path, 'w:gz') as archive:
            for name, data in [('database.dump', payload), ('manifest.json', json.dumps(manifest).encode())]:
                info = tarfile.TarInfo(name)
                info.size = len(data)
                archive.addfile(info, io.BytesIO(data))
        path.with_name(path.name + '.sha256').write_text(backup.digest(path) + '  ' + path.name + '\n')
        return path

    def raw_upload(self, path):
        receipt = {'version': 1, 'bundle': path.name, 'files': []}
        for source in (path, path.with_name(path.name + '.sha256')):
            backup.copy_verified(source, backup.REMOTE + source.name, self.work)
            receipt['files'].append({'name': source.name, 'size': source.stat().st_size, 'sha256': backup.digest(source)})
        marker = self.root / (path.name + '.verified.json')
        marker.write_text(json.dumps(receipt))
        backup.copy_verified(marker, backup.REMOTE + marker.name, self.work)

    def test_four_to_three_and_unknown_files_survive(self):
        sentinel = self.root / 'unrelated.txt'
        sentinel.write_text('must survive')
        backup.rclone('copyto', sentinel, backup.REMOTE + 'unrelated.txt')
        bundles = [self.bundle(i) for i in range(4)]
        for bundle in bundles:
            result = backup.upload(bundle, self.work)
        objects = backup.listing()
        self.assertEqual(result, {'retained': 3, 'expired_copies_removed': 1})
        self.assertNotIn(bundles[0].name, objects)
        self.assertIn('unrelated.txt', objects)
        for bundle in bundles[1:]:
            self.assertIn(bundle.name, objects)
            backup.readback(backup.REMOTE + bundle.name, backup.digest(bundle), self.work)
        encrypted_bytes = b''.join(p.read_bytes() for p in (self.root / 'encrypted').rglob('*') if p.is_file())
        self.assertNotIn(b'database number', encrypted_bytes)
        self.assertTrue(list((self.root / 'recovery').glob('recovery-*.conf.enc')))

    def test_upload_failure_never_prunes(self):
        first = self.bundle(1)
        backup.upload(first, self.work)
        before = backup.listing()
        with patch.object(backup, 'copy_verified', side_effect=RuntimeError('network failed')):
            with self.assertRaises(RuntimeError):
                backup.upload(self.bundle(2), self.work)
        self.assertEqual(before, backup.listing())

    def test_corrupt_retained_copy_blocks_deletion(self):
        bundles = [self.bundle(i) for i in range(4)]
        for bundle in bundles:
            self.raw_upload(bundle)
        corrupt = self.root / 'corrupt'
        corrupt.write_bytes(b'corrupt cloud data')
        backup.rclone('copyto', corrupt, backup.REMOTE + bundles[2].name)
        before = backup.listing()
        with self.assertRaises(RuntimeError):
            backup.prune(bundles[-1].name, self.work)
        self.assertEqual(before, backup.listing())

    def test_interrupted_deletion_resumes(self):
        bundles = [self.bundle(i) for i in range(4)]
        for bundle in bundles:
            self.raw_upload(bundle)
        backup.rclone('deletefile', backup.REMOTE + bundles[0].name)
        result = backup.prune(bundles[-1].name, self.work)
        self.assertEqual(result['retained'], 3)
        self.assertNotIn(bundles[0].name + '.verified.json', backup.listing())

    def test_traversal_and_duplicate_metadata_rejected(self):
        bundle = self.bundle(1)
        for name in ('../../other-file', bundle.name):
            receipt = {'version': 1, 'bundle': bundle.name,
                       'files': [{'name': name, 'size': 10, 'sha256': '0' * 64}] * 2}
            with self.assertRaises(RuntimeError):
                backup.validate_receipt(receipt, bundle.name)

    def test_corrupt_local_bundle_is_not_uploaded(self):
        bundle = self.bundle(1)
        bundle.write_bytes(b'broken archive')
        with patch.object(backup, 'rclone') as remote:
            with self.assertRaises(RuntimeError):
                backup.upload(bundle, self.work)
            remote.assert_not_called()

    def test_reupload_is_idempotent(self):
        bundle = self.bundle(1)
        backup.upload(bundle, self.work)
        before = backup.listing()
        backup.upload(bundle, self.work)
        self.assertEqual(before, backup.listing())

    def test_recovery_wizard_encryption_roundtrip_and_wrong_phrase(self):
        spec = importlib.util.spec_from_file_location('connect_mailru', Path(__file__).with_name('connect-mailru.py'))
        wizard = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(wizard)
        kit = self.root / 'wizard-kit.enc'
        with patch.object(wizard, 'PRIVATE', self.root), patch.object(wizard, 'CONFIG', backup.CONFIG), \
                patch.object(wizard, 'KIT', kit), patch('builtins.input', return_value=''), \
                patch.object(wizard.getpass, 'getpass', return_value='long offline test passphrase'):
            wizard.recovery_kit()
            before = kit.read_bytes()
            self.assertIn(b'RCLONE_ENCRYPT_V0:', before[:100])
            with patch.object(wizard.getpass, 'getpass', return_value='incorrect recovery passphrase'):
                with self.assertRaises(RuntimeError):
                    wizard.recovery_kit()
            self.assertEqual(before, kit.read_bytes())

    def test_stale_snapshot_is_not_made_fresh_by_reupload(self):
        backup.require_fresh_stamp(datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S') + '000000000Z')
        for stamp in ('20200101T000000000000000Z', '20990101T000000000000000Z'):
            with self.assertRaises(RuntimeError):
                backup.require_fresh_stamp(stamp)

    def test_whole_trash_cleanup_requires_pinned_account(self):
        bundle = self.bundle(1)
        self.raw_upload(bundle)
        backup.CONFIG_DIR.mkdir()
        cfg = configparser.ConfigParser()
        cfg.read(backup.CONFIG)
        cfg['nedplan_mailru'] = {'type': 'mailru', 'user': 'different@example.invalid'}
        with backup.CONFIG.open('w') as target:
            cfg.write(target)
        (backup.CONFIG_DIR / 'retention.json').write_text(json.dumps(
            {'keep': 3, 'empty_trash': True, 'account': 'dedicated@example.invalid'}))
        original = backup.rclone
        with patch.object(backup, 'rclone', wraps=original) as calls:
            with self.assertRaises(RuntimeError):
                backup.prune(bundle.name, self.work)
            self.assertFalse(any(call.args[0] == 'cleanup' for call in calls.call_args_list))
        cfg['nedplan_mailru']['user'] = 'dedicated@example.invalid'
        with backup.CONFIG.open('w') as target:
            cfg.write(target)
        cleaned = []
        def safe_rclone(*args):
            if args[0] == 'cleanup':
                cleaned.append(args)
                return b''
            return original(*args)
        with patch.object(backup, 'rclone', side_effect=safe_rclone):
            backup.prune(bundle.name, self.work)
        self.assertEqual(cleaned, [('cleanup', 'nedplan_mailru:')])


if __name__ == '__main__':
    unittest.main(verbosity=2)
