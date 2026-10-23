const fs = require("fs");
const p = "plugin/src/sync-engine.ts";
let s = fs.readFileSync(p, "utf8");

// show current corrupted lines for reference
const lines = s.split("\n");
lines.forEach((l, i) => {
  if (l.includes("stats.down > 0") || l.includes("const summary") || l.includes("onProgress?.(\"") || l.includes("onProgress?.(`")) {
    console.log(i + 1, JSON.stringify(l.trim().slice(0, 80)));
  }
});

// fix corrupted Korean strings in syncNow
s = s.replace(/onProgress\?\.\("[^"]*"\);(\s*\/\/)?/, 'onProgress?.("동기화 중… (변경사항 확인)");');
s = s.replace(/onProgress\?\.\(this\.stats\.down > 0 \? `[^`]*` : "[^"]*"\);/, 'onProgress?.(this.stats.down > 0 ? `변경사항 적용 (↓${this.stats.down})` : "변경사항 없음, 업로드 확인 중…");');
s = s.replace(/const summary = `[^`]*` \+ \(this\.stats\.conflicts \? `[^`]*` : ""\);/, 'const summary = `완료 — ↓${this.stats.down} · ↑${this.stats.up}` + (this.stats.conflicts ? ` · 충돌 ${this.stats.conflicts}` : "");');
s = s.replace(/onProgress\?\.\(`[^`]*\$\{msg\}`\);/, 'onProgress?.(`오류 — ${msg}`);');

fs.writeFileSync(p, s, "utf8");
console.log("--- after ---");
const t = fs.readFileSync(p, "utf8");
console.log("summary ok:", t.includes("완료 —"));
console.log("progress ok:", t.includes("동기화 중"));
console.log("error ok:", t.includes("오류 —"));
