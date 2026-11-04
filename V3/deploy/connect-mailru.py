#!/usr/bin/env python3
"""One-time owner wizard on Mac. No scheduled tasks, secrets in chat or secret argv."""
import configparser
import getpass
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
PRIVATE = ROOT / 'backups/mailru-private'
CONFIG = PRIVATE / 'rclone.conf'
KIT = PRIVATE / 'recovery.conf.enc'
RCLONE = shutil.which('rclone') or '/opt/homebrew/bin/rclone'
HOST = 'root@45.144.65.6'
OPTIONS = ['-i', str(Path.home() / '.ssh/id_ed25519_nedplan'), '-o', 'BatchMode=yes',
           '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=15']
STAGE = '/root/nedplan-recovery-20261105/cloud-credentials'


def run(*args, env=None, config=CONFIG):
    result = subprocess.run([RCLONE, '--config', str(config), *map(str, args)],
                            capture_output=True, env=env, timeout=180)
    if result.returncode:
        # Never print rclone stderr: authentication responses may contain secrets.
        raise RuntimeError('Операция с облаком не прошла. Проверь пароль приложения и права доступа.')
    return result.stdout


def obscure(value):
    return subprocess.check_output([RCLONE, 'obscure', '-'], input=value.encode()).decode().strip()


def write_config(cfg):
    partial = CONFIG.with_suffix('.partial')
    with partial.open('w') as target:
        cfg.write(target)
    partial.chmod(0o600)
    partial.replace(CONFIG)


def recovery_kit():
    print('\nПридумай отдельную парольную фразу восстановления (от 16 символов).')
    print('Сохрани её в менеджере паролей: без неё облачный ключ не открыть.')
    if KIT.exists():
        print('Аварийный файл уже есть — введи ПРЕЖНЮЮ фразу, ключи не меняем.')
    while True:
        phrase = getpass.getpass('Фраза восстановления (скрыта): ')
        if len(phrase) < 16:
            print('Нужно минимум 16 символов.')
            continue
        if KIT.exists() or phrase == getpass.getpass('Повтори фразу: '):
            break
        print('Фразы не совпали.')
    env = dict(os.environ, NEDPLAN_RECOVERY_PASSWORD=phrase)
    # rclone's SpaceSepList uses double-quoted CSV, not POSIX single quotes.
    # The repository path contains spaces; shlex.join silently breaks this helper.
    command = ' '.join(json.dumps(arg, ensure_ascii=False) for arg in
                       [sys.executable, str(Path(__file__).resolve()), '--recovery-password'])
    with tempfile.TemporaryDirectory(prefix='recovery-', dir=PRIVATE) as temp:
        work = Path(temp)
        if KIT.exists():
            previous = work / 'previous.conf'
            shutil.copyfile(KIT, previous)
            run('--password-command', command, 'config', 'encryption', 'remove', env=env, config=previous)
            old = configparser.ConfigParser(interpolation=None)
            current = configparser.ConfigParser(interpolation=None)
            old.read(previous)
            current.read(CONFIG)
            for field in ('password', 'password2'):
                if (not old.has_option('nedplan_secure', field)
                        or old['nedplan_secure'][field] != current['nedplan_secure'][field]):
                    raise RuntimeError('Ключи различаются: существующий аварийный файл сохранён.')
        encrypted = work / 'encrypted.conf'
        shutil.copyfile(CONFIG, encrypted)
        run('--password-command', command, 'config', 'encryption', 'set', env=env, config=encrypted)
        run('--password-command', command, 'config', 'encryption', 'check', env=env, config=encrypted)
        if b'RCLONE_ENCRYPT_V0:' not in encrypted.read_bytes()[:128]:
            raise RuntimeError('Аварийный файл не зашифрован. Отправка на сервер остановлена.')
        restored = work / 'restored.conf'
        shutil.copyfile(encrypted, restored)
        run('--password-command', command, 'config', 'encryption', 'remove', env=env, config=restored)
        if restored.read_bytes() != CONFIG.read_bytes():
            raise RuntimeError('Проверка аварийного файла не прошла.')
        if KIT.exists():
            historical = PRIVATE / ('recovery-' + hashlib.sha256(KIT.read_bytes()).hexdigest()[:16] + '.conf.enc')
            if not historical.exists():
                shutil.copyfile(KIT, historical)
                historical.chmod(0o600)
        encrypted.replace(KIT)
        KIT.chmod(0o600)
    env.pop('NEDPLAN_RECOVERY_PASSWORD', None)
    print('Ключевой файл зашифрован, расшифровка проверена.')
    input('Сохрани фразу ВНЕ этого компьютера и нажми Enter: ')


def main():
    os.umask(0o077)
    PRIVATE.mkdir(parents=True, mode=0o700, exist_ok=True)
    PRIVATE.chmod(0o700)
    subprocess.run(['ssh', *OPTIONS, HOST, 'test -x /usr/local/bin/rclone'], check=True)
    print('НеПлан: подключение отдельного Mail.ru. Mac используется только сейчас, без расписаний.')
    print('Пароли вводятся скрыто; в чат и историю команд они не попадут.')
    cfg = configparser.ConfigParser(interpolation=None)
    cfg.read(CONFIG)
    if 'nedplan_mailru' not in cfg:
        account = input('Почта отдельного аккаунта Mail.ru: ').strip().lower()
        if '@' not in account or any(c.isspace() for c in account):
            raise RuntimeError('Нужен адрес почты.')
        print('Нужен пароль ВНЕШНЕГО приложения с доступом «Почта, Облако и Календарь».')
        password = getpass.getpass('Пароль приложения (скрыт): ')
        if not password:
            raise RuntimeError('Пароль не введён.')
        cfg['nedplan_mailru'] = {'type': 'mailru', 'user': account,
                                'pass': obscure(password), 'speedup_enable': 'false'}
        password = None
    if 'nedplan_secure' not in cfg:
        if KIT.exists():
            raise RuntimeError('Есть прежний ключевой файл. Новые ключи не создавались: нужна проверка.')
        cfg['nedplan_secure'] = {'type': 'crypt', 'remote': 'nedplan_mailru:NePlan-Backups/FirstByte-20261105',
                                 'filename_encryption': 'standard', 'directory_name_encryption': 'true',
                                 'password': obscure(secrets.token_urlsafe(48)),
                                 'password2': obscure(secrets.token_urlsafe(48))}
    write_config(cfg)
    try:
        run('about', 'nedplan_mailru:', '--json')
    except RuntimeError:
        password = getpass.getpass('Вход не прошёл. Введи новый пароль приложения (скрыт): ')
        if not password:
            raise RuntimeError('Подключение не завершено.') from None
        cfg['nedplan_mailru']['pass'] = obscure(password)
        password = None
        write_config(cfg)
        run('about', 'nedplan_mailru:', '--json')
    print('Вход в отдельное Облако Mail.ru проверен.')
    recovery_kit()
    subprocess.run(['ssh', *OPTIONS, HOST, 'install -d -m 700 ' + STAGE], check=True)
    for source in (CONFIG, KIT):
        subprocess.run(['scp', *OPTIONS, str(source), HOST + ':' + STAGE + '/'], check=True)
    subprocess.run(['ssh', *OPTIONS, HOST,
                    'python3 /usr/local/lib/nedplan-backup/activate-cloud-backup.py'], check=True, timeout=2700)
    print('\nГотово: первая полная копия скачана обратно и проверена. В облаке храним 3 последние.')
    print('Ключевой файл на Mac:', KIT)
    print('Резервирование дальше работает с VPS, компьютер можно выключить.')


if __name__ == '__main__':
    if sys.argv[1:] == ['--recovery-password']:
        print(os.environ['NEDPLAN_RECOVERY_PASSWORD'])
    else:
        try:
            main()
        except (Exception, KeyboardInterrupt) as exc:
            print('\nПодключение не завершено:', str(exc) if isinstance(exc, RuntimeError) else type(exc).__name__)
            print('Серверные копии базы продолжают работать. Ключи не удалены; можно повторить команду.')
            raise SystemExit(1)
