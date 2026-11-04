#!/usr/bin/env python3
"""Issue the domain certificate only after public DNS reaches this new VPS."""
import datetime
import json
import pathlib
import re
import shutil
import subprocess
import urllib.request

ADDRESS = '45.144.65.6'
DOMAINS = ('nedplan.ru', 'www.nedplan.ru')
APP = pathlib.Path('/var/www/task-vasilich/V3')
CERT = pathlib.Path('/etc/letsencrypt/live/nedplan.ru/fullchain.pem')


def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def certificate_ready():
    if not CERT.is_file():
        return False
    checks = [ ['openssl', 'x509', '-in', str(CERT), '-noout', '-checkend', '86400'] ]
    checks += [['openssl', 'x509', '-in', str(CERT), '-noout', '-checkhost', domain] for domain in DOMAINS]
    return all(subprocess.run(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0 for command in checks)


if not certificate_ready():
    for domain in DOMAINS:
        for endpoint in ('https://dns.google/resolve', 'https://cloudflare-dns.com/dns-query'):
            request = urllib.request.Request(f'{endpoint}?name={domain}&type=A', headers={'Accept': 'application/dns-json'})
            with urllib.request.urlopen(request, timeout=10) as response:
                payload = json.load(response)
            addresses = {record['data'] for record in payload.get('Answer', []) if record.get('type') == 1}
            if addresses != {ADDRESS}:
                print(f'Waiting for DNS: {domain}: {sorted(addresses)}', flush=True)
                raise SystemExit(0)
    run(['certbot', 'certonly', '--non-interactive', '--agree-tos', '--register-unsafely-without-email',
         '--webroot', '-w', '/var/lib/letsencrypt', '--cert-name', 'nedplan.ru',
         '-d', DOMAINS[0], '-d', DOMAINS[1], '--keep-until-expiring',
         '--deploy-hook', '/usr/sbin/nginx -t && /usr/bin/systemctl reload nginx'])
    if not certificate_ready():
        raise RuntimeError('Certificate was not issued for both domain names.')

nginx_main = pathlib.Path('/etc/nginx/nginx.conf')
original = nginx_main.read_text()
backup = pathlib.Path('/etc/nginx/nginx.conf.before-nedplan-tls12')
if not backup.exists():
    shutil.copyfile(nginx_main, backup)
updated, changes = re.subn(r'(?m)^(\s*)ssl_protocols\s+[^;]+;', r'\1ssl_protocols TLSv1.2;', original, count=1)
if changes != 1:
    raise RuntimeError('Expected one global ssl_protocols directive; inspect nginx.conf.')
nginx_main.write_text(updated)
shutil.copyfile(APP / 'deploy/nginx.nedplan-direct-https.conf', '/etc/nginx/sites-available/nedplan')
run(['nginx', '-t'])
run(['systemctl', 'reload', 'nginx'])
run(['systemctl', 'disable', '--now', 'task-vasilich-https.timer'])
marker = pathlib.Path('/var/lib/nedplan/https-ready')
marker.parent.mkdir(parents=True, exist_ok=True)
marker.write_text(datetime.datetime.now(datetime.timezone.utc).isoformat() + '\n')
print('HTTPS ready at https://nedplan.ru; DNS-wait timer disabled.', flush=True)
