import Fastify from "fastify";
import websocket from "@fastify/websocket";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { join } from "node:path";
import { createReadStream, existsSync, mkdirSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { defaultDataDir, ensureDataDirs, loadConfig, saveConfig, vaultFilesDir, vaultStagingDir, vaultTrashDir, dbPath } from "./config.js";
import { openDb } from "./db.js";
import { createVault, getVault, verifyVault, rotateSecret, getSeq, listVaults } from "./vaults.js";
import { recordChange, listChangesSince, getFileRow, upsertFileRow, markDeleted } from "./changes.js";
import { writeAtomic, readFileSyncSafe, sha256Buffer, sha256File, fileExists, deleteFilePhysical, moveFilePhysical, listAllFiles } from "./files.js";
import { safeRelativePath } from "./paths.js";
import { hashSecret, verifySecret, generateSecret, generateVaultId } from "./auth.js";
import type { Db } from "./db.js";
import type { RuntimeConfig } from "./config.js";

const WS_CLIENTS = new Map<string, Set<any>>();

function broadcast(vaultId: string, seq: number): void {
  const set = WS_CLIENTS.get(vaultId);
  if (!set) return;
  const msg = JSON.stringify({ type: "change", vaultId, seq });
  for (const ws of set) {
    try { ws.send(msg); } catch {}
  }
}

async function authVault(db: Db, vaultId: string, secret: string): Promise<boolean> {
  return verifyVault(db, vaultId, secret);
}

function getSecret(req: any): string {
  const h = req.headers["authorization"] || "";
  const m = String(h).match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

export async function buildServer(cfg: RuntimeConfig, db: Db) {
  const app = Fastify({ logger: { level: cfg.logLevel }, bodyLimit: 1024 * 1024 * 1024 });

  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
  await app.register(websocket);
  await app.register(multipart, { limits: { fileSize: 1024 * 1024 * 1024 } });

  // raw body parser for octet-stream
  app.addContentTypeParser("application/octet-stream", { parseAs: "buffer" }, (_req, body, done) => {
    done(null, body);
  });

  // health
  app.get("/health", async () => ({ ok: true, time: Date.now() }));

  // auth test — stricter rate limit (brute-force protection)
  app.post("/api/v1/auth/test", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const vaultId = (req.headers["x-vault-id"] as string) || (req.body as any)?.vaultId;
    const secret = getSecret(req) || (req.body as any)?.secret;
    const clientId = req.headers["x-client-id"] as string;
    if (!vaultId || !secret) return reply.code(400).send({ error: "missing vaultId/secret" });
    const ok = await authVault(db, vaultId, secret);
    if (!ok) return reply.code(401).send({ error: "unauthorized" });
    return reply.code(204).send();
  });

  // vault meta
  app.get("/api/v1/vaults/:vaultId/meta", async (req, reply) => {
    const { vaultId } = req.params as any;
    const secret = getSecret(req);
    if (!(await authVault(db, vaultId, secret))) return reply.code(401).send({ error: "unauthorized" });
    const files = db.db.prepare("SELECT COUNT(*) as c FROM files WHERE vault_id=? AND deleted=0").get(vaultId) as any;
    const trash = db.db.prepare("SELECT COUNT(*) as c FROM trash WHERE vault_id=?").get(vaultId) as any;
    return { vaultId, seq: getSeq(db, vaultId), fileCount: files?.c ?? 0, trashCount: trash?.c ?? 0 };
  });

  // changes
  app.get("/api/v1/vaults/:vaultId/changes", async (req, reply) => {
    const { vaultId } = req.params as any;
    const secret = getSecret(req);
    if (!(await authVault(db, vaultId, secret))) return reply.code(401).send({ error: "unauthorized" });
    const q = req.query as any;
    const since = Number(q.since ?? 0);
    const limit = Math.min(Number(q.limit ?? 500), 2000);
    const res = listChangesSince(db, vaultId, since, limit);
    return { changes: res.changes, nextSeq: res.changes.length ? res.changes[res.changes.length - 1].seq : since, hasMore: res.hasMore, currentSeq: res.currentSeq };
  });

  // download file
  app.get("/api/v1/vaults/:vaultId/files/*", async (req, reply) => {
    const { vaultId } = req.params as any;
    const secret = getSecret(req);
    if (!(await authVault(db, vaultId, secret))) return reply.code(401).send({ error: "unauthorized" });
    const rel = (req.params as any)["*"];
    let path: string;
    try { path = safeRelativePath(rel); } catch (e: any) { return reply.code(400).send({ error: e.message }); }
    const vdir = vaultFilesDir(cfg.dataDir, vaultId);
    if (!fileExists(vdir, path)) return reply.code(404).send({ error: "not found" });
    const row = getFileRow(db, vaultId, path);
    const full = join(vdir, path);
    reply.header("X-Hash", row?.hash ?? "");
    reply.header("X-Version", String(row?.version ?? 0));
    reply.header("X-Mtime", String(row?.mtime ?? 0));
    reply.header("X-Size", String(row?.size ?? 0));
    reply.type("application/octet-stream");
    return reply.send(createReadStream(full));
  });

  // upload file
  app.put("/api/v1/vaults/:vaultId/files/*", async (req, reply) => {
    const { vaultId } = req.params as any;
    const secret = getSecret(req);
    if (!(await authVault(db, vaultId, secret))) return reply.code(401).send({ error: "unauthorized" });
    const rel = (req.params as any)["*"];
    let path: string;
    try { path = safeRelativePath(rel); } catch (e: any) { return reply.code(400).send({ error: e.message }); }
    const baseVersion = Number(req.headers["x-base-version"] ?? 0);
    const mtime = Number(req.headers["x-mtime"] ?? Date.now());
    const clientHash = (req.headers["x-hash"] as string) || "";
    const clientId = (req.headers["x-client-id"] as string) || "";

    const vdir = vaultFilesDir(cfg.dataDir, vaultId);
    const existing = getFileRow(db, vaultId, path);

    // conflict check
    if (existing && existing.deleted === 0 && baseVersion && existing.version !== baseVersion) {
      // if content identical -> idempotent
      const bodyBuf = req.body as Buffer;
      const h = sha256Buffer(bodyBuf);
      if (h !== existing.hash) {
        return reply.code(409).send({
          error: "conflict",
          path,
          serverVersion: existing.version,
          serverHash: existing.hash,
          serverSize: existing.size,
          serverMtime: existing.mtime,
          clientVersion: baseVersion,
        } satisfies any);
      }
    }

    const bodyBuf = req.body as Buffer;
    if (!Buffer.isBuffer(bodyBuf)) return reply.code(400).send({ error: "expected binary body" });
    const hash = clientHash || sha256Buffer(bodyBuf);
    // verify hash matches if client provided
    if (clientHash && clientHash !== sha256Buffer(bodyBuf)) {
      return reply.code(400).send({ error: "hash mismatch" });
    }

    const newVersion = (existing?.version ?? 0) + 1;
    const res = await writeAtomic(vdir, path, bodyBuf, mtime);

    db.transaction(() => {
      upsertFileRow(db, vaultId, path, {
        size: res.size,
        mtime,
        hash: res.hash,
        version: newVersion,
        updatedBy: clientId,
        deleted: false,
      });
      const op: "create" | "modify" = existing && existing.deleted === 0 ? "modify" : "create";
      recordChange(db, vaultId, {
        path,
        op,
        size: res.size,
        mtime,
        hash: res.hash,
        version: newVersion,
        clientId,
      });
    });

    const seq = getSeq(db, vaultId);
    broadcast(vaultId, seq);
    return { path, version: newVersion, seq, status: existing ? "updated" : "created" };
  });

  // delete file
  app.delete("/api/v1/vaults/:vaultId/files/*", async (req, reply) => {
    const { vaultId } = req.params as any;
    const secret = getSecret(req);
    if (!(await authVault(db, vaultId, secret))) return reply.code(401).send({ error: "unauthorized" });
    const rel = (req.params as any)["*"];
    let path: string;
    try { path = safeRelativePath(rel); } catch (e: any) { return reply.code(400).send({ error: e.message }); }
    const baseVersion = Number((req.query as any).baseVersion ?? 0);
    const clientId = (req.headers["x-client-id"] as string) || "";
    const existing = getFileRow(db, vaultId, path);
    if (!existing) return reply.code(404).send({ error: "not found" });
    if (existing.deleted === 1) return reply.code(204).send();

    const vdir = vaultFilesDir(cfg.dataDir, vaultId);
    const tdir = vaultTrashDir(cfg.dataDir, vaultId);
    // move to trash
    const trashName = `${Date.now()}-${path.replace(/\//g, "_")}`;
    const trashPath = join(tdir, trashName);
    if (!existsSync(tdir)) mkdirSync(tdir, { recursive: true });
    if (fileExists(vdir, path)) {
      const { renameSync } = await import("node:fs");
      const src = join(vdir, path);
      // ensure parent
      const { dirname: dn, join: jn } = await import("node:path");
      const { mkdirSync: ms } = await import("node:fs");
      ms(dn(trashPath), { recursive: true });
      renameSync(src, trashPath);
    }
    const newVersion = existing.version + 1;
    const now = Date.now();
    const retentionDays = 30;
    db.transaction(() => {
      markDeleted(db, vaultId, path, newVersion, clientId);
      // record trash
      db.db.prepare(
        `INSERT INTO trash(vault_id,path,version,size,hash,deleted_at,trash_path,expires_at) VALUES (?,?,?,?,?,?,?,?)`,
      ).run(vaultId, path, newVersion, existing.size, existing.hash, now, trashPath, now + retentionDays * 86400000);
      recordChange(db, vaultId, {
        path,
        op: "delete",
        size: existing.size,
        mtime: existing.mtime,
        hash: existing.hash,
        version: newVersion,
        clientId,
      });
    });
    const seq = getSeq(db, vaultId);
    broadcast(vaultId, seq);
    return { path, version: newVersion, seq };
  });

  // move
  app.post("/api/v1/vaults/:vaultId/move", async (req, reply) => {
    const { vaultId } = req.params as any;
    const secret = getSecret(req);
    if (!(await authVault(db, vaultId, secret))) return reply.code(401).send({ error: "unauthorized" });
    const body = req.body as any;
    const from = safeRelativePath(body.from);
    const to = safeRelativePath(body.to);
    const baseVersion = Number(body.baseVersion ?? 0);
    const clientId = (req.headers["x-client-id"] as string) || "";
    const existing = getFileRow(db, vaultId, from);
    if (!existing) return reply.code(404).send({ error: "not found" });
    if (getFileRow(db, vaultId, to)) return reply.code(409).send({ error: "destination exists" });
    const vdir = vaultFilesDir(cfg.dataDir, vaultId);
    moveFilePhysical(vdir, from, to);
    const newVersion = existing.version + 1;
    db.transaction(() => {
      // remove old row, add new
      db.db.prepare("DELETE FROM files WHERE vault_id=? AND path=?").run(vaultId, from);
      upsertFileRow(db, vaultId, to, {
        size: existing.size,
        mtime: existing.mtime,
        hash: existing.hash,
        version: newVersion,
        updatedBy: clientId,
        deleted: false,
      });
      recordChange(db, vaultId, {
        path: to,
        op: "move",
        size: existing.size,
        mtime: existing.mtime,
        hash: existing.hash,
        version: newVersion,
        fromPath: from,
        clientId,
      });
      // also record delete of old? move covers it; clients handle move op
    });
    const seq = getSeq(db, vaultId);
    broadcast(vaultId, seq);
    return { from, to, version: newVersion, seq };
  });

  // trash list
  app.get("/api/v1/vaults/:vaultId/trash", async (req, reply) => {
    const { vaultId } = req.params as any;
    const secret = getSecret(req);
    if (!(await authVault(db, vaultId, secret))) return reply.code(401).send({ error: "unauthorized" });
    const rows = db.db.prepare("SELECT * FROM trash WHERE vault_id=? ORDER BY deleted_at DESC").all(vaultId) as any[];
    return rows.map((r) => ({
      path: r.path, version: r.version, size: r.size, hash: r.hash,
      deletedAt: r.deleted_at, expiresAt: r.expires_at,
    }));
  });

  // restore
  app.post("/api/v1/vaults/:vaultId/trash/restore", async (req, reply) => {
    const { vaultId } = req.params as any;
    const secret = getSecret(req);
    if (!(await authVault(db, vaultId, secret))) return reply.code(401).send({ error: "unauthorized" });
    const body = req.body as any;
    const path = safeRelativePath(body.path);
    const row = db.db.prepare("SELECT * FROM trash WHERE vault_id=? AND path=? ORDER BY deleted_at DESC LIMIT 1").get(vaultId, path) as any;
    if (!row) return reply.code(404).send({ error: "not in trash" });
    const vdir = vaultFilesDir(cfg.dataDir, vaultId);
    const { renameSync, mkdirSync: ms } = await import("node:fs");
    const { dirname: dn } = await import("node:path");
    ms(dn(join(vdir, path)), { recursive: true });
    renameSync(row.trash_path, join(vdir, path));
    const newVersion = row.version + 1;
    db.transaction(() => {
      upsertFileRow(db, vaultId, path, {
        size: row.size, mtime: Date.now(), hash: row.hash, version: newVersion, deleted: false,
      });
      db.db.prepare("DELETE FROM trash WHERE vault_id=? AND path=? AND deleted_at=?").run(vaultId, path, row.deleted_at);
      recordChange(db, vaultId, { path, op: "create", size: row.size, mtime: Date.now(), hash: row.hash, version: newVersion, clientId: (req.headers["x-client-id"] as string) || "" });
    });
    const seq = getSeq(db, vaultId);
    broadcast(vaultId, seq);
    return { path, version: newVersion, seq };
  });

  // WebSocket
  app.register(async (fastify) => {
    fastify.get("/api/v1/vaults/:vaultId/ws", { websocket: true }, (socket, req) => {
      const { vaultId } = req.params as any;
      const token = (req.query as any).token || getSecret(req);
      const ok = verifyVault(db, vaultId, token);
      if (!ok) {
        try { socket.send(JSON.stringify({ type: "auth_fail" })); } catch {}
        socket.close();
        return;
      }
      if (!WS_CLIENTS.has(vaultId)) WS_CLIENTS.set(vaultId, new Set());
      WS_CLIENTS.get(vaultId)!.add(socket);
      socket.send(JSON.stringify({ type: "auth_ok", vaultId, seq: getSeq(db, vaultId) }));
      socket.on("message", (raw: any) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === "ping") socket.send(JSON.stringify({ type: "pong" }));
        } catch {}
      });
      socket.on("close", () => {
        WS_CLIENTS.get(vaultId)?.delete(socket);
      });
    });
  });

  return app;
}

// CLI entry point handled in cli.ts; this file exports for testing
export { defaultDataDir, ensureDataDirs, loadConfig, openDb };
