#!/data/data/com.termux/files/usr/bin/bash
# one-shot Let's Encrypt setup for eari-sync (HTTP-01 via forwarded port 80 -> 8080)
exec > /sdcard/eari-le.log 2>&1
set -x
date

# cron first so acme.sh installer detects crontab (needed for auto-renewal)
pkg install -y cronie socat || true
pkill crond 2>/dev/null || true
sleep 1
crond
sleep 1
command -v crontab && crontab -l 2>/dev/null | head -3 || echo "no crontab yet"

export ACME_HOME="$HOME/.acme.sh"
ACME="$HOME/.acme.sh/acme.sh"
if [ ! -x "$ACME" ]; then
  curl -s https://get.acme.sh | sh -s email=yusiwoo8363@gmail.com
fi
[ -x "$ACME" ] || ACME=$(command -v acme.sh)
[ -x "$ACME" ] || { echo "NO ACME SH"; echo LEDONE; exit 1; }

"$ACME" --set-default-ca --server letsencrypt
"$ACME" --install-cronjob >/dev/null 2>&1 || true

# stop server so the flow is clean (server uses 8443; acme uses 8080)
pkill -f "server/dist/main.js" 2>/dev/null || true
sleep 1

"$ACME" --issue -d eari.iptime.org --standalone --httpport 8080 --server letsencrypt
if [ $? -ne 0 ]; then
  echo "LE ISSUE FAILED"
  echo LEDONE
  exit 1
fi

mkdir -p "$HOME/eari-sync-data/certs"
"$ACME" --install-cert -d eari.iptime.org \
  --fullchain-file "$HOME/eari-sync-data/certs/server.crt" \
  --key-file "$HOME/eari-sync-data/certs/server.key" \
  --reloadcmd "bash $HOME/eari-sync/scripts/restart.sh"

node -e "const fs=require('fs');const p=process.env.HOME+'/eari-sync-data/config/server.json';const c=JSON.parse(fs.readFileSync(p,'utf8'));c.httpsMode='letsencrypt';fs.writeFileSync(p,JSON.stringify(c,null,2));"

echo "LEOK"
echo LEDONE
