import { normalize, sep } from "node:path";
import { lstatSync } from "node:fs";
import { normalizePath } from "@eari-sync/shared";

export function safeRelativePath(input: string): string {
  if (typeof input !== "string" || input.length === 0) throw new Error("invalid path");
  if (input.includes("\0")) throw new Error("null byte in path");
  // convert backslashes to forward (clients may send either)
  const fwd = input.replace(/\\/g, "/");
  const norm = normalizePath(fwd);
  if (norm.length === 0) throw new Error("empty path");
  // ensure no traversal after normalization
  const resolved = normalize(norm);
  if (resolved.startsWith("..") || resolved.includes("../")) throw new Error("path traversal");
  return norm;
}

export function assertInsideVault(vaultFilesDir: string, targetPath: string): void {
  const base = normalize(vaultFilesDir);
  const target = normalize(targetPath);
  if (target !== base && !target.startsWith(base + sep)) {
    throw new Error("path escapes vault directory");
  }
}

export function rejectSymlink(absPath: string): void {
  try {
    const st = lstatSync(absPath);
    if (st.isSymbolicLink()) throw new Error("symlink not allowed");
    if (!st.isFile() && !st.isDirectory()) throw new Error("unsupported file type");
  } catch (e: any) {
    if (e.code === "ENOENT") return; // not exists yet, ok
    throw e;
  }
}
