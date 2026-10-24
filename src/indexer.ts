import { FileSystemAdapter, type Vault, type TFile } from "obsidian";
import type { EariSettings } from "./settings.js";

/** always excluded, not user-editable (configDir is filled in per vault) */
export function baseExcludes(configDir: string): string[] {
  return [
    ".git/**",
    ".eari-sync/**",
    `${configDir}/plugins/eari-sync/**`,
    "**/.DS_Store",
    "**/Thumbs.db",
  ];
}

interface DirentLike {
  name: string;
  isDirectory(): boolean;
  isFile(): boolean;
}

interface FsLike {
  readdirSync(path: string, options: { withFileTypes: true }): DirentLike[];
}

interface PathLike {
  join(...parts: string[]): string;
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
  if (isExcluded(p, baseExcludes(s.configDir))) return false;
  const cd = s.configDir;
  if (p === cd || p.startsWith(cd + "/")) {
    if (!s.syncObsidian) return false;
    const rel = p.slice(cd.length + 1);
    // device-specific workspace files stay excluded; workspaces.json (plugin data) is allowed
    if (rel === "workspace" || rel === "workspace.json" || rel === "workspace-mobile.json") return false;
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
  const re = pattern
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
  const adapter = vault.adapter;
  if (typeof FileSystemAdapter !== "undefined" && adapter instanceof FileSystemAdapter) {
    try {
      // Electron exposes require only in the desktop renderer (guarded by the FileSystemAdapter check above)
      const req = (window as unknown as { require?: (id: string) => unknown }).require;
      const fsMod = req?.("fs") as FsLike | undefined;
      const pathMod = req?.("path") as PathLike | undefined;
      if (fsMod && pathMod) {
        const out: DirEntry[] = [];
        const base = adapter.getBasePath();
        const walk = (abs: string, rel: string): void => {
          const items = fsMod.readdirSync(abs, { withFileTypes: true });
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
    try {
      const res = await adapter.list(d);
      for (const f of Object.keys(res.files)) {
        out.push({ path: String(f).replace(/\\/g, "/"), isFolder: false });
      }
      for (const sub of res.folders) {
        const pp = String(sub).replace(/\\/g, "/").replace(/\/$/, "");
        out.push({ path: pp, isFolder: true });
        await walk(pp);
      }
    } catch {
      // missing or unreadable directory
    }
  };
  await walk(dir);
  return out;
}
