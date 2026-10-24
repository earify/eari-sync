#!/data/data/com.termux/files/usr/bin/bash
# restart eari-sync server (used by acme.sh --reloadcmd and manual restarts)
pkill -f "server/dist/main.js" 2>/dev/null || true
sleep 1
cd "$HOME/eari-sync" || exit 1
nohup node server/dist/main.js > "$HOME/eari-sync-server.log" 2>&1 &
echo "server restarted (pid $!)"
