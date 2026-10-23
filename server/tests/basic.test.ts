import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureDataDirs, loadConfig } from "../src/config.js";
import { openDb } from "../src/db.js";
import { buildServer } from "../src/index.js";
import { createVault } from "../src/vaults.js";
import { generateSecret } from "../src/auth.js";
import type { FastifyInstance } from "fastify";

let dataDir: string;
let app: FastifyInstance;
let db: any;
let secret: string;
const VAULT = "v1";

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "eari-"));
  ensureDataDirs(dataDir);
  db = openDb(dataDir);
  secret = generateSecret(16);
  createVault(db, dataDir, VAULT, secret);
  const cfg = loadConfig(dataDir);
  cfg.port = 0;
  cfg.logLevel = "warn";
  app = await buildServer(cfg, db);
  await app.ready();
});

afterAll(async () => {
  await app.close();
  try { db.close(); } catch {}
  // retry rmSync for windows locks
  for (let i = 0; i < 5; i++) {
    try { rmSync(dataDir, { recursive: true, force: true }); break; } catch { await new Promise((r) => setTimeout(r, 200)); }
  }
});

function hdr(extra: Record<string, string> = {}): Record<string, string> {
  return { authorization: `Bearer ${secret}`, "x-vault-id": VAULT, "x-client-id": "c1", ...extra };
}

describe("auth", () => {
  it("rejects bad secret", async () => {
    const res = await app.inject({ method: "GET", url: `/api/v1/vaults/${VAULT}/meta`, headers: { authorization: "Bearer nope", "x-client-id": "c1" } });
    expect(res.statusCode).toBe(401);
  });
  it("accepts good secret", async () => {
    const res = await app.inject({ method: "GET", url: `/api/v1/vaults/${VAULT}/meta`, headers: hdr() });
    expect(res.statusCode).toBe(200);
    expect(res.json().seq).toBe(0);
  });
});

describe("files", () => {
  it("uploads and downloads", async () => {
    const data = Buffer.from("hello 한글");
    const up = await app.inject({
      method: "PUT",
      url: `/api/v1/vaults/${VAULT}/files/a/b.md`,
      headers: { ...hdr({ "x-base-version": "0", "x-mtime": String(Date.now()), "content-type": "application/octet-stream" }) },
      payload: data,
    });
    expect(up.statusCode).toBe(200);
    const j = up.json();
    expect(j.version).toBe(1);
    const dl = await app.inject({ method: "GET", url: `/api/v1/vaults/${VAULT}/files/a/b.md`, headers: hdr() });
    expect(dl.statusCode).toBe(200);
    expect(dl.body).toBe("hello 한글");
  });

  it("conflict on version mismatch", async () => {
    const data = Buffer.from("v2 content");
    const up = await app.inject({
      method: "PUT",
      url: `/api/v1/vaults/${VAULT}/files/a/b.md`,
      headers: { ...hdr({ "x-base-version": "1", "x-mtime": String(Date.now()), "content-type": "application/octet-stream" }), "x-hash": "" },
      payload: Buffer.from("different"),
    });
    // base version 1 matches server version 1? server now version1, so base=1 ok -> update to v2
    expect(up.statusCode).toBe(200);
    // now mismatch
    const up2 = await app.inject({
      method: "PUT",
      url: `/api/v1/vaults/${VAULT}/files/a/b.md`,
      headers: { ...hdr({ "x-base-version": "1", "x-mtime": String(Date.now()), "content-type": "application/octet-stream" }) },
      payload: Buffer.from("conflict"),
    });
    expect(up2.statusCode).toBe(409);
  });

  it("changes listed", async () => {
    const res = await app.inject({ method: "GET", url: `/api/v1/vaults/${VAULT}/changes?since=0`, headers: hdr() });
    expect(res.statusCode).toBe(200);
    expect(res.json().changes.length).toBeGreaterThan(0);
  });

  it("delete moves to trash", async () => {
    const del = await app.inject({ method: "DELETE", url: `/api/v1/vaults/${VAULT}/files/a/b.md`, headers: hdr() });
    expect(del.statusCode).toBe(200);
    const tr = await app.inject({ method: "GET", url: `/api/v1/vaults/${VAULT}/trash`, headers: hdr() });
    expect(tr.json().length).toBe(1);
  });
});

describe("path safety", () => {
  it("rejects traversal", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/vaults/${VAULT}/files/../etc/passwd`,
      headers: { ...hdr({ "x-base-version": "0", "content-type": "application/octet-stream" }) },
      payload: Buffer.from("x"),
    });
    expect([400, 404]).toContain(res.statusCode);
  });
});

describe("deletion propagation", () => {
  it("refuses stale re-upload of deleted file (no resurrection)", async () => {
    const up = await app.inject({
      method: "PUT",
      url: `/api/v1/vaults/${VAULT}/files/d/del.md`,
      headers: { ...hdr({ "x-base-version": "0", "x-mtime": String(Date.now()), "content-type": "application/octet-stream" }) },
      payload: Buffer.from("original"),
    });
    expect(up.statusCode).toBe(200);
    const del = await app.inject({ method: "DELETE", url: `/api/v1/vaults/${VAULT}/files/d/del.md`, headers: hdr() });
    expect(del.statusCode).toBe(200);
    // stale client pushes old content without having seen the delete
    const stale = await app.inject({
      method: "PUT",
      url: `/api/v1/vaults/${VAULT}/files/d/del.md`,
      headers: { ...hdr({ "x-base-version": "1", "x-mtime": String(Date.now()), "content-type": "application/octet-stream" }) },
      payload: Buffer.from("original"),
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().deleted).toBe(true);
    // client that saw the delete may intentionally recreate
    const recreate = await app.inject({
      method: "PUT",
      url: `/api/v1/vaults/${VAULT}/files/d/del.md`,
      headers: { ...hdr({ "x-base-version": "0", "x-seen-delete-version": "2", "x-mtime": String(Date.now()), "content-type": "application/octet-stream" }) },
      payload: Buffer.from("recreated"),
    });
    expect(recreate.statusCode).toBe(200);
    expect(recreate.json().version).toBe(3);
  });
});
