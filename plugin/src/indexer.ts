import { FileSystemAdapter, type Vault, type TFile } from "obsidian";
import type { EariSettings } from "./settings.js";

/** always excluded, not user-editable */
export const BASE_EXCLUDES = [
  ".git/**",
  ".eari-sync/**",
  "**/.DS_Store",
  "**/Thumbs.db",
];

export interface LocalMeta {
  path: string;
  size: number;
  mtime: number;
  hash: string;
}

export interface DirEntry {
  path: string; // vault-relative, forward slashes
  isFolder: boolean;
}

export function isExcluded(path: string, patterns: string[]): boolean {
  for (const pat of patterns) {
    if (matchGlob(path, pat)) return true;
  }
  return false;
}

/** decide whether a vault-relative path should be synced */
export function isPathSynced(path: string, s: EariSettings): boolean {
  const p = path.replace(/\\/g, "/");
  if (isExcluded(p, BASE_EXCLUDES)) return false;
  if (p === ".obsidian" || p.startsWith(".obsidian/")) {
    if (!s.syncObsidian) return false;
    const rel = p.slice(".obsidian/".length);
    if (rel.startsWith("workspace")) return false; // device-specific, always excluded
    const inc = s.obsidianInclude ?? [];
    return inc.some((entry) => {
      if (entry.endsWith("/")) return rel.startsWith(entry);
      return rel === entry || rel.startsWith(entry + "/");
    });
  }
  if (isExcluded(p, s.excludePatterns ?? [])) return false;
  return true;
}

function matchGlob(path: string, pattern: string): boolean {
  let re = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "::DOUBLE::")
    .replace(/\*/g, "[^/]*")
    .replace(/::DOUBLE::/g, ".*");
  const r = new RegExp("^" + re + "$");
  if (r.test(path)) return true;
  if (!pattern.includes("/")) {
    const base = path.split("/").pop() || path;
    if (r.test(base)) return true;
  }
  return false;
}

export function listFiles(vault: Vault, s: EariSettings): TFile[] {
  const files = vault.getFiles();
  return files.filter((f) => isPathSynced(f.path, s));
}

/**
 * Recursively list a directory (works for hidden dirs like .obsidian).
 * Desktop: Node fs via FileSystemAdapter. Mobile: adapter.list walk.
 */
export async function listDirRecursive(vault: Vault, dir: string): Promise<DirEntry[]> {
  const adapter = vault.adapter as any;
  if (typeof FileSystemAdapter !== "undefined" && adapter instanceof FileSystemAdapter) {
    try {
      const req = (window as any).require;
      const fs = req?.("fs");
      const pathMod = req?.("path");
      if (fs && pathMod) {
        const out: DirEntry[] = [];
        const base = adapter.getBasePath();
        const walk = (abs: string, rel: string): void => {
          let items: any[];
          try { items = fs.readdirSync(abs, { withFileTypes: true }); } catch { return; }
          for (const it of items) {
            const r = rel ? rel + "/" + it.name : it.name;
            const absChild = pathMod.join(abs, it.name);
            if (it.isDirectory()) {
              out.push({ path: r, isFolder: true });
              walk(absChild, r);
            } else if (it.isFile()) {
              out.push({ path: r, isFolder: false });
            }
          }
        };
        walk(pathMod.join(base, dir), dir);
        return out;
      }
    } catch {
      // fall through to adapter listing
    }
  }
  const out: DirEntry[] = [];
  const walk = async (d: string): Promise<void> => {
    let res: any;
    try { res = await adapter.list(d); } catch { return; }
    for (const f of Object.keys(res.files ?? {})) {
      out.push({ path: String(f).replace(/\\/g, "/"), isFolder: false });
    }
    for (const sub of res.folders ?? []) {
      const p = String(sub).replace(/\\/g, "/").replace(/\/$/, "");
      out.push({ path: p, isFolder: true });
      await walk(p);
    }
  };
  await walk(dir);
  return out;
}

export async function computeMeta(vault: Vault, file: TFile): Promise<LocalMeta> {
  const content = await vault.readBinary(file);
  const hash = await sha256ArrayBuf(content);
  return { path: file.path, size: file.stat.size, mtime: file.stat.mtime, hash };
}

async function sha256ArrayBuf(buf: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
