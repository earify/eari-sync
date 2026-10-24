const fs = require("fs");
const p = "plugin/src/sync-engine.ts";
let s = fs.readFileSync(p, "utf8");
s = s.replace(
  "        const existing = vault.getAbstractFileByPath(path);\n        if (existing) {\n          await vault.modifyBinary(existing, data);",
  "        const existing = vault.getAbstractFileByPath(path);\n        if (existing instanceof TFile) {\n          await vault.modifyBinary(existing, data);"
);
s = s.replace(
  "        const f = vault.getAbstractFileByPath(path);\n        const clientData = f ? await this.deps.vault.readBinary(f) : null;\n        const clientHash = clientData ? await sha256ArrayBuffer(clientData) : \"\";\n        const locallyModified",
  "        const f = vault.getAbstractFileByPath(path);\n        const clientData = f instanceof TFile ? await this.deps.vault.readBinary(f) : null;\n        const clientHash = clientData ? await sha256ArrayBuffer(clientData) : \"\";\n        const locallyModified"
);
s = s.replace(
  "      const f = vault.getAbstractFileByPath(path);\n      const clientData = f ? await this.deps.vault.readBinary(f) : null;\n      const clientHash = clientData ? await sha256ArrayBuffer(clientData) : \"\";\n      // write server version to original path\n      this.watcher.markWritten(path);\n      if (f) await this.deps.vault.modifyBinary(f, serverData);",
  "      const f = vault.getAbstractFileByPath(path);\n      const clientData = f instanceof TFile ? await this.deps.vault.readBinary(f) : null;\n      const clientHash = clientData ? await sha256ArrayBuffer(clientData) : \"\";\n      // write server version to original path\n      this.watcher.markWritten(path);\n      if (f instanceof TFile) await this.deps.vault.modifyBinary(f, serverData);"
);
fs.writeFileSync(p, s, "utf8");
console.log("guards fixed");
