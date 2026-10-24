const fs = require("fs");
const p = "server/src/main.ts";
let s = fs.readFileSync(p, "utf8");

if (s.includes("CA distribution")) { console.log("already patched"); process.exit(0); }

// ensure imports
if (!s.includes('import { existsSync, readFileSync }')) {
  s = s.replace(/import \{ existsSync \} from "node:fs";/, 'import { existsSync, readFileSync } from "node:fs";');
  if (!s.includes('readFileSync')) {
    // no fs import at all — add one after the last import line
    s = s.replace(/(import[^\n]*\n)(\n)/, '$1import { existsSync, readFileSync } from "node:fs";\n$2');
  }
}

const anchor = '  console.log(`eari-sync server listening on ${cfg.host}:${cfg.port} (data: ${dataDir})`);';
if (!s.includes(anchor)) { console.log("anchor missing"); process.exit(1); }
const insert = anchor + `

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
  }`;
s = s.replace(anchor, insert);
fs.writeFileSync(p, s, "utf8");
console.log("main.ts patched");
