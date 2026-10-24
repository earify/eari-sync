import { TFile, type Plugin, type Vault } from "obsidian";
import { ApiClient, ConflictError, type ConflictInfo, type RemoteChange } from "./api.js";
import type { EariSettings } from "./settings.js";
import { Watcher } from "./watcher.js";
import { isPathSynced, listFiles, listDirRecursive } from "./indexer.js";
import { conflictName } from "./conflict.js";
import { sha256ArrayBuffer } from "./hash.js";
import { log, warn, error as logError } from "./logger.js";
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
  private wsReconnectTimer: number | null = null;
  private wsPullTimer: number | null = null;
  private wsAttempts = 0;
  private syncing = false;
  private stopped = false;
  private chain: Promise<unknown> = Promise.resolve();
  private stats = { up: 0, down: 0, conflicts: 0 };
  private saveTimer: number | null = null;
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

  private debounceMs(): number {
    return this.settings.syncMode === "fast" ? 300 : this.settings.syncMode === "saver" ? 1500 : 800;
  }

  /** serialize all sync operations: watcher pushes never interleave with pulls */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(() => (this.stopped ? Promise.reject(new Error("stopped")) : fn()));
    this.chain = run.then(() => undefined, () => undefined);
    return run;
  }

  /** throttled settings persistence (data.json can be large; avoid rewriting it per file) */
  private saveSettingsSoon(): void {
    if (this.saveTimer || this.stopped) return;
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      void this.deps.saveSettings();
    }, 2000);
  }

  private flushSave(): void {
    if (this.saveTimer !== null) { window.clearTimeout(this.saveTimer); this.saveTimer = null; }
    void this.deps.saveSettings();
  }

  async start(): Promise<void> {
    if (!this.settings.deviceId) {
      this.settings.deviceId = crypto.randomUUID();
      await this.deps.saveSettings();
    }
    this.api.update(this.settings);
    this.settings.configDir = this.deps.vault.configDir;
    this.watcher.start();
    if (this.settings.autoSync) {
      this.connectWs();
      await this.syncNow();
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.watcher.stop(this.deps.vault);
    if (this.ws) { try { this.ws.close(); } catch { /* ignore */ } this.ws = null; }
    if (this.wsReconnectTimer !== null) { window.clearTimeout(this.wsReconnectTimer); this.wsReconnectTimer = null; }
    if (this.wsPullTimer !== null) { window.clearTimeout(this.wsPullTimer); this.wsPullTimer = null; }
    this.flushSave();
  }

  async syncNow(onProgress?: (msg: string) => void): Promise<void> {
    return this.enqueue(async () => {
      if (this.syncing) return;
      this.syncing = true;
      this.stats = { up: 0, down: 0, conflicts: 0 };
      this.deps.onStatus("syncing");
      onProgress?.("동기화 중… (변경사항 확인)");
      try {
        await this.pullChanges();
        onProgress?.(this.stats.down > 0 ? `변경사항 적용 (↓${this.stats.down})` : "변경사항 없음, 업로드 확인 중…");
        await this.pushAll();
        this.pruneTombstones();
        await this.deps.saveSettings();
        const summary = `완료 — ↓${this.stats.down} · ↑${this.stats.up}` + (this.stats.conflicts ? ` · 충돌 ${this.stats.conflicts}` : "");
        onProgress?.(summary);
        this.deps.onStatus("done", `↓${this.stats.down} ↑${this.stats.up}`);
      } catch (e) {
        logError("sync error", e);
        const msg = e instanceof Error ? e.message : String(e);
        onProgress?.(`오류 — ${msg}`);
        if (String(msg).includes("401") || String(msg).includes("unauthorized")) {
          this.deps.onStatus("auth", msg);
        } else {
          this.deps.onStatus("error", msg);
        }
      } finally {
        this.syncing = false;
      }
    });
  }

  private connectWs(): void {
    this.ws = this.api.connectWs(
      () => {
        // coalesce bursts of change notifications into one pull
        if (this.wsPullTimer !== null) return;
        this.wsPullTimer = window.setTimeout(() => {
          this.wsPullTimer = null;
          if (this.stopped) return;
          void this.enqueue(() => this.pullChanges().catch((e) => logError("ws pull", e)));
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
    this.wsReconnectTimer = window.setTimeout(() => {
      this.wsReconnectTimer = null;
      if (this.stopped) return;
      this.connectWs();
    }, delay);
  }

  private async pullChanges(): Promise<void> {
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
      this.saveSettingsSoon();
    }
  }

  /** enumerate .obsidian contents (hidden folder is not in the vault index) */
  private async listObsidianFiles(): Promise<string[]> {
    if (!this.settings.syncObsidian) return [];
    const entries = await listDirRecursive(this.deps.vault, this.settings.configDir);
    return entries
      .filter((e) => !e.isFolder && isPathSynced(e.path, this.settings))
      .map((e) => e.path);
  }

  private cfgPrefix(): string {
    return this.settings.configDir + "/";
  }

  private maxBytes(): number {
    return Math.max(1, this.settings.maxFileSizeMB ?? 50) * 1024 * 1024;
  }

  private tooBig(path: string, size: number | undefined): boolean {
    if (size && size > this.maxBytes()) {
      warn("eari-sync: skipping oversized file", path, size);
      return true;
    }
    return false;
  }

  private tombstone(path: string, version: number): void {
    this.settings.deletedSeen[path] = { v: version, t: Date.now() };
  }

  /** drop tombstones older than 30 days (bounded growth) */
  private pruneTombstones(): void {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const ds = this.settings.deletedSeen ?? {};
    let removed = 0;
    for (const k of Object.keys(ds)) {
      const t = typeof ds[k] === "number" ? 0 : ds[k].t;
      if (t < cutoff) { delete ds[k]; removed++; }
    }
    if (removed > 0) log("eari-sync: pruned", removed, "tombstones");
  }

  private async applyChange(c: RemoteChange): Promise<void> {
    const vault = this.deps.vault;
    const path = c.path;
    if (!isPathSynced(path, this.settings)) return;
    // skip if we already have this exact content (cheap retry after partial failure)
    const have = this.settings.fileIndex[path];
    if (c.op !== "delete" && have && c.hash && have.hash === c.hash) {
      this.settings.lastSeq = Math.max(this.settings.lastSeq, c.seq);
      return;
    }
    if (this.tooBig(path, c.size)) return;
    if (c.op === "delete") {
      if (path.startsWith(this.cfgPrefix())) {
        // hidden folder: remove via adapter (no trash for dotfiles)
        try { await vault.adapter.remove(path); } catch { /* ignore */ }
        delete this.settings.fileIndex[path];
        if (typeof c.version === "number") this.tombstone(path, c.version);
        this.stats.down++;
        return;
      }
      const f = vault.getAbstractFileByPath(path);
      if (f) {
        // move into in-vault .trash (which itself is synced) so deletions stay visible/recoverable
        this.watcher.markWritten(path);
        await vault.trash(f, false);
      }
      delete this.settings.fileIndex[path];
      if (typeof c.version === "number") this.tombstone(path, c.version);
      this.stats.down++;
      return;
    }
    if (c.op === "move" && c.fromPath) {
      const old = vault.getAbstractFileByPath(c.fromPath);
      if (old) {
        this.watcher.markWritten(c.fromPath);
        await vault.trash(old, false);
      }
      delete this.settings.fileIndex[c.fromPath];
      if (typeof c.version === "number") this.tombstone(c.fromPath, c.version);
    }
    // create/modify: download
    try {
      const { data, hash, version } = await this.api.download(path);
      this.watcher.markWritten(path);
      if (path.startsWith(this.cfgPrefix())) {
        await ensureAdapterParents(vault, path);
        await vault.adapter.writeBinary(path, data);
      } else {
        const existing = vault.getAbstractFileByPath(path);
        if (existing instanceof TFile) {
          await vault.modifyBinary(existing, data);
        } else {
          await ensureParents(vault, path);
          await vault.createBinary(path, data);
        }
      }
      this.settings.fileIndex[path] = { version, hash };
      this.stats.down++;
      delete this.settings.deletedSeen[path];
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // server no longer has it (deleted between listing and download) — skip gracefully
      if (msg.includes("download 404")) {
        warn("eari-sync: vanished on server, skipping:", path);
        return;
      }
      logError("apply change failed", path, e);
      throw e;
    }
  }

  private async pushAll(): Promise<void> {
    const vault = this.deps.vault;
    const files = listFiles(vault, this.settings).filter((f) => !f.path.startsWith(this.cfgPrefix()));
    const obsFiles = await this.listObsidianFiles();
    const localPaths = new Set<string>([...files.map((f) => f.path), ...obsFiles]);
    // push new/changed (indexed files) — single read per file
    for (const f of files) {
      if (this.watcher.isRecentlyWritten(f.path)) continue;
      if (this.tooBig(f.path, f.stat.size)) continue;
      try {
        const data = await vault.readBinary(f);
        const hash = await sha256ArrayBuffer(data);
        const idx = this.settings.fileIndex[f.path];
        if (idx && idx.hash === hash) continue; // unchanged
        await this.uploadOne(f.path, data, idx?.version ?? 0, f.stat.mtime, hash);
      } catch (e) {
        if (e instanceof ConflictError) {
          await this.handleConflict(f.path, e.info);
        } else {
          logError("push failed", f.path, e);
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
        if (e instanceof ConflictError) await this.handleConflict(p, e.info);
        else logError("push failed", p, e);
      }
    }
    // push deletes: paths in index but not local
    for (const p of Object.keys(this.settings.fileIndex)) {
      if (localPaths.has(p)) continue;
      if (!isPathSynced(p, this.settings)) continue;
      try {
        const idx = this.settings.fileIndex[p];
        await this.api.remove(p, idx.version);
        this.stats.up++;
        delete this.settings.fileIndex[p];
      } catch (e) {
        logError("delete push failed", p, e);
      }
    }
  }

  private async pushPaths(paths: string[]): Promise<void> {
    if (!this.settings.autoSync) return;
    for (const p of paths) {
      if (!isPathSynced(p, this.settings)) continue;
      const f = this.deps.vault.getAbstractFileByPath(p);
      if (!(f instanceof TFile)) continue; // ignore folders
      if (this.tooBig(p, f.stat.size)) continue;
      try {
        const data = await this.deps.vault.readBinary(f);
        const hash = await sha256ArrayBuffer(data);
        const idx = this.settings.fileIndex[p];
        if (idx && idx.hash === hash) continue;
        await this.uploadOne(p, data, idx?.version ?? 0, f.stat.mtime, hash);
      } catch (e) {
        if (e instanceof ConflictError) await this.handleConflict(p, e.info);
        else logError("push path failed", p, e);
      }
    }
    this.saveSettingsSoon();
  }

  private async pushDeletes(paths: string[]): Promise<void> {
    if (!this.settings.autoSync) return;
    for (const p of paths) {
      const idx = this.settings.fileIndex[p];
      if (!idx) continue;
      try {
        await this.api.remove(p, idx.version);
        delete this.settings.fileIndex[p];
        this.stats.up++;
      } catch (e) { logError("delete push failed", p, e); }
    }
    this.saveSettingsSoon();
  }

  private async pushRename(oldPath: string, newPath: string): Promise<void> {
    if (!this.settings.autoSync) return;
    const vault = this.deps.vault;
    const idx = this.settings.fileIndex[oldPath];
    const baseVersion = idx?.version ?? 0;
    try {
      await this.api.move(oldPath, newPath, baseVersion);
      if (idx) {
        this.settings.fileIndex[newPath] = idx;
        delete this.settings.fileIndex[oldPath];
      }
    } catch (e) {
      if (e instanceof ConflictError) {
        // server has newer content at the old path — preserve both:
        // restore server content at old path, keep our renamed file as a new file
        try {
          const { data, hash, version } = await this.api.download(oldPath);
          this.watcher.markWritten(oldPath);
          if (oldPath.startsWith(this.cfgPrefix())) {
            await ensureAdapterParents(vault, oldPath);
            await vault.adapter.writeBinary(oldPath, data);
          } else {
            await ensureParents(vault, oldPath);
            await vault.createBinary(oldPath, data);
          }
          this.settings.fileIndex[oldPath] = { version, hash };
          const nf = vault.getAbstractFileByPath(newPath);
          if (nf instanceof TFile) {
            const data2 = await vault.readBinary(nf);
            const hash2 = await sha256ArrayBuffer(data2);
            await this.uploadOne(newPath, data2, 0, nf.stat.mtime, hash2);
          }
        } catch (e2) {
          logError("move conflict resolution failed", e2);
        }
      } else {
        logError("move push failed", e);
      }
    }
    this.saveSettingsSoon();
  }

  private async uploadOne(path: string, data: ArrayBuffer, baseVersion: number, mtime: number, hash: string): Promise<void> {
    const tomb = this.settings.deletedSeen[path];
    const seenDelete = typeof tomb === "object" ? tomb.v : tomb;
    const res = await this.api.upload(path, data, baseVersion, mtime, hash, seenDelete);
    if (seenDelete) delete this.settings.deletedSeen[path];
    this.stats.up++;
    this.settings.fileIndex[path] = { version: res.version, hash };
    this.watcher.markWritten(path);
  }

  private async uploadNewConflictCopy(cname: string, data: ArrayBuffer, hash: string): Promise<void> {
    try {
      const res = await this.api.upload(cname, data, 0, Date.now(), hash);
      this.settings.fileIndex[cname] = { version: res.version, hash };
    } catch (e) {
      // do NOT record in fileIndex — pushAll will retry it as a new file
      warn("eari-sync: conflict copy upload failed (will retry)", cname, e);
    }
  }

  private async handleConflict(path: string, info: ConflictInfo): Promise<void> {
    this.deps.onStatus("conflict");
    this.stats.conflicts++;
    // Case: server has deleted this file but we pushed a stale copy
    if (info?.deleted) {
      try {
        const idx = this.settings.fileIndex[path];
        const f = this.deps.vault.getAbstractFileByPath(path);
        const clientData = f instanceof TFile ? await this.deps.vault.readBinary(f) : null;
        const clientHash = clientData ? await sha256ArrayBuffer(clientData) : "";
        const locallyModified = !idx || (clientHash && clientHash !== idx.hash);
        if (!locallyModified) {
          // we have no unsynced changes -> accept the deletion
          this.watcher.markWritten(path);
          if (f instanceof TFile) await this.deps.vault.trash(f, false);
          delete this.settings.fileIndex[path];
          if (typeof info.serverVersion === "number") this.tombstone(path, info.serverVersion);
          this.flushSave();
          return;
        }
        // we have unsynced edits -> preserve them as a conflict copy, keep server deletion
        if (clientData) {
          const cname = conflictName(path, this.settings.deviceId);
          this.watcher.markWritten(cname);
          this.watcher.markWritten(path);
          await ensureParents(this.deps.vault, cname);
          await this.deps.vault.createBinary(cname, clientData);
          if (f instanceof TFile) await this.deps.vault.trash(f, false);
          delete this.settings.fileIndex[path];
          if (typeof info.serverVersion === "number") this.tombstone(path, info.serverVersion);
          await this.uploadNewConflictCopy(cname, clientData, clientHash);
          this.flushSave();
        }
      } catch (e) {
        logError("deleted-conflict handling failed", e);
      }
      return;
    }
    // Normal modify/modify conflict: download server version, keep both
    try {
      const { data: serverData, hash: serverHash, version: serverVersion } = await this.api.download(path);
      const f = this.deps.vault.getAbstractFileByPath(path);
      const clientData = f instanceof TFile ? await this.deps.vault.readBinary(f) : null;
      const clientHash = clientData ? await sha256ArrayBuffer(clientData) : "";
      // write server version to original path
      this.watcher.markWritten(path);
      if (f instanceof TFile) await this.deps.vault.modifyBinary(f, serverData);
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
        await this.uploadNewConflictCopy(cname, clientData, clientHash);
      }
      this.flushSave();
    } catch (e) {
      logError("conflict handling failed", e);
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
      try { await vault.createFolder(cur); } catch { /* already exists */ }
    }
  }
}

async function ensureAdapterParents(vault: Vault, path: string): Promise<void> {
  const parts = path.split("/");
  parts.pop();
  let cur = "";
  for (const part of parts) {
    cur = cur ? `${cur}/${part}` : part;
    try { if (!(await vault.adapter.exists(cur))) await vault.adapter.mkdir(cur); } catch { /* best effort */ }
  }
}
