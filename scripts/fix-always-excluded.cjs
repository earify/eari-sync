const fs = require("fs");
const p = "plugin/src/main.ts";
let s = fs.readFileSync(p, "utf8");
s = s.replace(
  `  private isAlwaysExcluded(rel: string): boolean {
    const p = ".obsidian/" + rel;
    return isExcluded(p, BASE_EXCLUDES) || isExcluded(p + "/", BASE_EXCLUDES) || rel.startsWith("workspace");
  }`,
  `  private isAlwaysExcluded(rel: string): boolean {
    const cd = this.app.vault.configDir || ".obsidian";
    const p = cd + "/" + rel;
    const base = baseExcludes(cd);
    return isExcluded(p, base) || isExcluded(p + "/", base) || rel === "workspace" || rel === "workspace.json" || rel === "workspace-mobile.json";
  }`
);
fs.writeFileSync(p, s, "utf8");
console.log("isAlwaysExcluded fixed:", !s.includes("BASE_EXCLUDES"));
