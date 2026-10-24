const fs = require("fs");
const p = "server/src/main.ts";
let s = fs.readFileSync(p, "utf8");
s = s.replace('import { existsSync, readFileSync } from "node:fs";\r\n', "");
s = s.replace('import { existsSync, readFileSync } from "node:fs";\n', "");
s = s.replace('import { mkdirSync, existsSync } from "node:fs";', 'import { mkdirSync, existsSync, readFileSync } from "node:fs";');
fs.writeFileSync(p, s, "utf8");
console.log(s.split("\n").slice(0, 8).join("\n"));
