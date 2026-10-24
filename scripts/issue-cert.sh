#!/data/data/com.termux/files/usr/bin/bash
# issue Let's Encrypt cert for $1 (default sync.earify.net) via HTTP-01 on 8888
DOMAIN="${1:-sync.earify.net}"
exec > /sdcard/eari-issue.log 2>&1
set -x
date
command -v crond >/dev/null 2>&1 && { pgrep -x crond >/dev/null 2>&1 || crond; }
ACME="$HOME/.acme.sh/acme.sh"
[ -x "$ACME" ] || { echo "NO ACME"; echo ISSUEDONE; exit 1; }
pkill -f "server/dist/main.js" 2>/dev/null || true
sleep 1
"$ACME" --issue -d "$DOMAIN" --standalone --httpport 8888 --server letsencrypt
if [ $? -ne 0 ]; then
  echo "ISSUE FAILED"
  echo ISSUEDONE
  exit 1
fi
mkdir -p "$HOME/eari-sync-data/certs"
"$ACME" --install-cert -d "$DOMAIN" \
  --fullchain-file "$HOME/eari-sync-data/certs/server.crt" \
  --key-file "$HOME/eari-sync-data/certs/server.key" \
  --reloadcmd "bash $HOME/eari-sync/scripts/restart.sh"
node -e "const fs=require('fs');const p=process.env.HOME+'/eari-sync-data/config/server.json';const c=JSON.parse(fs.readFileSync(p,'utf8'));c.httpsMode='letsencrypt';fs.writeFileSync(p,JSON.stringify(c,null,2));"
echo "ISSUEOK"
echo ISSUEDONE
