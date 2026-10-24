#!/data/data/com.termux/files/usr/bin/bash
# restart eari-sync server + ensure crond (for cert auto-renewal & ddns)
pkill -f "server/dist/main.js" 2>/dev/null || true
sleep 1
command -v crond >/dev/null 2>&1 && { pgrep -x crond >/dev/null 2>&1 || crond; }
cd "$HOME/eari-sync" || exit 1
nohup node server/dist/main.js > "$HOME/eari-sync-server.log" 2>&1 &
echo "server restarted (pid $!)"
