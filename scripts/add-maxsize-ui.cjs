const fs = require("fs");
const p = "src/main.ts";
let s = fs.readFileSync(p, "utf8");
if (s.includes("maxFileSizeMB")) { console.log("already there"); process.exit(0); }
const anchor = 'new Setting(containerEl).setName("Sync mode")';
if (!s.includes(anchor)) { console.log("anchor missing"); process.exit(1); }
const add = `new Setting(containerEl).setName("최대 파일 크기 (MB, 초과 스킵)")
      .setDesc("이 크기를 넘는 파일은 메모리 보호를 위해 동기화하지 않습니다")
      .addText((t) => t.setValue(String(this.plugin.settings.maxFileSizeMB ?? 50))
        .onChange(async (v) => {
          const n = Number(v);
          this.plugin.settings.maxFileSizeMB = Number.isFinite(n) && n > 0 ? n : 50;
          await this.plugin.saveSettings();
        }));

    ` + anchor;
s = s.replace(anchor, add);
fs.writeFileSync(p, s, "utf8");
console.log("maxFileSizeMB setting UI added");
