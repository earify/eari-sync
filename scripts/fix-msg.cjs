const fs = require("fs");
const p = "plugin/src/sync-engine.ts";
let s = fs.readFileSync(p, "utf8");
s = s.replace("      const msg = String(e?.message ?? e);", "      const msg = e instanceof Error ? e.message : String(e);");
fs.writeFileSync(p, s, "utf8");
console.log("fixed");
