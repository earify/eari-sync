import { defaultDataDir, ensureDataDirs, loadConfig, saveConfig } from "./config.js";
import { openDb } from "./db.js";
import { buildServer, cleanupExpiredTrash } from "./index.js";
import { listVaults } from "./vaults.js";
import { mkdirSync, existsSync, readFileSync } from "node:fs";
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

  // trash retention: clean expired items now, then once a day
  try { const n = cleanupExpiredTrash(db, dataDir); if (n > 0) console.log("cleaned expired trash:", n); } catch (e) { console.error("trash cleanup failed", e); }
  const trashTimer = setInterval(() => {
    try { cleanupExpiredTrash(db, dataDir); } catch (e) { console.error("trash cleanup failed", e); }
  }, 24 * 60 * 60 * 1000);
  trashTimer.unref?.();

  // plain-HTTP helper that only serves the public CA cert (device onboarding convenience)
  const caHttpPort = Number(process.env.EARI_SYNC_CA_HTTP_PORT ?? 8442);
  if (caHttpPort > 0 && cfg.caCertPath && existsSync(cfg.caCertPath)) {
    const http = await import("node:http");
    const srv = http.createServer((req, res) => {
      if (req.url === "/ca.crt" && cfg.caCertPath && existsSync(cfg.caCertPath)) {
        res.writeHead(200, {
          "Content-Type": "application/x-x509-ca-cert",
          "Content-Disposition": 'attachment; filename="eari-sync-ca.crt"',
        });
        res.end(readFileSync(cfg.caCertPath));
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    srv.listen(caHttpPort, "0.0.0.0");
    console.log("CA distribution (HTTP) listening on 0.0.0.0:" + caHttpPort + "/ca.crt");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
