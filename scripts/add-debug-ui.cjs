const fs = require("fs");
const p = "src/main.ts";
let s = fs.readFileSync(p, "utf8");
if (s.includes('"Debug mode"')) { console.log("already there"); process.exit(0); }

// add debug toggle under advanced excludes
const anchor = 'new Setting(containerEl).setName("Sync now")';
if (!s.includes(anchor)) { console.log("anchor missing"); process.exit(1); }
const add = `new Setting(containerEl)
      .setName("Debug 로그")
      .setDesc("문제 분석용 상세 로그를 콘솔에 출력합니다")
      .addToggle((t) => t.setValue(this.plugin.settings.debug ?? false)
        .onChange(async (v) => {
          this.plugin.settings.debug = v;
          setDebug(v);
          await this.plugin.saveSettings();
        }));

    ` + anchor;
s = s.replace(anchor, add);
fs.writeFileSync(p, s, "utf8");
console.log("debug toggle added");

// sentence-case fixes for English UI labels flagged by the linter
s = s.replace('setName("Vault Secret")', 'setName("Vault secret")');
fs.writeFileSync(p, s, "utf8");
console.log("sentence case fixed");
