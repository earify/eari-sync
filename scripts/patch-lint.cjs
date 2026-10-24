const fs = require("fs");

function patch(p, fns) {
  let s = fs.readFileSync(p, "utf8");
  for (const fn of fns) s = fn(s);
  fs.writeFileSync(p, s, "utf8");
  console.log("patched", p);
}

// ---------- sync-engine ----------
patch("plugin/src/sync-engine.ts", [
  // imports + start(): configDir from vault
  (s) => s.replace(
    'import { sha256ArrayBuffer } from "./hash.js";',
    'import { sha256ArrayBuffer } from "./hash.js";\nimport { log, warn, error as logError } from "./logger.js";'
  ),
  (s) => s.replace(
    "    this.api.update(this.settings);\n    this.watcher.start();",
    "    this.api.update(this.settings);\n    this.settings.configDir = (this.deps.vault as any).configDir || \".obsidian\";\n    this.watcher.start();"
  ),
  // logger replacements
  (s) => s.split("console.error(").join("logError(").split("console.warn(").join("warn(").split("console.log(").join("log("),
  // timers -> window.*
  (s) => s.replace(/(?<![.\w])(setTimeout|setInterval|clearTimeout|clearInterval)\(/g, "window.$1("),
  // configDir prefix helper
  (s) => s.replace(
    "  private maxBytes(): number {",
    "  private cfgPrefix(): string {\n    return (this.settings.configDir || \".obsidian\") + \"/\";\n  }\n\n  private maxBytes(): number {"
  ),
  (s) => s.replace('listDirRecursive(this.deps.vault, ".obsidian")', "listDirRecursive(this.deps.vault, this.settings.configDir || \".obsidian\")"),
  (s) => s.replace('!f.path.startsWith(".obsidian/")', "!f.path.startsWith(this.cfgPrefix())"),
  (s) => s.replace('if (path.startsWith(".obsidian/")) {', "if (path.startsWith(this.cfgPrefix())) {"),
  (s) => s.replace('if (oldPath.startsWith(".obsidian/")) {', "if (oldPath.startsWith(this.cfgPrefix())) {"),
  // empty catch blocks -> comment-bearing (no-empty allows comments)
  (s) => s.replace("catch {}", "catch (e) { /* ignore */ }"),
  (s) => s.replace("catch {}\n", "catch (e) { /* ignore */ }\n"),
  (s) => s.replace("catch { /* ignore */ }", "catch (e) { /* ignore */ }"),
  (s) => s.replace("} catch (e) { /* ignore */ } }", "} catch (e) { /* ignore */ } }"),
  (s) => s.replace("try { await vault.adapter.remove(path); } catch {}", "try { await vault.adapter.remove(path); } catch (e) { /* missing is fine */ }"),
  (s) => s.replace("try { await vault.createFolder(cur); } catch {}", "try { await vault.createFolder(cur); } catch (e) { /* already exists */ }"),
  (s) => s.replace("try { if (!(await vault.adapter.exists(cur))) await vault.adapter.mkdir(cur); } catch {}", "try { if (!(await vault.adapter.exists(cur))) await vault.adapter.mkdir(cur); } catch (e) { /* best effort */ }"),
  (s) => s.replace("try { this.ws.close(); } catch {}", "try { this.ws.close(); } catch (e) { /* already closed */ }"),
  (s) => s.replace("try { ws.send(JSON.stringify({ type: \"ping\" })); } catch {}", "try { ws.send(JSON.stringify({ type: \"ping\" })); } catch (e) { /* socket gone */ }"),
]);

// ---------- api.ts ----------
patch("plugin/src/api.ts", [
  (s) => s.replace(/(?<![.\w])(setTimeout|setInterval|clearTimeout|clearInterval)\(/g, "window.$1("),
  (s) => s.replace("try { ws.close(); } catch {}", "try { ws.close(); } catch (e) { /* already closed */ }"),
  (s) => s.replace("try { ws.send(JSON.stringify({ type: \"ping\" })); } catch {}", "try { ws.send(JSON.stringify({ type: \"ping\" })); } catch (e) { /* socket gone */ }"),
]);

// ---------- watcher.ts ----------
patch("plugin/src/watcher.ts", [
  (s) => s.replace(/(?<![.\w])(setTimeout|setInterval|clearTimeout|clearInterval)\(/g, "window.$1("),
]);

// ---------- main.ts ----------
patch("plugin/src/main.ts", [
  (s) => s.replace(
    'import { listDirRecursive, isExcluded, BASE_EXCLUDES, type DirEntry } from "./indexer.js";',
    'import { listDirRecursive, isExcluded, baseExcludes, type DirEntry } from "./indexer.js";\nimport { setDebug } from "./logger.js";'
  ),
  (s) => s.replace(
    "  isAlwaysExcluded(rel: string): boolean {\n    const p = \".obsidian/\" + rel;\n    return isExcluded(p, BASE_EXCLUDES) || isExcluded(p + \"/\", BASE_EXCLUDES) || rel.startsWith(\"workspace\");\n  }",
    "  isAlwaysExcluded(rel: string): boolean {\n    const cd = this.app.vault.configDir || \".obsidian\";\n    const p = cd + \"/\" + rel;\n    const base = baseExcludes(cd);\n    return isExcluded(p, base) || isExcluded(p + \"/\", base) || rel === \"workspace\" || rel === \"workspace.json\" || rel === \"workspace-mobile.json\";\n  }"
  ),
  // timers -> window.*
  (s) => s.replace(/(?<![.\w])(setTimeout|setInterval|clearTimeout|clearInterval)\(/g, "window.$1("),
  // debug toggle on load
  (s) => s.replace(
    "      await this.plugin.saveSettings();\n    }\n\n    this.statusEl = this.addStatusBarItem();",
    "      await this.plugin.saveSettings();\n    }\n    setDebug(!!this.settings.debug);\n\n    this.statusEl = this.addStatusBarItem();"
  ),
  // configDir in the .obsidian tree UI
  (s) => s.replace('const all = await listDirRecursive(this.app.vault, ".obsidian");', "const cd = this.app.vault.configDir || \".obsidian\";\n        const all = (await listDirRecursive(this.app.vault, cd)).filter((e) => e.path.startsWith(cd + \"/\"));"),
  (s) => s.replace('f.slice(".obsidian/".length)', "f.slice(cd.length + 1)"),
  (s) => s.replace('d.slice(".obsidian/".length).replace(/\\/$/, "")', "d.slice(cd.length + 1).replace(/\\/$/, \"\")"),
]);
