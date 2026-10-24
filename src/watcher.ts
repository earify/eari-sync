import { TAbstractFile, type EventRef, type Vault } from "obsidian";

export interface WatcherCallbacks {
  onChanged: (paths: string[]) => void;
  onDeleted: (paths: string[]) => void;
  onRenamed: (oldPath: string, newPath: string) => void;
}

export class Watcher {
  private debounceMs: number;
  private pending = new Set<string>();
  private deleted = new Set<string>();
  private renamed = new Map<string, string>();
  private timer: number | null = null;
  private recentlyWritten = new Map<string, number>(); // path -> expiry ms
  private recentSweepTimer: number | null = null;
  private refs: EventRef[] = [];
  private vault: Vault;
  private cb: WatcherCallbacks;

  constructor(vault: Vault, cb: WatcherCallbacks, debounceMs = 500) {
    this.vault = vault;
    this.cb = cb;
    this.debounceMs = debounceMs;
  }

  start(): void {
    this.refs.push(this.vault.on("create", (f: TAbstractFile) => this.queue(f.path)));
    this.refs.push(this.vault.on("modify", (f: TAbstractFile) => this.queue(f.path)));
    this.refs.push(this.vault.on("delete", (f: TAbstractFile) => this.queueDelete(f.path)));
    this.refs.push(this.vault.on("rename", (f: TAbstractFile, oldPath: string) => this.queueRename(oldPath, f.path)));
    // periodic sweep so the recentlyWritten map cannot grow unbounded
    this.recentSweepTimer = window.setInterval(() => {
      const now = Date.now();
      for (const [p, exp] of this.recentlyWritten) {
        if (now > exp) this.recentlyWritten.delete(p);
      }
    }, 60000);
  }

  stop(vault: Vault): void {
    for (const r of this.refs) vault.offref(r);
    this.refs = [];
    if (this.timer !== null) window.clearTimeout(this.timer);
    if (this.recentSweepTimer !== null) window.clearInterval(this.recentSweepTimer);
  }

  markWritten(path: string, ttlMs = 5000): void {
    this.recentlyWritten.set(path, Date.now() + ttlMs);
  }

  isRecentlyWritten(path: string): boolean {
    const exp = this.recentlyWritten.get(path);
    if (!exp) return false;
    if (Date.now() > exp) { this.recentlyWritten.delete(path); return false; }
    return true;
  }

  private queue(path: string): void {
    if (this.isRecentlyWritten(path)) return;
    this.pending.add(path);
    this.schedule();
  }

  private queueDelete(path: string): void {
    if (this.isRecentlyWritten(path)) return;
    this.deleted.add(path);
    this.schedule();
  }

  private queueRename(oldPath: string, newPath: string): void {
    if (this.isRecentlyWritten(newPath)) return;
    this.renamed.set(oldPath, newPath);
    this.schedule();
  }

  private schedule(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.flush(), this.debounceMs);
  }

  private flush(): void {
    const paths = Array.from(this.pending);
    const dels = Array.from(this.deleted);
    const renames = Array.from(this.renamed.entries());
    this.pending.clear();
    this.deleted.clear();
    this.renamed.clear();
    this.timer = null;
    if (paths.length) this.cb.onChanged(paths);
    if (dels.length) this.cb.onDeleted(dels);
    for (const [o, n] of renames) this.cb.onRenamed(o, n);
  }
}
