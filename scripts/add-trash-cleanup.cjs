const fs = require("fs");
const p = "server/src/index.ts";
let s = fs.readFileSync(p, "utf8");

if (s.includes("cleanupExpiredTrash")) { console.log("already present"); process.exit(0); }

// add the cleanup function after broadcast()
const anchor1 = "function broadcast(vaultId: string, seq: number): void {";
const fnBlock = `export function cleanupExpiredTrash(db: Db, dataDir: string): number {
  const rows = db.db.prepare("SELECT rowid AS rid, trash_path FROM trash WHERE expires_at < ?").all(Date.now()) as any[];
  let n = 0;
  for (const r of rows) {
    try { if (r.trash_path && existsSync(r.trash_path)) rmSync(r.trash_path, { force: true }); } catch {}
    db.db.prepare("DELETE FROM trash WHERE rowid = ?").run(r.rid);
    n++;
  }
  return n;
}

function broadcast(vaultId: string, seq: number): void {`;
if (!s.includes(anchor1)) { console.log("broadcast anchor not found"); process.exit(1); }
s = s.replace(anchor1, fnBlock);

// imports: existsSync may already exist; rmSync needs adding
if (!/import \{[^}]*rmSync[^}]*\} from "node:fs"/.test(s)) {
  s = s.replace('import { existsSync } from "node:fs";', 'import { existsSync, rmSync } from "node:fs";');
  if (!s.includes("rmSync")) {
    s = s.replace('import { join } from "node:path";', 'import { join } from "node:path";\nimport { existsSync, rmSync } from "node:fs";');
  }
}

fs.writeFileSync(p, s, "utf8");
console.log("cleanup function added");
console.log("rmSync imported:", s.includes("rmSync"));
