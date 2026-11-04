#!/usr/bin/env python3
"""One-time restore into an empty VPS. Refuses an existing app or database."""
import json
import os
import pathlib
import pwd
import secrets
import shutil
import subprocess
import sys

APP = pathlib.Path('/var/www/task-vasilich')
STAGING = pathlib.Path('/root/nedplan-recovery-20261105')
DATABASE = 'task_vasilich_v3'
ROLE = 'task_vasilich'


def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def sql(query, database='postgres', capture=False):
    result = run(['runuser', '-u', 'postgres', '--', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-A', '-t', '-d', database],
                 input=query, text=True, stdout=subprocess.PIPE if capture else None)
    return result.stdout.strip() if capture else None


if os.geteuid() != 0:
    sys.exit('Run as root on the new VPS only.')
if APP.exists():
    sys.exit('Refusing to overwrite an existing application directory.')
if sql("SELECT 1 FROM pg_database WHERE datname='task_vasilich_v3';", capture=True):
    sys.exit('Refusing to overwrite an existing database.')
if sql("SELECT 1 FROM pg_roles WHERE rolname='task_vasilich';", capture=True):
    sys.exit('Database role already exists; inspect it before retrying.')

try:
    deploy = pwd.getpwnam('deploy')
except KeyError:
    run(['useradd', '--system', '--create-home', '--home-dir', '/home/deploy', '--shell', '/bin/bash', 'deploy'])
    deploy = pwd.getpwnam('deploy')

APP.parent.mkdir(parents=True, exist_ok=True)
run(['git', 'clone', '--branch', 'main', str(STAGING / 'source.bundle'), str(APP)])
run(['git', '-C', str(APP), 'remote', 'set-url', 'origin', 'https://github.com/VasilichKod/task-vasilich.git'])
password = secrets.token_hex(32)
sql(f"CREATE ROLE {ROLE} LOGIN PASSWORD '{password}';")
run(['runuser', '-u', 'postgres', '--', 'createdb', '--owner', ROLE, DATABASE])
# Only the just-created empty schema is removed; existing databases were rejected.
sql('DROP SCHEMA public;', DATABASE)
with (STAGING / 'july-21.dump').open('rb') as dump:
    run(['runuser', '-u', 'postgres', '--', 'pg_restore', '--no-owner', '--no-acl', '--exit-on-error', '--role', ROLE, '--dbname', DATABASE], stdin=dump)

env = APP / 'V3/.env'
env.write_text(
    f'DATABASE_URL="postgresql://{ROLE}:{password}@127.0.0.1:5432/{DATABASE}?schema=public"\n'
    f'DIRECT_URL="postgresql://{ROLE}:{password}@127.0.0.1:5432/{DATABASE}?schema=public"\n'
    'APP_URL="https://nedplan.ru"\n'
    f'AUTH_SECRET="{secrets.token_hex(48)}"\n'
    'ADMIN_EMAILS=""\nNODE_ENV="production"\nPORT="3000"\nBIND_HOST="127.0.0.1"\n',
    encoding='utf-8')
env.chmod(0o600)
run(['chown', '-R', 'deploy:deploy', str(APP)])
for command in (['npm', 'ci', '--include=dev', '--no-audit', '--no-fund'],
                ['npm', 'run', 'prisma:generate'], ['npm', 'run', 'prisma:migrate:deploy'], ['npm', 'run', 'typecheck']):
    run(['runuser', '-u', 'deploy', '--', *command], cwd=APP / 'V3')

deploy_dir = APP / 'V3/deploy'
for name in ('task-vasilich-v3.service', 'task-vasilich-backup.service', 'task-vasilich-backup.timer'):
    shutil.copyfile(deploy_dir / name, pathlib.Path('/etc/systemd/system') / name)
    (pathlib.Path('/etc/systemd/system') / name).chmod(0o644)
pathlib.Path('/var/lib/letsencrypt').mkdir(parents=True, exist_ok=True)
nginx_target = pathlib.Path('/etc/nginx/sites-available/nedplan')
shutil.copyfile(deploy_dir / 'nginx.nedplan-direct-http.conf', nginx_target)
nginx_link = pathlib.Path('/etc/nginx/sites-enabled/nedplan')
nginx_link.symlink_to(nginx_target)
default_link = pathlib.Path('/etc/nginx/sites-enabled/default')
if default_link.is_symlink() and default_link.resolve() == pathlib.Path('/etc/nginx/sites-available/default'):
    default_link.unlink()
run(['nginx', '-t'])
run(['systemctl', 'daemon-reload'])
run(['systemctl', 'enable', '--now', 'task-vasilich-v3', 'task-vasilich-backup.timer'])
run(['systemctl', 'reload', 'nginx'])
run(['systemctl', 'start', 'task-vasilich-backup.service'])
counts = sql("SELECT json_build_object('users',(SELECT count(*) FROM users),'projects',(SELECT count(*) FROM projects),'weeklyTasks',(SELECT count(*) FROM weekly_tasks),'backlogTasks',(SELECT count(*) FROM backlog_tasks),'projectNotes',(SELECT count(*) FROM project_notes));", DATABASE, capture=True)
print('Restored July snapshot: ' + counts)
print('HTTP deployment ready. HTTPS certificate is the next step.')
