import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import type { ServerSettings } from "@eari-sync/shared";

export interface RuntimeConfig {
  dataDir: string;
  port: number;
  host: string;
  httpsMode: "letsencrypt" | "selfsigned";
  certPath?: string;
  keyPath?: string;
  caCertPath?: string;
  logLevel: "debug" | "info" | "warn" | "error";
}

const DEFAULT_DATA_DIR = join(homedir(), "eari-sync-data");

export function defaultDataDir(): string {
  return process.env.EARI_SYNC_DATA_DIR ? resolve(process.env.EARI_SYNC_DATA_DIR) : DEFAULT_DATA_DIR;
}

export function ensureDataDirs(dataDir: string): void {
  for (const sub of ["", "config", "vaults", "database", "backups", "logs", "staging"]) {
    const p = join(dataDir, sub);
    if (!existsSync(p)) mkdirSync(p, { recursive: true });
  }
}

export function loadConfig(dataDir: string): RuntimeConfig {
  const cfgPath = join(dataDir, "config", "server.json");
  let file: Partial<RuntimeConfig> = {};
  if (existsSync(cfgPath)) {
    try {
      file = JSON.parse(readFileSync(cfgPath, "utf8"));
    } catch {
      file = {};
    }
  }
  const cfg: RuntimeConfig = {
    dataDir,
    port: Number(process.env.EARI_SYNC_PORT ?? file.port ?? 8443),
    host: process.env.EARI_SYNC_HOST ?? file.host ?? "0.0.0.0",
    httpsMode: (process.env.EARI_SYNC_HTTPS_MODE as any) ?? file.httpsMode ?? "selfsigned",
    certPath: process.env.EARI_SYNC_CERT ?? file.certPath,
    keyPath: process.env.EARI_SYNC_KEY ?? file.keyPath,
    caCertPath: process.env.EARI_SYNC_CA ?? file.caCertPath,
    logLevel: (process.env.EARI_SYNC_LOG_LEVEL as any) ?? file.logLevel ?? "info",
  };
  return cfg;
}

export function saveConfig(dataDir: string, cfg: Partial<RuntimeConfig>): void {
  ensureDataDirs(dataDir);
  const cfgPath = join(dataDir, "config", "server.json");
  let existing: any = {};
  if (existsSync(cfgPath)) {
    try { existing = JSON.parse(readFileSync(cfgPath, "utf8")); } catch { existing = {}; }
  }
  writeFileSync(cfgPath, JSON.stringify({ ...existing, ...cfg }, null, 2), "utf8");
}

export function vaultDir(dataDir: string, vaultId: string): string {
  return join(dataDir, "vaults", vaultId);
}

export function vaultFilesDir(dataDir: string, vaultId: string): string {
  return join(vaultDir(dataDir, vaultId), "files");
}

export function vaultStagingDir(dataDir: string, vaultId: string): string {
  return join(vaultDir(dataDir, vaultId), "staging");
}

export function vaultTrashDir(dataDir: string, vaultId: string): string {
  return join(vaultDir(dataDir, vaultId), "trash");
}

export function dbPath(dataDir: string): string {
  return join(dataDir, "database", "eari-sync.sqlite");
}
