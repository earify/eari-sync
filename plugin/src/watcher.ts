import type { Vault, TFile, EventRef } from "obsidian";

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
  private timer: any = null;
  private recentlyWritten = new Map<string, number>(); // path -> expiry ms
  private refs: EventRef[] = [];
  private vault: Vault;
  private cb: WatcherCallbacks;

  constructor(vault: Vault, cb: WatcherCallbacks, debounceMs = 500) {
    this.vault = vault;
    this.cb = cb;
    this.debounceMs = debounceMs;
  }

  start(): void {
    const v: any = this.vault;
    this.refs.push(v.on("create", (f: any) => this.queue(f.path)));
    this.refs.push(v.on("modify", (f: any) => this.queue(f.path)));
    this.refs.push(v.on("delete", (f: any) => this.queueDelete(f.path)));
    this.refs.push(v.on("rename", (f: any, oldPath: string) => this.queueRename(oldPath, f.path)));
  }

  stop(vault: Vault): void {
    for (const r of this.refs) vault.offref(r);
    this.refs = [];
    if (this.timer) clearTimeout(this.timer);
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
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.debounceMs);
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

  async stabilize(path: string, checks = 5, intervalMs = 100): Promise<boolean> {
    // wait until file size stable
    let last = -1;
    for (let i = 0; i < checks; i++) {
      const f = this.vault.getAbstractFileByPath(path);
      const size = (f as any)?.stat?.size ?? 0;
      if (size === last && i > 0) return true;
      last = size;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    return true;
  }
}
