const fs = require("fs");
const p = "plugin/src/indexer.ts";
let s = fs.readFileSync(p, "utf8");
const marker = "export async function listDirRecursive";
const idx = s.indexOf(marker);
if (idx < 0) { console.log("marker missing"); process.exit(1); }
const head = s.slice(0, idx);
const fn = `export async function listDirRecursive(vault: Vault, dir: string): Promise<DirEntry[]> {
  const adapter = vault.adapter;
  if (typeof FileSystemAdapter !== "undefined" && adapter instanceof FileSystemAdapter) {
    try {
      /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument -- Node fs interop; desktop-only path guarded by FileSystemAdapter instanceof check */
      const req = (window as any).require;
      const fs = req?.("fs");
      const pathMod = req?.("path");
      if (fs && pathMod) {
        const out: DirEntry[] = [];
        const base = adapter.getBasePath();
        const walk = (abs: string, rel: string): void => {
          const items = fs.readdirSync(abs, { withFileTypes: true });
          for (const it of items) {
            const r = rel ? rel + "/" + it.name : it.name;
            const absChild = pathMod.join(abs, it.name);
            if (it.isDirectory()) {
              out.push({ path: r, isFolder: true });
              walk(absChild, r);
            } else if (it.isFile()) {
              out.push({ path: r, isFolder: false });
            }
          }
        };
        walk(pathMod.join(base, dir), dir);
        return out;
      }
      /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument -- Node fs interop */
    } catch (e) {
      // fall through to adapter listing
    }
  }
  const out: DirEntry[] = [];
  const walk = async (d: string): Promise<void> => {
    try {
      const res = await adapter.list(d);
      for (const f of Object.keys(res.files)) {
        out.push({ path: String(f).replace(/\\\\/g, "/"), isFolder: false });
      }
      for (const sub of res.folders) {
        const pp = String(sub).replace(/\\\\/g, "/").replace(/\\/$/, "");
        out.push({ path: pp, isFolder: true });
        await walk(pp);
      }
    } catch (e) {
      // missing or unreadable directory
    }
  };
  await walk(dir);
  return out;
}
`;
fs.writeFileSync(p, head + fn, "utf8");
console.log("listDirRecursive rewritten");

// sync-engine: fix ALL remaining unnecessary assertions (global)
const q = "plugin/src/sync-engine.ts";
let t = fs.readFileSync(q, "utf8");
t = t.split("(e as ConflictError).info").join("e.info");
fs.writeFileSync(q, t, "utf8");
console.log("sync-engine assertions cleaned:", !t.includes("(e as ConflictError).info"));
