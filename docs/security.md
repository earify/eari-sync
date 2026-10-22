# Security & Threat Model

## Assets
- Vault contents on phone storage.
- Vault Secret.

## Controls
- HTTPS transport (TLS verification enforced, no bypass).
- Per-vault scrypt-hashed secret; per-request verification.
- Rate limiting on auth endpoints.
- Path traversal protection; symlink rejection; vault-dir containment.
- Soft delete with retention.
- No secret in logs.

## Threats
- Secret leakage via data.json on client: Obsidian SecretStorage used when available; document risk.
- Network MITM: mitigated by HTTPS + cert verification.
- Malicious file paths: rejected.
- Concurrent modification: conflict copies, no silent overwrite.
- Device loss: data at rest not encrypted by default; recommend OS-level encryption. E2E content encryption not in MVP.

## Limitations
- No E2E encryption of file contents in MVP (transport only).
- Case-sensitivity mismatch between server (Linux) and clients.
- Mobile background sync not supported (by design).
