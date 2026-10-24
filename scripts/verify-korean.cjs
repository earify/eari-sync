const fs = require("fs");
const s = fs.readFileSync("plugin/src/sync-engine.ts", "utf8");
console.log("동기화 중:", s.includes("동기화 중"));
console.log("변경사항 적용:", s.includes("변경사항 적용"));
console.log("완료 —:", s.includes("완료 —"));
console.log("오류 —:", s.includes("오류 —"));
console.log("stats fields:", ["up: 0, down: 0, conflicts: 0"].every(x => s.includes(x)));
