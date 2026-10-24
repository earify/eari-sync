const fs = require("fs");
const p = "server/src/index.ts";
let s = fs.readFileSync(p, "utf8");
const before = s;

// find the block from "    // conflict check" through the "hash mismatch" block, replace wholesale
const start = s.indexOf("    // conflict check");
const endMarker = '      return reply.code(400).send({ error: "hash mismatch" });\n    }';
const end = s.indexOf(endMarker, start);
if (start < 0 || end < 0) { console.log("markers not found", start, end); process.exit(1); }
const replacement = `    const bodyBuf = req.body as Buffer;
    if (!Buffer.isBuffer(bodyBuf)) return reply.code(400).send({ error: "expected binary body" });
    const contentHash = sha256Buffer(bodyBuf);
    if (clientHash && clientHash !== contentHash) {
      return reply.code(400).send({ error: "hash mismatch" });
    }

    // identical content already stored (and not deleted) -> idempotent no-op
    if (existing && existing.deleted === 0 && existing.hash === contentHash) {
      return { path, version: existing.version, seq: getSeq(db, vaultId), status: "unchanged" };
    }

    // conflict check (server has different, newer content)
    if (existing && existing.deleted === 0 && baseVersion && existing.version !== baseVersion) {
      return reply.code(409).send({
        error: "conflict",
        path,
        serverVersion: existing.version,
        serverHash: existing.hash,
        serverSize: existing.size,
        serverMtime: existing.mtime,
        clientVersion: baseVersion,
      });
    }
`;
s = s.slice(0, start) + replacement + s.slice(end + endMarker.length);
fs.writeFileSync(p, s, "utf8");
console.log("upload route rewritten:", s !== before);
console.log("later refs to old 'hash' var (recordChange) need check:", /hash: res\.hash/.test(s));
