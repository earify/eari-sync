#!/data/data/com.termux/files/usr/bin/bash
exec > /sdcard/eari-fix.log 2>&1
set -x
date
cd "$HOME/eari-sync"
git pull --ff-only || true
rm -f shared/tsconfig.tsbuildinfo
npm run build -w shared
npm run build -w server
pkill -f "node server/dist/main.js" 2>/dev/null || true
sleep 1
nohup node server/dist/main.js > "$HOME/eari-sync-server.log" 2>&1 &
sleep 3
echo "--- health ---"
curl -s -m 5 http://127.0.0.1:8443/health || echo "health check failed"
echo ""
echo "--- server log ---"
tail -5 "$HOME/eari-sync-server.log"
echo "FIXDONE"
