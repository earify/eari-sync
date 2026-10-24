const fs = require("fs");
const p = "server/src/index.ts";
let s = fs.readFileSync(p, "utf8");

// 1) broadcast with excludeCid
s = s.replace(
  `function broadcast(vaultId: string, seq: number): void {
  const set = WS_CLIENTS.get(vaultId);
  if (!set) return;
  const msg = JSON.stringify({ type: "change", vaultId, seq });
  for (const ws of set) {
    try { ws.send(msg); } catch {}
  }
}`,
  `function broadcast(vaultId: string, seq: number, excludeCid?: string): void {
  const set = WS_CLIENTS.get(vaultId);
  if (!set) return;
  const msg = JSON.stringify({ type: "change", vaultId, seq });
  for (const ws of set) {
    if (excludeCid && (ws as any).cid === excludeCid) continue;
    try { ws.send(msg); } catch {}
  }
}`
);

// 2) ws handler: store cid
s = s.replace(
  `      if (!WS_CLIENTS.has(vaultId)) WS_CLIENTS.set(vaultId, new Set());
      WS_CLIENTS.get(vaultId)!.add(socket);`,
  `      (socket as any).cid = (req.query as any).cid || "";
      if (!WS_CLIENTS.has(vaultId)) WS_CLIENTS.set(vaultId, new Set());
      WS_CLIENTS.get(vaultId)!.add(socket);`
);

// 3) routes pass clientId to broadcast
s = s.replace(/const seq = getSeq\(db, vaultId\);\s*\n(\s*)broadcast\(vaultId, seq\);/g,
  (m, ind) => `const seq = getSeq(db, vaultId);\n${ind}broadcast(vaultId, seq, clientId);`);
// restore route uses inline client id expression; normalize its broadcast too
s = s.replace(/broadcast\(vaultId, seq, clientId\);(\s*\/\/)?/g, (m) => m);

fs.writeFileSync(p, s, "utf8");
console.log("broadcast patched. counts:",
  (s.match(/broadcast\(vaultId, seq, clientId\)/g) || []).length,
  "plain left:", (s.match(/broadcast\(vaultId, seq\);/g) || []).length);
