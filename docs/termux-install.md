# Termux Server Install

## Prerequisites
- Android phone with Termux installed (from F-Droid, not Play Store).
- Storage permission: `termux-setup-storage`.

## Install
```bash
pkg update && pkg upgrade
pkg install nodejs git
# optional for Let's Encrypt:
# pkg install tur-repo && pkg install certbot

git clone <your-repo> ~/eari-sync
cd ~/eari-sync
npm install
npm run build -w shared
npm run build -w server
```

## Initialize
```bash
node server/dist/cli.js init --vault myvault
# save the printed secret
node server/dist/cli.js doctor
```

## Run
```bash
node server/dist/main.js
```
For persistence, use `termux-wake-lock` and disable battery optimization for Termux. No external process manager.

## Keep running after reboot
Termux does not auto-start. Re-run `node server/dist/main.js`. Use Android's "restart Termux on boot" via Termux:Boot if desired (optional, local only).

## Backup
```bash
node server/dist/cli.js backup
node server/dist/cli.js restore --from ~/eari-sync-data/backups/backup-...
```
