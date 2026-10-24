const fs = require("fs");
const p = "server/src/index.ts";
let s = fs.readFileSync(p, "utf8");

const anchor = '  app.get("/health", async () => ({ ok: true, time: Date.now() }));';
if (!s.includes(anchor)) { console.log("anchor missing!"); process.exit(1); }
const insert = anchor + `

  // public CA distribution (helps new devices trust this server; the cert itself is public)
  app.get("/ca.crt", async (_req, reply) => {
    if (!cfg.caCertPath || !existsSync(cfg.caCertPath)) {
      return reply.code(404).send({ error: "no CA configured" });
    }
    const { readFileSync } = await import("node:fs");
    reply.header("Content-Type", "application/x-x509-ca-cert");
    reply.header("Content-Disposition", 'attachment; filename="eari-sync-ca.crt"');
    return reply.send(readFileSync(cfg.caCertPath));
  });`;
s = s.replace(anchor, insert);
fs.writeFileSync(p, s, "utf8");
console.log("endpoint added:", s.includes("/ca.crt"));

// ensure existsSync import in index.ts
if (!/import \{[^}]*existsSync[^}]*\} from "node:fs"/.test(s)) {
  s = fs.readFileSync(p, "utf8");
  s = s.replace('import { join } from "node:path";', 'import { join } from "node:path";\nimport { existsSync } from "node:fs";');
  fs.writeFileSync(p, s, "utf8");
  console.log("existsSync import added");
} else {
  console.log("existsSync already imported");
}
