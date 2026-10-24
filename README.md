# eari-sync

Sync your Obsidian vault across devices in near real time — using **your own server**.

No cloud storage, no tunnels, no third-party backend. The companion server runs on an Android
phone (Termux) and keeps everything on hardware you own:
**[earify/eari-sync-server](https://github.com/earify/eari-sync-server)**.

---

## Features

- **Automatic sync** while Obsidian is open — file events plus WebSocket change notifications
- **Incremental transfer** — SHA-256 hashing means only changed files move
- **Conflicts are never silent** — both sides are kept as `name.conflict-<device>-<timestamp>`
- **Deletions propagate** and stay recoverable in the vault's trash folder
- **Settings sync (optional)** — pick exactly which files/folders inside the configuration folder
  (theme, hotkeys, snippets, plugins, …) should sync; workspace files stay device-local
- **Efficient by design** — debounced uploads, throttled state writes, keep-alive WebSocket,
  tombstone pruning, and a configurable maximum file size
- Works on **Windows, macOS, Linux, Android and iOS/iPadOS**

---

## Installation

### From the community directory

Settings → **Community plugins** → Browse → search for **eari-sync** → Install → Enable.

### Manual

1. Download `main.js`, `manifest.json` and `styles.css` from the
   [latest release](https://github.com/earify/eari-sync/releases).
2. Put them in `<your vault>/.obsidian/plugins/eari-sync/`.
3. Reload Obsidian and enable **eari-sync** in Settings → Community plugins.

---

## Configuration

Set up the server first (see the [server README](https://github.com/earify/eari-sync-server)),
then enter three values in the plugin settings:

| Field | Example | Notes |
| --- | --- | --- |
| **Server URL** | `https://sync.example.com:8443` | Your server's HTTPS address |
| **Vault ID** | `notes` | Created on the server with `cli.js init` |
| **Vault secret** | `…` | Printed once by `init` — store it safely |

Press **Test connection**, then **Sync now**.

### Settings overview

| Setting | Description |
| --- | --- |
| Auto sync | Sync while Obsidian is open |
| Sync mode | Fast / Balanced / Saver — how aggressively changes are pushed |
| Max file size (MB) | Larger files are skipped to protect device memory |
| Sync configuration folder | Opt-in; pick items individually (folders can be expanded) |
| Extra exclude patterns | Optional glob patterns, one per line |
| Debug logging | Detailed logs in the developer console |

---

## Commands

Available from the command palette:

- `eari-sync: Sync now`
- `eari-sync: Test connection`
- `eari-sync: Show sync status`
- `eari-sync: Retry failed items`

The status bar shows the current state (`connected`, `syncing`, `synced (↓n ↑m)`, `offline`,
`conflict`, `auth error`, `error`). Click it for details.

---

## How sync works

1. File changes are debounced and pushed to the server with a base version.
2. The server keeps a per-vault change log; clients pull everything after their last seen sequence.
3. Identical content is detected by hash and never re-uploaded.
4. If a file changed on two devices, the server rejects the stale upload and the client keeps both
   versions (conflict copy + server version).
5. Deletions are soft deletes on the server and are applied locally by moving the file to trash.

## Notes and limitations

- Sync runs **only while Obsidian is open** — mobile background execution is not attempted.
  Changes made while offline are pushed the next time Obsidian starts.
- File contents are protected in transit by HTTPS. At-rest encryption depends on your device.
- Very large attachments (above the configured limit) are skipped rather than synced.

## Development

```bash
npm install
npm run dev      # watch build → main.js
npm run build    # production build
npm run lint     # official Obsidian plugin review rules
```

## License

MIT
