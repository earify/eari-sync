#!/data/data/com.termux/files/usr/bin/bash
exec > /sdcard/eari-setup.log 2>&1
set -x
date
pkg update -y
pkg install -y nodejs git
if [ -d "$HOME/eari-sync/.git" ]; then
  cd "$HOME/eari-sync" && git pull --ff-only || true
else
  rm -rf "$HOME/eari-sync"
  git clone --depth 1 https://github.com/earify/eari-sync "$HOME/eari-sync"
fi
cd "$HOME/eari-sync"
npm install
npm run build -w shared
npm run build -w server
if [ ! -f "$HOME/eari-sync-data/config/server.json" ]; then
  node server/dist/cli.js init --vault default
fi
termux-wake-lock 2>/dev/null || true
pkill -f "node server/dist/main.js" 2>/dev/null || true
nohup node server/dist/main.js > "$HOME/eari-sync-server.log" 2>&1 &
sleep 3
echo "--- health ---"
curl -s http://127.0.0.1:8443/health || echo "health check failed"
echo ""
echo "SETUP DONE"
