const fs = require("fs");
const p = "server/src/index.ts";
let s = fs.readFileSync(p, "utf8");
const before = "broadcast(vaultId, seq, clientId);";
if (!s.includes(before)) { console.log("nothing to fix"); process.exit(0); }
// replace with header-based clientId (works regardless of line endings)
s = s.split(before).join('broadcast(vaultId, seq, (req.headers["x-client-id"] as string) || "");');
fs.writeFileSync(p, s, "utf8");
console.log("fixed:", !fs.readFileSync(p, "utf8").includes(before));
