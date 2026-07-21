# TSPU / TLS 1.3 workaround

## Current production state

On 2026-07-21 Russian ISP traffic to the origin IPv4 `109.172.37.55`
started failing during HTTPS access while HTTP and VPN-routed traffic kept
working. The hosting provider confirmed a TSPU filtering incident and
recommended temporarily disabling TLS 1.3.

The production domains currently point directly to `109.172.37.55` and nginx
accepts TLS 1.2 only. The applications and databases remain on that server.

The fallback edge VPS is `193.42.127.231`. Its ready-to-enable configs are:

- `deploy/nginx.nedplan-edge.conf`;
- `deploy/nginx.additional-edge.conf`.

## Origin configuration

The origin server has both of these controls because nginx chooses a TLS
protocol before applying the SNI-specific `server` configuration:

1. `/etc/nginx/nginx.conf` in the `http` context:

   ```nginx
   ssl_protocols TLSv1.2;
   ```

2. Every HTTPS vhost includes:

   ```nginx
   include /etc/nginx/snippets/ssl-params-tls12.conf;
   ```

Install the tracked snippet with:

```bash
sudo install -o root -g root -m 644 \
  deploy/ssl-params-tls12.conf \
  /etc/nginx/snippets/ssl-params-tls12.conf
sudo nginx -t
sudo systemctl reload nginx
```

The pre-change production backup is stored on the origin server at:

```text
/root/nginx-backup-before-tls12-20260721/
```

## Verification

TLS 1.3 must fail and TLS 1.2 must succeed:

```bash
openssl s_client -connect 109.172.37.55:443 -servername nedplan.ru -tls1_3
openssl s_client -connect 109.172.37.55:443 -servername nedplan.ru -tls1_2
```

Then verify all public domains from a network without VPN.

## Rollback

Only re-enable TLS 1.3 after testing the origin IP through several Russian
fixed and mobile providers:

1. Restore `ssl_protocols TLSv1.2 TLSv1.3;` in `/etc/nginx/nginx.conf`.
2. Replace the custom snippet include in HTTPS vhosts with
   `/etc/letsencrypt/options-ssl-nginx.conf`.
3. Run `nginx -t` and reload nginx.
4. Confirm TLS 1.2 and TLS 1.3 handshakes and test the sites without VPN.
