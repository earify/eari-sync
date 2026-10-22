// Shared protocol types for eari-sync (server + plugin)

export type Op = "create" | "modify" | "delete" | "move";

export interface FileMeta {
  path: string;          // vault-relative POSIX path
  size: number;
  mtime: number;         // ms since epoch
  hash: string;          // sha256 hex
  version: number;
  deleted?: boolean;
}

export interface Change {
  seq: number;
  path: string;
  op: Op;
  size?: number;
  mtime?: number;
  hash?: string;
  version: number;
  fromPath?: string;     // for move
  clientId?: string;
  createdAt: number;
}

export interface ChangesResponse {
  changes: Change[];
  nextSeq: number;        // highest seq returned (or current if none)
  hasMore: boolean;
  currentSeq: number;     // server's current seq
}

export interface PushResult {
  path: string;
  version: number;
  seq: number;
  status: "created" | "updated" | "unchanged";
}

export interface ConflictInfo {
  path: string;
  serverVersion: number;
  serverHash: string;
  serverSize: number;
  serverMtime: number;
  clientVersion: number;
}

export interface VaultMeta {
  vaultId: string;
  seq: number;
  fileCount: number;
  trashCount: number;
}

export interface ClientInfo {
  clientId: string;
  deviceName?: string;
  platform?: "windows" | "android" | "ipados" | "other";
}

export interface WsMessage {
  type: "change" | "ping" | "pong" | "auth" | "auth_ok" | "auth_fail" | "error";
  vaultId?: string;
  seq?: number;
  token?: string;
  message?: string;
}

export interface ServerSettings {
  port: number;
  dataDir: string;
  httpsMode: "letsencrypt" | "selfsigned";
  certPath?: string;
  keyPath?: string;
  caCertPath?: string;
}

export interface SyncMode {
  mode: "fast" | "balanced" | "saver";
}

export const DEFAULT_EXCLUDES = [
  ".git/**",
  ".obsidian/cache/**",
  ".obsidian/workspace*.json",
  "**/.DS_Store",
  "**/Thumbs.db",
];

export function normalizePath(p: string): string {
  // POSIX normalize, no leading slash, no .. segments
  const parts = p.split("/").filter((x) => x.length > 0 && x !== ".");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "..") throw new Error("path traversal not allowed");
    out.push(part);
  }
  return out.join("/");
}
