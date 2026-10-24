const fs = require("fs");
const p = "server/src/index.ts";
let s = fs.readFileSync(p, "utf8");
const anchor = `    const existing = getFileRow(db, vaultId, from);
    if (!existing) return reply.code(404).send({ error: "not found" });
    if (getFileRow(db, vaultId, to)) return reply.code(409).send({ error: "destination exists" });`;
if (!s.includes(anchor)) { console.log("move anchor not found"); process.exit(1); }
const insert = anchor + `
    if (baseVersion && existing.version !== baseVersion) {
      // stale move: another device has newer content at the source path
      return reply.code(409).send({
        error: "conflict",
        path: from,
        serverVersion: existing.version,
        clientVersion: baseVersion,
      });
    }`;
s = s.replace(anchor, insert);
fs.writeFileSync(p, s, "utf8");
console.log("move baseVersion check added:", s.includes("stale move"));
