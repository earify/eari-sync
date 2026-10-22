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
  await app.listen(listenOpts);
  console.log(`eari-sync server listening on ${cfg.host}:${cfg.port} (data: ${dataDir})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
