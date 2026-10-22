# Troubleshooting

## Cannot connect from client
- Verify server running: `curl http://<phone-lan-ip>:8443/health`.
- Check DDNS resolves to public IP.
- Check port forwarding on router: 8443 -> phone:8443.
- Check Android firewall / Termux not killed by battery optimization.
- Run `npm run doctor`.

## NAT loopback fails
- Access DDNS URL from inside LAN. If fails but external works, router lacks hairpin NAT. See https-setup.md.

## Auth errors
- Verify Vault ID and Secret exactly (no trailing spaces).
- Rotate secret via re-running init with --secret, then update clients.

## Sync not starting in Obsidian
- Ensure plugin enabled and settings configured.
- Check Obsidian console for errors.
- Obsidian must be in foreground (mobile).

## Large vault slow
- Use "saver" mode, increase debounce, exclude caches.

## Database corruption
- Run doctor (integrity check). Restore from backup.
