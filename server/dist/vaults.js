import { hashSecret, verifySecret } from "./auth.js";
import { mkdirSync, existsSync } from "node:fs";
import { vaultFilesDir, vaultStagingDir, vaultTrashDir } from "./config.js";
export function createVault(db, dataDir, id, secret) {
    const now = Date.now();
    db.transaction(() => {
        db.db.prepare("INSERT INTO vaults(id, secret_hash, created_at, settings_json) VALUES (?,?,?,?)")
            .run(id, hashSecret(secret), now, "{}");
        db.db.prepare("INSERT INTO vault_counters(vault_id, seq) VALUES (?,0)").run(id);
    });
    for (const d of [vaultFilesDir(dataDir, id), vaultStagingDir(dataDir, id), vaultTrashDir(dataDir, id)]) {
        if (!existsSync(d))
            mkdirSync(d, { recursive: true });
    }
    return { id, secret };
}
export function getVault(db, id) {
    return db.db.prepare("SELECT * FROM vaults WHERE id = ?").get(id);
}
export function verifyVault(db, id, secret) {
    const v = getVault(db, id);
    if (!v)
        return false;
    return verifySecret(secret, v.secret_hash);
}
export function rotateSecret(db, id, newSecret) {
    const v = getVault(db, id);
    if (!v)
        throw new Error("vault not found");
    db.db.prepare("UPDATE vaults SET secret_hash = ? WHERE id = ?").run(hashSecret(newSecret), id);
}
export function deleteVault(db, id) {
    db.transaction(() => {
        db.db.prepare("DELETE FROM trash WHERE vault_id = ?").run(id);
        db.db.prepare("DELETE FROM changes WHERE vault_id = ?").run(id);
        db.db.prepare("DELETE FROM files WHERE vault_id = ?").run(id);
        db.db.prepare("DELETE FROM vault_counters WHERE vault_id = ?").run(id);
        db.db.prepare("DELETE FROM vaults WHERE id = ?").run(id);
    });
}
export function listVaults(db) {
    const rows = db.db.prepare("SELECT id FROM vaults").all();
    return rows.map((r) => r.id);
}
export function getSeq(db, vaultId) {
    const row = db.db.prepare("SELECT seq FROM vault_counters WHERE vault_id = ?").get(vaultId);
    return row ? row.seq : 0;
}
export function incrementSeq(db, vaultId) {
    db.db.prepare("UPDATE vault_counters SET seq = seq + 1 WHERE vault_id = ?").run(vaultId);
    return getSeq(db, vaultId);
}
export function getVaultSettings(db, vaultId) {
    const v = getVault(db, vaultId);
    if (!v)
        return {};
    try {
        return JSON.parse(v.settings_json);
    }
    catch {
        return {};
    }
}
export function setVaultSettings(db, vaultId, settings) {
    db.db.prepare("UPDATE vaults SET settings_json = ? WHERE id = ?").run(JSON.stringify(settings), vaultId);
}
