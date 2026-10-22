#!/data/data/com.termux/files/usr/bin/bash
exec > /sdcard/eari-restart.log 2>&1
set -x
pkill -f "server/dist/main.js" 2>/dev/null || true
sleep 1
pgrep -af node || true
cd "$HOME/eari-sync"
nohup node server/dist/main.js > "$HOME/eari-sync-server.log" 2>&1 &
sleep 3
echo "--- https health ---"
curl -s -m 5 -k https://127.0.0.1:8443/health || echo "https health failed"
echo ""
tail -4 "$HOME/eari-sync-server.log"
echo "RESTARTDONE"
