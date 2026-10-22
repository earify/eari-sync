# HTTPS Setup

HTTPS is mandatory for production. Two modes.

## Mode A: Let's Encrypt (recommended)

Requires inbound port 80 (and 443/8443) and a public IP (no CGNAT).

1. Obtain a cert with acme.sh or certbot on Termux:
   ```bash
   pkg install tur-repo
   pkg install certbot
   certbot certonly --standalone -d your-ddns-domain --http-01-port 80
   ```
2. Point server to cert files:
   ```bash
   export EARI_SYNC_CERT=/data/data/com.termux/files/home/.certbot/live/your-ddns/fullchain.pem
   export EARI_SYNC_KEY=/data/data/com.termux/files/home/.certbot/live/your-ddns/privkey.pem
   ```
   or edit `~/eari-sync-data/config/server.json`.
3. Renewal: cron job `certbot renew` (termux-job-scheduler or crond). Restart server after renewal.

Dependency: Let's Encrypt (external CA). Disclosed per spec.

## Mode B: Self-signed CA (zero external dependency)

1. Generate CA + leaf cert on Termux:
   ```bash
   openssl genrsa -out ca.key 4096
   openssl req -x509 -new -nodes -key ca.key -sha256 -days 3650 -out ca.crt -subj "/CN=eari-sync CA"
   openssl genrsa -out server.key 2048
   openssl req -new -key server.key -out server.csr -subj "/CN=your-ddns-domain"
   openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out server.crt -days 825 -sha256
   ```
2. Configure server cert/key = server.crt/server.key.
3. Distribute `ca.crt` to each client OS trust store (Windows certmgr, Android/iOS profile install). Plugin uses standard TLS verification (no verification bypass).

## CGNAT / port 80 blocked

- Check public IP vs router WAN IP. If different → CGNAT. Options without external services: request public IP from ISP, or use a different inbound port (Let's Encrypt HTTP-01 still needs 80; use DNS-01 only if DNS provider API available — ipTIME DDNS usually not).
- If only port 80 blocked but 443 open, Mode B self-signed works over 443/8443 without CA dependency.

## NAT Loopback verification

From inside LAN, run:
```bash
curl -v https://your-ddns-domain:8443/health
```
If it fails but external works, router lacks NAT loopback. Options: use router's LAN IP directly for local clients (requires manual switching — violates unified address goal) or replace router. Documented limitation.
