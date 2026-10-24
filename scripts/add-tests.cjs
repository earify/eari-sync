const fs = require("fs");
const p = "server/tests/basic.test.ts";
let s = fs.readFileSync(p, "utf8");
const anchor = 'describe("deletion propagation"';
if (!s.includes(anchor)) { console.log("anchor missing"); process.exit(1); }
const add = `describe("upload idempotency and move conflicts", () => {
  it("does not bump version for identical content", async () => {
    const h = { ...hdr({ "x-base-version": "0", "x-mtime": String(Date.now()), "content-type": "application/octet-stream" }) };
    const up = await app.inject({ method: "PUT", url: \`/api/v1/vaults/\${VAULT}/files/idem.md\`, headers: h, payload: Buffer.from("same") });
    expect(up.statusCode).toBe(200);
    const v1 = up.json().version;
    const again = await app.inject({
      method: "PUT",
      url: \`/api/v1/vaults/\${VAULT}/files/idem.md\`,
      headers: { ...hdr({ "x-base-version": String(v1), "x-mtime": String(Date.now()), "content-type": "application/octet-stream" }) },
      payload: Buffer.from("same"),
    });
    expect(again.statusCode).toBe(200);
    expect(again.json().status).toBe("unchanged");
    expect(again.json().version).toBe(v1);
  });

  it("move with stale baseVersion returns 409", async () => {
    const h = { ...hdr({ "x-base-version": "0", "x-mtime": String(Date.now()), "content-type": "application/octet-stream" }) };
    await app.inject({ method: "PUT", url: \`/api/v1/vaults/\${VAULT}/files/mv/a.md\`, headers: h, payload: Buffer.from("m1") });
    await app.inject({
      method: "PUT",
      url: \`/api/v1/vaults/\${VAULT}/files/mv/a.md\`,
      headers: { ...hdr({ "x-base-version": "1", "x-mtime": String(Date.now()), "content-type": "application/octet-stream" }) },
      payload: Buffer.from("m2 newer"),
    });
    const mv = await app.inject({
      method: "POST",
      url: \`/api/v1/vaults/\${VAULT}/move\`,
      headers: { ...hdr({ "content-type": "application/json" }) },
      body: JSON.stringify({ from: "mv/a.md", to: "mv/b.md", baseVersion: 1 }),
    });
    expect(mv.statusCode).toBe(409);
  });
});

` + anchor;
s = s.replace(anchor, add);
fs.writeFileSync(p, s, "utf8");
console.log("tests added");
