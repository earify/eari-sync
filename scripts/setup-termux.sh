#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

echo "=== eari-sync Termux setup ==="

# 1. packages
pkg update -y
pkg install -y nodejs git

# 2. code
if [ ! -d "$HOME/eari-sync" ]; then
  read -rp "Git repo URL (or leave empty to use current dir): " REPO
  if [ -n "$REPO" ]; then
    git clone "$REPO" "$HOME/eari-sync"
  else
    echo "Please place the project in $HOME/eari-sync"; exit 1
  fi
fi
cd "$HOME/eari-sync"

# 3. deps + build
npm install
npm run build -w shared
npm run build -w server

# 4. init if needed
if [ ! -f "$HOME/eari-sync-data/config/server.json" ]; then
  read -rp "Vault ID [default]: " VID
  VID=${VID:-default}
  node server/dist/cli.js init --vault "$VID"
fi

echo ""
echo "=== Setup complete ==="
echo "Start server:  node server/dist/main.js"
echo "Doctor:        node server/dist/cli.js doctor"
echo "Backup:        node server/dist/cli.js backup"
echo ""
echo "Keep Termux awake: termux-wake-lock"
