import { defaultDataDir, ensureDataDirs, loadConfig, saveConfig } from "./config.js";
import { openDb } from "./db.js";
import { buildServer } from "./index.js";
import { listVaults } from "./vaults.js";
import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

async function main() {
  const dataDir = defaultDataDir();
  ensureDataDirs(dataDir);
  const cfg = loadConfig(dataDir);
  const db = openDb(dataDir);
  const app = await buildServer(cfg, db);
  const listenOpts: any = { port: cfg.port, host: cfg.host };
  if (cfg.certPath && cfg.keyPath && existsSync(cfg.certPath) && existsSync(cfg.keyPath)) {
    const { readFileSync } = await import("node:fs");
    listenOpts.https = { cert: readFileSync(cfg.certPath), key: readFileSync(cfg.keyPath) };
    console.log("HTTPS enabled using", cfg.certPath);
  } else {
    console.warn("WARNING: no TLS cert configured; running HTTP (dev only). Set EARI_SYNC_CERT/EARI_SYNC_KEY for HTTPS.");
  }
  await app.listen(listenOpts);
  console.log(`eari-sync server listening on ${cfg.host}:${cfg.port} (data: ${dataDir})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
