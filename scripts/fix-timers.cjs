const fs = require("fs");

let s = fs.readFileSync("plugin/src/sync-engine.ts", "utf8");
s = s.replace("private saveTimer: any = null;", "private saveTimer: number | null = null;");
s = s.replace("private wsReconnectTimer: any = null;", "private wsReconnectTimer: number | null = null;");
s = s.replace("private wsPullTimer: any = null;", "private wsPullTimer: number | null = null;");
s = s.replace("if (this.saveTimer) { window.clearTimeout", "if (this.saveTimer !== null) { window.clearTimeout");
s = s.replace("if (this.wsReconnectTimer) { window.clearTimeout", "if (this.wsReconnectTimer !== null) { window.clearTimeout");
s = s.replace("if (this.wsPullTimer) { window.clearTimeout", "if (this.wsPullTimer !== null) { window.clearTimeout");
s = s.replace("if (this.wsPullTimer) return;", "if (this.wsPullTimer !== null) return;");
s = s.replace("(e as ConflictError).info", "e.info");
fs.writeFileSync("plugin/src/sync-engine.ts", s, "utf8");
console.log("sync-engine timers typed");

let w = fs.readFileSync("plugin/src/watcher.ts", "utf8");
w = w.replace('import { TAbstractFile, type Vault } from "obsidian";', 'import { TAbstractFile, type EventRef, type Vault } from "obsidian";');
w = w.replace("private refs: any[] = [];", "private refs: EventRef[] = [];")
fs.writeFileSync("plugin/src/watcher.ts", w, "utf8");
console.log("watcher refs typed");

let m = fs.readFileSync("plugin/src/main.ts", "utf8");
m = m.split("await this.display();").join("void this.display();");
fs.writeFileSync("plugin/src/main.ts", m, "utf8");
console.log("main display calls fixed");

const c = "plugin/eslint.config.mjs";
let e = fs.readFileSync(c, "utf8");
e = e.replace(
  'files: ["src/logger.ts"],\n    rules: {\n      "no-console": "off",\n    },',
  'files: ["src/logger.ts"],\n    rules: {\n      "no-console": "off",\n      "obsidianmd/rule-custom-message": "off",\n    },'
);
fs.writeFileSync(c, e, "utf8");
console.log("eslint logger override extended");
