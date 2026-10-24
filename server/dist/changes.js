import { getSeq, incrementSeq } from "./vaults.js";
export function recordChange(db, vaultId, change) {
    const seq = incrementSeq(db, vaultId);
    const createdAt = change.createdAt ?? Date.now();
    const c = {
        seq,
        path: change.path,
        op: change.op,
        size: change.size,
        mtime: change.mtime,
        hash: change.hash,
        version: change.version,
        fromPath: change.fromPath,
        clientId: change.clientId,
        createdAt,
    };
    db.db.prepare(`INSERT INTO changes(vault_id,seq,path,op,size,mtime,hash,version,from_path,client_id,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(vaultId, seq, c.path, c.op, c.size ?? null, c.mtime ?? null, c.hash ?? null, c.version, c.fromPath ?? null, c.clientId ?? null, createdAt);
    return c;
}
export function listChangesSince(db, vaultId, since, limit = 500) {
    const rows = db.db.prepare(`SELECT * FROM changes WHERE vault_id = ? AND seq > ? ORDER BY seq ASC LIMIT ?`).all(vaultId, since, limit + 1);
    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    const changes = slice.map((r) => ({
        seq: r.seq,
        path: r.path,
        op: r.op,
        size: r.size ?? undefined,
        mtime: r.mtime ?? undefined,
        hash: r.hash ?? undefined,
        version: r.version,
        fromPath: r.from_path ?? undefined,
        clientId: r.client_id ?? undefined,
        createdAt: r.created_at,
    }));
    const currentSeq = getSeq(db, vaultId);
    return { changes, currentSeq, hasMore };
}
export function getFileRow(db, vaultId, path) {
    return db.db.prepare("SELECT * FROM files WHERE vault_id = ? AND path = ?").get(vaultId, path);
}
export function upsertFileRow(db, vaultId, path, meta) {
    const now = Date.now();
    db.db.prepare(`INSERT INTO files(vault_id,path,size,mtime,hash,version,deleted,updated_at,updated_by)
     VALUES (?,?,?,?,?,?,?,?,?)
     ON CONFLICT(vault_id,path) DO UPDATE SET
       size=excluded.size, mtime=excluded.mtime, hash=excluded.hash,
       version=excluded.version, deleted=excluded.deleted, updated_at=excluded.updated_at,
       updated_by=excluded.updated_by`).run(vaultId, path, meta.size, meta.mtime, meta.hash, meta.version, meta.deleted ? 1 : 0, now, meta.updatedBy ?? null);
}
export function markDeleted(db, vaultId, path, version, updatedBy) {
    db.db.prepare(`UPDATE files SET deleted=1, version=?, updated_at=?, updated_by=? WHERE vault_id=? AND path=?`).run(version, Date.now(), updatedBy ?? null, vaultId, path);
}
export function removeFileRow(db, vaultId, path) {
    db.db.prepare("DELETE FROM files WHERE vault_id = ? AND path = ?").run(vaultId, path);
}
