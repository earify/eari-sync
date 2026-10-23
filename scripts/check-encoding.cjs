const fs = require("fs");
const s = fs.readFileSync(process.argv[2], "utf8");
const lines = s.split("\n");
const bad = [];
lines.forEach((l, i) => {
  if (/\?\?\?|\?\? /.test(l) && !l.includes("?? ")) {
    // detect replacement-character corruption
  }
  if (l.includes("\uFFFD")) bad.push(i + 1);
});
console.log("lines with U+FFFD:", bad.join(",") || "none");
console.log("has 폴더:", s.includes("폴더"));
console.log("has 항목 선택:", s.includes("항목 선택"));
console.log("has 설정 폴더 동기화:", s.includes("설정 폴더 동기화"));
console.log("has 고급:", s.includes("고급"));
