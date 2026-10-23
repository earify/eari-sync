import type { Plugin, Vault, TFile } from "obsidian";
import { ApiClient, ConflictError, type RemoteChange } from "./api.js";
import type { EariSettings } from "./settings.js";
import { Watcher } from "./watcher.js";
import { isPathSynced, listFiles, listDirRecursive } from "./indexer.js";
import { computeMeta } from "./indexer.js";
import { conflictName } from "./conflict.js";
import { sha256ArrayBuffer } from "./hash.js";
import type { SyncStatus } from "./status.js";

export interface SyncEngineDeps {
  plugin: Plugin;
  vault: Vault;
  settings: EariSettings;
  saveSettings: () => Promise<void>;
  onStatus: (s: SyncStatus, detail?: string) => void;
  onProgress: (msg: string) => void;
}

export class SyncEngine {
  private api: ApiClient;
  private watcher: Watcher;
  private ws: WebSocket | null = null;
  private wsReconnectTimer: any = null;
  private wsAttempts = 0;
  private wsPullTimer: any = null;
  private syncing = false;
  private stopped = false;
  private chain: Promise<unknown> = Promise.resolve();
  private settings: EariSettings;
  private deps: SyncEngineDeps;

  constructor(deps: SyncEngineDeps) {
    this.deps = deps;
    this.settings = deps.settings;
    this.api = new ApiClient(this.settings);
    this.watcher = new Watcher(deps.vault, {
      onChanged: (paths) => { void this.enqueue(() => this.pushPaths(paths)); },
      onDeleted: (paths) => { void this.enqueue(() => this.pushDeletes(paths)); },
      onRenamed: (o, n) => { void this.enqueue(() => this.pushRename(o, n)); },
    }, this.debounceMs());
  }

  /** serialize all sync operations: watcher pushes never interleave with pulls */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(() => (this.stopped ? Promise.reject(new Error("stopped")) : fn()));
    this.chain = run.then(() => undefined, () => undefined);
    return run;
  }

  private debounceMs(): number {
    return this.settings.syncMode === "fast" ? 300 : this.settings.syncMode === "saver" ? 1500 : 800;
  }

  async start(): Promise<void> {
    if (!this.settings.deviceId) {
      this.settings.deviceId = crypto.randomUUID();
      await this.deps.saveSettings();
    }
    this.api.update(this.settings);
    this.watcher.start();
    if (this.settings.autoSync) {
      this.connectWs();
      // initial sync
      await this.syncNow();
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.watcher.stop(this.deps.vault);
    if (this.ws) { try { this.ws.close(); } catch {} this.ws = null; }
    if (this.wsReconnectTimer) { clearTimeout(this.wsReconnectTimer); this.wsReconnectTimer = null; }
    if (this.wsPullTimer) { clearTimeout(this.wsPullTimer); this.wsPullTimer = null; }
  }

  async syncNow(): Promise<void> {
    return this.enqueue(async () => {
      if (this.syncing) return;
      this.syncing = true;
      this.deps.onStatus("syncing");
      try {
        await this.pullChanges();
        await this.pushAll();
        await this.deps.saveSettings();
        this.deps.onStatus("done");
      } catch (e: any) {
        console.error("sync error", e);
        if (String(e?.message).includes("401") || String(e).includes("unauthorized")) {
          this.deps.onStatus("auth", e?.message);
        } else {
          this.deps.onStatus("error", e?.message);
        }
      } finally {
        this.syncing = false;
      }
    });
  }

  private connectWs(): void {
    this.ws = this.api.connectWs(
      (seq) => {
        // coalesce bursts of change notifications into one pull
        if (this.wsPullTimer) return;
        this.wsPullTimer = setTimeout(() => {
          this.wsPullTimer = null;
          if (this.stopped) return;
          void this.enqueue(() => this.pullChanges().catch((e) => console.error("ws pull", e)));
        }, 2000);
      },
      (s) => {
        if (s === "connected") this.deps.onStatus("connected");
        else if (s === "disconnected") this.scheduleWsReconnect();
        else if (s === "auth") this.deps.onStatus("auth");
      },
    );
  }

  private scheduleWsReconnect(): void {
    if (this.wsReconnectTimer) return;
    const delay = Math.min(30000, 1000 * Math.pow(2, this.wsAttempts)) + Math.random() * 500;
    this.wsAttempts++;
    this.wsReconnectTimer = setTimeout(() => {
      this.wsReconnectTimer = null;
      this.connectWs();
    }, delay);
  }

  private async pullChanges(): Promise<void> {
    // pull all since lastSeq
    let since = this.settings.lastSeq || 0;
    let hasMore = true;
    while (hasMore) {
      const res = await this.api.changes(since, 500);
      for (const c of res.changes) {
        await this.applyChange(c);
        since = c.seq;
      }
      hasMore = res.hasMore;
      this.settings.lastSeq = res.currentSeq;
      await this.deps.saveSettings();
    }
  }



  /** enumerate .obsidian contents (hidden folder is not in the vault index) */
  private async listObsidianFiles(): Promise<string[]> {
    if (!this.settings.syncObsidian) return [];
    const entries = await listDirRecursive(this.deps.vault, ".obsidian");
    return entries
      .filter((e) => !e.isFolder && isPathSynced(e.path, this.settings))
      .map((e) => e.path);
  }

  private async applyChange(c: RemoteChange): Promise<void> {
    const vault = this.deps.vault;
    const path = c.path;
    if (!isPathSynced(path, this.settings)) return;
    if (c.op === "delete") {
      if (path.startsWith(".obsidian/")) {
        // hidden folder: remove via adapter (no trash for dotfiles)
        try { await vault.adapter.remove(path); } catch {}
        delete this.settings.fileIndex[path];
        if (typeof c.version === "number") this.settings.deletedSeen[path] = c.version;
        return;
      }
      const f = vault.getAbstractFileByPath(path);
      if (f) {
        // move into in-vault .trash (which itself is synced) so deletions stay visible/recoverable
        this.watcher.markWritten(path);
        await vault.trash(f, false);
      }
      delete this.settings.fileIndex[path];
      if (typeof c.version === "number") {
        this.settings.deletedSeen[path] = c.version;
      }
      return;
    }
    if (c.op === "move" && c.fromPath) {
      const old = vault.getAbstractFileByPath(c.fromPath);
      if (old) {
        this.watcher.markWritten(c.fromPath);
        await vault.trash(old, false);
      }
      delete this.settings.fileIndex[c.fromPath];
      if (typeof c.version === "number") {
        this.settings.deletedSeen[c.fromPath] = c.version;
      }
    }
    // create/modify: download
    try {
      const { data, hash, version, mtime } = await this.api.download(path);
      this.watcher.markWritten(path);
      if (path.startsWith(".obsidian/")) {
        await ensureAdapterParents(vault, path);
        await vault.adapter.writeBinary(path, data);
      } else {
        const existing = vault.getAbstractFileByPath(path);
        if (existing) {
          await vault.modifyBinary(existing as TFile, data);
        } else {
          // ensure parent folders
          await ensureParents(vault, path);
          await vault.createBinary(path, data);
        }
      }
      this.settings.fileIndex[path] = { version, hash };
      delete this.settings.deletedSeen[path];
    } catch (e) {
      console.error("apply change failed", path, e);
    }
  }

  private async pushAll(): Promise<void> {
    const vault = this.deps.vault;
    const files = listFiles(vault, this.settings).filter((f) => !f.path.startsWith(".obsidian/"));
    const obsFiles = await this.listObsidianFiles();
    const localPaths = new Set<string>([...files.map((f) => f.path), ...obsFiles]);
    // push new/changed (indexed files)
    for (const f of files) {
      if (this.watcher.isRecentlyWritten(f.path)) continue;
      try {
        const meta = await computeMeta(vault, f);
        const idx = this.settings.fileIndex[f.path];
        if (idx && idx.hash === meta.hash) continue; // unchanged
        const baseVersion = idx?.version ?? 0;
        const data = await vault.readBinary(f);
        const hash = await sha256ArrayBuffer(data);
        await this.uploadOne(f.path, data, baseVersion, meta.mtime, hash);
      } catch (e) {
        if (e instanceof ConflictError) {
          await this.handleConflict(f.path, e.info);
        } else {
          console.error("push failed", f.path, e);
        }
      }
    }
    // push new/changed (.obsidian — hidden folder, via adapter)
    for (const p of obsFiles) {
      try {
        const idx = this.settings.fileIndex[p];
        const data = await vault.adapter.readBinary(p);
        const hash = await sha256ArrayBuffer(data);
        if (idx && idx.hash === hash) continue;
        await this.uploadOne(p, data, idx?.version ?? 0, Date.now(), hash);
      } catch (e) {
        if (e instanceof ConflictError) await this.handleConflict(p, (e as ConflictError).info);
        else console.error("push failed", p, e);
      }
    }
    // push deletes: paths in index but not local
    for (const p of Object.keys(this.settings.fileIndex)) {
      if (localPaths.has(p)) continue;
      if (!isPathSynced(p, this.settings)) continue;
      try {
        const idx = this.settings.fileIndex[p];
        await this.api.remove(p, idx.version);
        delete this.settings.fileIndex[p];
      } catch (e) {
        console.error("delete push failed", p, e);
      }
    }
  }

  private async pushPaths(paths: string[]): Promise<void> {
    if (!this.settings.autoSync) return;
    for (const p of paths) {
      if (!isPathSynced(p, this.settings)) continue;
      const f = this.deps.vault.getAbstractFileByPath(p);
      if (!f) continue;
      try {
        const meta = await computeMeta(this.deps.vault, f as TFile);
        const idx = this.settings.fileIndex[p];
        if (idx && idx.hash === meta.hash) continue;
        const baseVersion = idx?.version ?? 0;
        const data = await this.deps.vault.readBinary(f as TFile);
        const hash = await sha256ArrayBuffer(data);
        await this.uploadOne(p, data, baseVersion, meta.mtime, hash);
      } catch (e) {
        if (e instanceof ConflictError) await this.handleConflict(p, (e as ConflictError).info);
        else console.error("push path failed", p, e);
      }
    }
    await this.deps.saveSettings();
  }

  private async pushDeletes(paths: string[]): Promise<void> {
    if (!this.settings.autoSync) return;
    for (const p of paths) {
      const idx = this.settings.fileIndex[p];
      if (!idx) continue;
      try {
        await this.api.remove(p, idx.version);
        delete this.settings.fileIndex[p];
      } catch (e) { console.error("delete push failed", p, e); }
    }
    await this.deps.saveSettings();
  }

  private async pushRename(oldPath: string, newPath: string): Promise<void> {
    if (!this.settings.autoSync) return;
    const idx = this.settings.fileIndex[oldPath];
    const baseVersion = idx?.version ?? 0;
    try {
      await this.api.move(oldPath, newPath, baseVersion);
      if (idx) {
        this.settings.fileIndex[newPath] = idx;
        delete this.settings.fileIndex[oldPath];
      }
    } catch (e) { console.error("move push failed", e); }
    await this.deps.saveSettings();
  }

  private async uploadOne(path: string, data: ArrayBuffer, baseVersion: number, mtime: number, hash: string): Promise<void> {
    const seenDelete = this.settings.deletedSeen[path];
    const res = await this.api.upload(path, data, baseVersion, mtime, hash, seenDelete);
    if (seenDelete) delete this.settings.deletedSeen[path];
    this.settings.fileIndex[path] = { version: res.version, hash };
    this.watcher.markWritten(path);
  }

  private async handleConflict(path: string, info: any): Promise<void> {
    this.deps.onStatus("conflict");
    // Case: server has deleted this file but we pushed a stale copy
    if (info?.deleted) {
      try {
        const idx = this.settings.fileIndex[path];
        const f = this.deps.vault.getAbstractFileByPath(path) as TFile;
        const clientData = f ? await this.deps.vault.readBinary(f) : null;
        const clientHash = clientData ? await sha256ArrayBuffer(clientData) : "";
        const locallyModified = !idx || (clientHash && clientHash !== idx.hash);
        if (!locallyModified) {
          // we have no unsynced changes -> accept the deletion
          this.watcher.markWritten(path);
          if (f) await this.deps.vault.trash(f, false);
          delete this.settings.fileIndex[path];
          if (typeof info.serverVersion === "number") this.settings.deletedSeen[path] = info.serverVersion;
          await this.deps.saveSettings();
          return;
        }
        // we have unsynced edits -> preserve them as a conflict copy, keep server deletion
        if (clientData) {
          const cname = conflictName(path, this.settings.deviceId);
          this.watcher.markWritten(cname);
          this.watcher.markWritten(path);
          await ensureParents(this.deps.vault, cname);
          await this.deps.vault.createBinary(cname, clientData);
          if (f) await this.deps.vault.trash(f, false);
          delete this.settings.fileIndex[path];
          if (typeof info.serverVersion === "number") this.settings.deletedSeen[path] = info.serverVersion;
          await this.api.upload(cname, clientData, 0, Date.now(), clientHash).catch(() => {});
          this.settings.fileIndex[cname] = { version: 1, hash: clientHash };
          await this.deps.saveSettings();
        }
      } catch (e) {
        console.error("deleted-conflict handling failed", e);
      }
      return;
    }
    // Normal modify/modify conflict: download server version, keep both
    try {
      const { data: serverData, hash: serverHash, version: serverVersion } = await this.api.download(path);
      // read current local content (client version)
      const f = this.deps.vault.getAbstractFileByPath(path) as TFile;
      const clientData = f ? await this.deps.vault.readBinary(f) : null;
      const clientHash = clientData ? await sha256ArrayBuffer(clientData) : "";
      // write server version to original path
      this.watcher.markWritten(path);
      if (f) await this.deps.vault.modifyBinary(f, serverData);
      else {
        await ensureParents(this.deps.vault, path);
        await this.deps.vault.createBinary(path, serverData);
      }
      this.settings.fileIndex[path] = { version: serverVersion, hash: serverHash };
      // create conflict copy with client content
      if (clientData && clientHash !== serverHash) {
        const cname = conflictName(path, this.settings.deviceId);
        this.watcher.markWritten(cname);
        await ensureParents(this.deps.vault, cname);
        await this.deps.vault.createBinary(cname, clientData);
        // upload conflict copy as new file
        await this.api.upload(cname, clientData, 0, Date.now(), clientHash).catch(() => {});
        this.settings.fileIndex[cname] = { version: 1, hash: clientHash };
      }
      await this.deps.saveSettings();
    } catch (e) {
      console.error("conflict handling failed", e);
    }
  }
}

async function ensureParents(vault: Vault, path: string): Promise<void> {
  const parts = path.split("/");
  parts.pop();
  let cur = "";
  for (const part of parts) {
    cur = cur ? `${cur}/${part}` : part;
    if (!vault.getAbstractFileByPath(cur)) {
      try { await vault.createFolder(cur); } catch {}
    }
  }
}

async function ensureAdapterParents(vault: Vault, path: string): Promise<void> {
  const parts = path.split("/");
  parts.pop();
  let cur = "";
  for (const part of parts) {
    cur = cur ? `${cur}/${part}` : part;
    try { if (!(await vault.adapter.exists(cur))) await vault.adapter.mkdir(cur); } catch {}
  }
}
