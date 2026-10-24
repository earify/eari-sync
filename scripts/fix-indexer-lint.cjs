const fs = require("fs");
const p = "plugin/src/indexer.ts";
let s = fs.readFileSync(p, "utf8");

// move the disable pair to cover the window.require interop lines (75-97)
s = s.replace(
  `    try {
      const req = (window as any).require;
      const fs = req?.("fs");
      const pathMod = req?.("path");
      if (fs && pathMod) {
      /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument -- Node fs interop; desktop-only path guarded by FileSystemAdapter instanceof check */`,
  `    try {
      /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument -- Node fs interop; desktop-only path guarded by FileSystemAdapter instanceof check */
      const req = (window as any).require;
      const fs = req?.("fs");
      const pathMod = req?.("path");
      if (fs && pathMod) {`
);

// typed adapter.list result in the fallback walk
s = s.replace(
  `  const out: DirEntry[] = [];
  const walk = async (d: string): Promise<void> => {
    let res: any;
    try { res = await adapter.list(d); } catch (e) { /* missing dir */ return; }
    for (const f of Object.keys(res.files ?? {})) {
      out.push({ path: String(f).replace(/\\\\/g, "/"), isFolder: false });
    }
    for (const sub of res.folders ?? []) {
      const p = String(sub).replace(/\\\\/g, "/").replace(/\\/$/, "");
      out.push({ path: p, isFolder: true });
      await walk(p);
    }
  };`,
  `  const out: DirEntry[] = [];
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
      /* missing or unreadable dir */
    }
  };`
);
fs.writeFileSync(p, s, "utf8");
console.log("indexer patched");
