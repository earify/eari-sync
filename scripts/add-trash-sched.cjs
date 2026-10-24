const fs = require("fs");
const p = "server/src/main.ts";
let s = fs.readFileSync(p, "utf8");
if (s.includes("cleanupExpiredTrash")) { console.log("already patched"); process.exit(0); }

if (!s.includes('import { buildServer }')) { console.log("unexpected"); process.exit(1); }
s = s.replace('import { buildServer } from "./index.js";', 'import { buildServer, cleanupExpiredTrash } from "./index.js";');

const anchor = '  console.log(`eari-sync server listening on ${cfg.host}:${cfg.port} (data: ${dataDir})`);';
const insert = anchor + `

  // trash retention: clean expired items now, then once a day
  try { const n = cleanupExpiredTrash(db, dataDir); if (n > 0) console.log("cleaned expired trash:", n); } catch (e) { console.error("trash cleanup failed", e); }
  const trashTimer = setInterval(() => {
    try { cleanupExpiredTrash(db, dataDir); } catch (e) { console.error("trash cleanup failed", e); }
  }, 24 * 60 * 60 * 1000);
  trashTimer.unref?.();`;
s = s.replace(anchor, insert);
fs.writeFileSync(p, s, "utf8");
console.log("main.ts trash scheduler added");
