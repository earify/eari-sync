const fs = require("fs");
const p = "plugin/src/main.ts";
let s = fs.readFileSync(p, "utf8");

// onunload: void sync
s = s.replace(
  "  async onunload(): Promise<void> {\n    if (this.engine) { await this.engine.stop(); this.engine = null; }\n  }",
  "  onunload(): void {\n    if (this.engine) { void this.engine.stop().then(() => { this.engine = null; }); }\n  }"
);
// floating promise in onLayoutReady
s = s.replace(
  "      if (this.settings.autoSync && this.isConfigured()) {\n        this.startEngine();\n      }",
  "      if (this.settings.autoSync && this.isConfigured()) {\n        void this.startEngine();\n      }"
);
// logger for onProgress
s = s.replace('onProgress: (m) => console.log("eari-sync:", m),', "onProgress: (m) => log(m),");
s = s.replace('import { setDebug } from "./logger.js";', 'import { setDebug, log } from "./logger.js";');
// typed catch in syncNow
s = s.replace(
  "    } catch (e: any) {\n      notice.setMessage(\"eari-sync: 동기화 실패 — \" + (e?.message ?? String(e)));",
  "    } catch (e) {\n      notice.setMessage(\"eari-sync: 동기화 실패 — \" + (e instanceof Error ? e.message : String(e)));"
);
// headings via Setting().setHeading()
s = s.replace('containerEl.createEl("h2", { text: "eari-sync" });', 'new Setting(containerEl).setName("eari-sync").setHeading();');
s = s.replace('containerEl.createEl("h3", { text: ".obsidian 동기화 항목 선택" });', 'new Setting(containerEl).setName(".obsidian 동기화 항목 선택").setHeading();');
// styles -> classes (defined in styles.css)
s = s.replace('const note = containerEl.createEl("p");\n      note.setText("workspace* 파일은 기기별 고유 설정이라 항상 제외됩니다. 폴더는 통째로 포함/제외됩니다.");\n      note.style.fontSize = "0.85em";\n      note.style.opacity = "0.7";', 'const note = containerEl.createEl("p");\n      note.setText("workspace* 파일은 기기별 고유 설정이라 항상 제외됩니다. 폴더는 통째로 포함/제외됩니다.");\n      note.addClass("eari-muted");');
s = s.replace('const hint = wrap.createDiv();', 'const hint = wrap.createDiv();');
s = s.replace('hint.style.fontSize = "0.8em";\n        hint.style.opacity = "0.6";\n        hint.style.marginLeft = "18px";', 'hint.addClass("eari-muted");\n        hint.addClass("eari-hint");');
s = s.replace('wrap.style.marginLeft = depth > 0 ? `${depth * 18}px` : "0";', 'wrap.style.setProperty("--eari-depth", String(depth));\n          wrap.addClass("eari-tree-item");');
// floatings in onClick handlers
s = s.replace('b.onClick(() => { if (isOpen) this.expanded.delete(node.relPath); else this.expanded.add(node.relPath); this.display(); });',
  'b.onClick(() => { if (isOpen) this.expanded.delete(node.relPath); else this.expanded.add(node.relPath); void this.display(); });');
s = s.replace('.onClick(() => this.plugin.testConnection())', '.onClick(() => { void this.plugin.testConnection(); })');
s = s.replace('.onClick(() => this.plugin.syncNow())', '.onClick(() => { void this.plugin.syncNow(); })');
// floating this.display() in toggle handlers -> await
s = s.replace(/\.onChange\(async \(v\) => \{ this\.plugin\.settings\.syncObsidian = v; await this\.plugin\.saveSettings\(\); this\.display\(\); \}\}/,
  ".onChange(async (v) => { this.plugin.settings.syncObsidian = v; await this.plugin.saveSettings(); await this.display(); })");

fs.writeFileSync(p, s, "utf8");
console.log("main.ts lint fixes applied");
