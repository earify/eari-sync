import type { Vault, TFile } from "obsidian";
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
  // convert glob to regex
  let re = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "::DOUBLE::")
    .replace(/\*/g, "[^/]*")
    .replace(/::DOUBLE::/g, ".*");
  // anchor
  if (!pattern.startsWith("**") && !pattern.startsWith("/")) {
    // match basename or full
  }
  const r = new RegExp("^" + re + "$");
  if (r.test(path)) return true;
  // also match if pattern has no slash: match basename
  if (!pattern.includes("/")) {
    const base = path.split("/").pop() || path;
    if (new RegExp("^" + re + "$").test(base)) return true;
  }
  return false;
}

export function listFiles(vault: Vault, s: EariSettings): TFile[] {
  const files = vault.getFiles();
  return files.filter((f) => isPathSynced(f.path, s));
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
