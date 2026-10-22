# eari-sync

Self-hosted, real-time-ish Obsidian sync. Server runs on an Android phone (Termux); clients are Obsidian plugins (Windows/Android/iPadOS). No external cloud.

## Status

M1 (scaffold + shared types) and M2 (server core) complete and tested. M3 (plugin) implemented and builds. M4 (integration/packaging) in progress.

## Layout

- `shared/` — protocol types
- `server/` — Termux Node.js server (Fastify + node:sqlite)
- `plugin/` — Obsidian plugin (TypeScript + esbuild)
- `docs/` — documentation
- `scripts/` — helpers

## Quick setup (for everyone)

### Server (Android/Termux) — one command
```bash
pkg install -y git
git clone <repo-url> $HOME/eari-sync
cd $HOME/eari-sync
bash scripts/setup-termux.sh
```
Then start: `node server/dist/main.js` (keep awake with `termux-wake-lock`).

### Plugin (Windows/macOS/Linux)
```powershell
# from repo root, after build:
.\scripts\install-plugin.ps1 -VaultPath "C:\path\to\your\vault"
```
Or run `scripts/build-release.ps1` and extract `release/eari-sync-plugin.zip` into `<vault>/.obsidian/plugins/eari-sync/`.

### Configure
In Obsidian plugin settings: Server URL (`https://your-ddns:8443`), Vault ID, Vault Secret (from `init` output). Press "Test connection".

## Quick start (server, dev)

```bash
npm install
npm run build -w shared
npm run build -w server
node server/dist/cli.js init --vault myvault
node server/dist/cli.js doctor
node server/dist/main.js
```

Server listens on 0.0.0.0:8443 by default (HTTP unless TLS cert configured).

## HTTPS

Set `EARI_SYNC_CERT`, `EARI_SYNC_KEY` (and optionally `EARI_SYNC_CA`) env vars, or `certPath`/`keyPath` in `~/eari-sync-data/config/server.json`. See `docs/https-setup.md`.

## Plugin build

```bash
cd plugin
npm install
node esbuild.config.mjs production
# produces main.js, manifest.json, styles.css
```

Install into Obsidian vault's `.obsidian/plugins/eari-sync/`.

## Tests

```bash
npm run test -w server
```

## Docs

- `docs/roadmap.md`
- `docs/https-setup.md`
- `docs/termux-install.md`
- `docs/troubleshooting.md`
- `docs/security.md`
