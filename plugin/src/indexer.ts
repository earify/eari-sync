import type { Vault, TFile } from "obsidian";

export interface LocalMeta {
  path: string;
  size: number;
  mtime: number;
  hash: string;
}

export function isExcluded(path: string, patterns: string[]): boolean {
  // simple glob-ish matching: support * and **
  for (const pat of patterns) {
    if (matchGlob(path, pat)) return true;
  }
  return false;
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

export function listFiles(vault: Vault, exclude: string[]): TFile[] {
  const files = vault.getFiles();
  return files.filter((f) => !isExcluded(f.path, exclude));
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
