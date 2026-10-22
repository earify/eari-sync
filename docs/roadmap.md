# eari-sync Roadmap

See full spec in project prompt. Phases:

## M1 — Design & Scaffold
- [x] Monorepo scaffold (shared/server/plugin)
- [x] Shared protocol types
- [x] Architecture/protocol/db/auth docs

## M2 — Server core (Termux)
- [ ] init/auth/vault
- [ ] file CRUD + streaming + path safety
- [ ] change log (seq) + pull/push
- [ ] WebSocket notifications
- [ ] conflict handling
- [ ] trash + restore
- [ ] backup/restore + doctor
- [ ] HTTPS (Let's Encrypt + self-signed)
- [ ] tests

## M3 — Plugin
- [ ] settings UI + connection test
- [ ] initial + incremental sync
- [ ] file watcher + debounce + stabilization
- [ ] WebSocket client + reconnect
- [ ] conflict copy
- [ ] status bar + commands
- [ ] tests (pure logic)

## M4 — Integration & packaging
- [ ] E2E on Windows (2 clients)
- [ ] Termux install scripts
- [ ] docs + release artifacts

## Key decisions
- DB: node:sqlite (zero native deps, Node 22.5+)
- HTTP: Fastify + @fastify/websocket
- HTTPS: Let's Encrypt HTTP-01 (primary) / self-signed CA (fallback)
- Auth: scrypt-hashed Vault Secret, per-request verify
- Change tracking: per-vault monotonic seq + per-file version
- Conflict: `<name>.conflict-<deviceId>-<ts>.<ext>`
- Path safety: POSIX normalize, reject traversal/symlinks
- Client file access: Obsidian Vault API only (mobile-safe)
