const fs = require("fs");
const p = "plugin/src/sync-engine.ts";
let lines = fs.readFileSync(p, "utf8").split("\n");

const insertAfter = (needle, addLines) => {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(needle)) {
      lines.splice(i + 1, 0, ...addLines);
      return true;
    }
  }
  return false;
};

let ok = true;
// 1) create/modify download success (line with fileIndex[path] = { version, hash };)
ok = insertAfter('      this.settings.fileIndex[path] = { version, hash };', ['      this.stats.down++;']) && ok;
// 2) .obsidian delete branch
ok = insertAfter('if (typeof c.version === "number") this.settings.deletedSeen[path] = c.version;', ['      this.stats.down++;']) && ok;
// 3) normal delete branch (the multi-line one) - insert after its closing "}" line: "      }" following deletedSeen[path] = c.version; inside if block
for (let i = 0; i < lines.length; i++) {
  if (lines[i].trim() === 'this.settings.deletedSeen[path] = c.version;' && lines[i+1] && lines[i+1].trim() === '}') {
    lines.splice(i + 2, 0, '      this.stats.down++;');
    break;
  }
}
// 4) handleConflict entry
ok = insertAfter('this.deps.onStatus("conflict");', ['    this.stats.conflicts++;']) && ok;
// 5) pushDeletes success
ok = insertAfter('await this.api.remove(p, idx.version);', ['        this.stats.up++;']) && ok;

fs.writeFileSync(p, lines.join("\n"), "utf8");
const s = fs.readFileSync(p, "utf8");
console.log("ok:", ok);
console.log("down++:", (s.match(/this\.stats\.down\+\+/g) || []).length);
console.log("up++:", (s.match(/this\.stats\.up\+\+/g) || []).length);
console.log("conflicts++:", (s.match(/this\.stats\.conflicts\+\+/g) || []).length);
