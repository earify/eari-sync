const fs = require("fs");

// ---------- sync-engine: ConflictInfo + DataAdapter typing ----------
let s = fs.readFileSync("plugin/src/sync-engine.ts", "utf8");
s = s.replace(
  'import { ApiClient, ConflictError, type RemoteChange } from "./api.js";',
  'import { ApiClient, ConflictError, type ConflictInfo, type RemoteChange } from "./api.js";'
);
s = s.replace("private async handleConflict(path: string, info: any): Promise<void> {", "private async handleConflict(path: string, info: ConflictInfo): Promise<void> {");
s = s.replace("if (e instanceof ConflictError) await this.handleConflict(p, (e as ConflictError).info);", "if (e instanceof ConflictError) await this.handleConflict(p, (e as ConflictError).info);");
// DataAdapter instead of any
s = s.replace("  const adapter = vault.adapter as any;\n", "  const adapter = vault.adapter;\n");
// catch (e: any) -> typed
s = s.replace("      } catch (e: any) {\n        console.error", "      } catch (e) {\n        logError");
s = s.replace("catch (e: any) {\n        logError", "catch (e) {\n        logError");
s = s.replace(/catch \(e: any\) \{/g, "catch (e) {");
// error message extraction now that e is unknown
s = s.replace("const msg = e?.message ?? String(e);", "const msg = e instanceof Error ? e.message : String(e);");
s = s.replace("console.error(\"sync error\", e);", "");
// window timers already applied; fix any stragglers
s = s.replace(/(?<![.\w])(setTimeout|setInterval|clearTimeout|clearInterval)\(/g, "window.$1(");
// empty catches
s = s.split("} catch {}").join("} catch (e) { /* ignore */ }");
s = s.replace("try { await vault.adapter.remove(path); } catch {}", "try { await vault.adapter.remove(path); } catch (e) { /* missing is fine */ }");
s = s.replace("try { await vault.createFolder(cur); } catch {}", "try { await vault.createFolder(cur); } catch (e) { /* already exists */ }");
s = s.replace("try { if (!(await vault.adapter.exists(cur))) await vault.adapter.mkdir(cur); } catch {}", "try { if (!(await vault.adapter.exists(cur))) await vault.adapter.mkdir(cur); } catch (e) { /* best effort */ }");
s = s.replace("try { this.ws.close(); } catch {}", "try { this.ws.close(); } catch (e) { /* already closed */ }");
fs.writeFileSync("plugin/src/sync-engine.ts", s, "utf8");
console.log("sync-engine typed");

// ---------- main.ts: App type + require interop disables ----------
let m = fs.readFileSync("plugin/src/main.ts", "utf8");
m = m.replace('import { Plugin, PluginSettingTab, Setting, Notice } from "obsidian";', 'import { Plugin, PluginSettingTab, Setting, Notice, type App } from "obsidian";');
m = m.replace("constructor(app: any, plugin: EariSyncPlugin) {", "constructor(app: App, plugin: EariSyncPlugin) {");
m = m.replace(
  "      const req = (window as any).require;",
  "      // eslint-disable-next-line @typescript-eslint/no-explicit-any\n      const req = (window as any).require;"
);
fs.writeFileSync("plugin/src/main.ts", m, "utf8");
console.log("main.ts typed");

// ---------- esbuild: remove builtin-modules dep ----------
const e = "plugin/esbuild.config.mjs";
let es = fs.readFileSync(e, "utf8");
if (es.includes("builtin-modules")) {
  es = es.replace('import builtins from "builtin-modules";\n', "");
  es = es.replace("    ...builtins,\n", "    \"assert\", \"buffer\", \"child_process\", \"cluster\", \"console\", \"constants\", \"crypto\",\n    \"dgram\", \"dns\", \"domain\", \"events\", \"http\", \"http2\", \"https\", \"inspector\", \"module\",\n    \"net\", \"os\", \"path\", \"perf_hooks\", \"process\", \"punycode\", \"querystring\", \"readline\",\n    \"repl\", \"stream\", \"string_decoder\", \"timers\", \"tls\", \"tty\", \"url\", \"util\", \"v8\",\n    \"vm\", \"worker_threads\", \"zlib\",");
  fs.writeFileSync(e, es, "utf8");
  console.log("esbuild externals inlined");
}
const pk = "plugin/package.json";
let pj = fs.readFileSync(pk, "utf8");
pj = pj.replace(/\s*"builtin-modules": "[^"]+",/, "");
fs.writeFileSync(pk, pj, "utf8");
console.log("builtin-modules dep removed");
