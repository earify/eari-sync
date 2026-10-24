# eari-sync (Obsidian plugin)

Self-hosted, near-real-time sync for Obsidian vaults — Windows, Android and iPadOS.

The plugin talks to **your own server** (no cloud, no tunnels, no third-party backend):

- Server: [earify/eari-sync-server](https://github.com/earify/eari-sync-server) — runs in Termux on an Android phone.

## Features

- Auto sync while Obsidian is open (file events + WebSocket change notifications)
- Incremental, hash-based transfer (only changed files move)
- Conflict copies instead of silent overwrites (`name.conflict-<device>-<time>`)
- Deletions propagate and stay recoverable in the vault's trash folder
- Optional settings-folder sync with per-item selection (theme, hotkeys, plugins, snippets, …)
- Per-device trash/workspace files are always excluded
- Sync modes (fast / balanced / saver), exclude patterns, max file size

## Setup

1. Install and start the server — see the [server repository](https://github.com/earify/eari-sync-server).
2. In Obsidian: **Settings → Community plugins → eari-sync** (or install manually from a release).
3. Enter three values:
   - **Server URL** — e.g. `https://sync.example.com:8443`
   - **Vault ID**
   - **Vault secret**
4. Press **Test connection**, then **Sync now**.

## Manual install

Copy `main.js`, `manifest.json`, `styles.css` from a release into:

```
<your vault>/.obsidian/plugins/eari-sync/
```

Then enable the plugin in Obsidian.

## Commands

- `eari-sync: Sync now`
- `eari-sync: Test connection`
- `eari-sync: Show sync status`
- `eari-sync: Retry failed items`

## Development

```bash
cd plugin
npm install
npm run dev      # watch build
npm run build    # production build -> plugin/main.js
npx eslint src   # official Obsidian review rules
```

## License

MIT
