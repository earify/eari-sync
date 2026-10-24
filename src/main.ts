import { Plugin, PluginSettingTab, Setting, Notice, type App } from "obsidian";
import { DEFAULT_SETTINGS, type EariSettings } from "./settings.js";
import { ApiClient } from "./api.js";
import { SyncEngine } from "./sync-engine.js";
import { listDirRecursive, isExcluded, baseExcludes, type DirEntry } from "./indexer.js";
import { setDebug, log } from "./logger.js";
import { STATUS_LABELS, type SyncStatus } from "./status.js";

export default class EariSyncPlugin extends Plugin {
  settings: EariSettings = { ...DEFAULT_SETTINGS };
  engine: SyncEngine | null = null;
  statusEl: HTMLElement | null = null;
  status: SyncStatus = "idle";

  async onload(): Promise<void> {
    await this.loadSettings();
    if (!this.settings.deviceId) {
      this.settings.deviceId = crypto.randomUUID();
      await this.saveSettings();
    }
    setDebug(!!this.settings.debug);

    this.statusEl = this.addStatusBarItem();
    this.statusEl.setText(STATUS_LABELS.idle);
    this.statusEl.addClass("eari-sync-status");
    this.statusEl.addEventListener("click", () => new Notice(this.statusText()));

    this.addCommand({ id: "sync-now", name: "Sync now", callback: () => this.syncNow() });
    this.addCommand({ id: "test-connection", name: "Test connection", callback: () => this.testConnection() });
    this.addCommand({ id: "show-status", name: "Show sync status", callback: () => new Notice(this.statusText()) });
    this.addCommand({ id: "retry-failed", name: "Retry failed items", callback: () => this.syncNow() });

    this.addSettingTab(new EariSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      if (this.settings.autoSync && this.isConfigured()) {
        void this.startEngine();
      }
    });
  }

  onunload(): void {
    if (this.engine) {
      const eng = this.engine;
      this.engine = null;
      void eng.stop();
    }
  }

  isConfigured(): boolean {
    return !!(this.settings.serverUrl && this.settings.vaultId && this.settings.vaultSecret);
  }

  setStatus(s: SyncStatus, detail?: string): void {
    this.status = s;
    if (this.statusEl) this.statusEl.setText(STATUS_LABELS[s] + (detail ? ` (${detail})` : ""));
  }

  statusText(): string {
    return `${STATUS_LABELS[this.status]} | lastSeq=${this.settings.lastSeq} | files=${Object.keys(this.settings.fileIndex).length}`;
  }

  async loadSettings(): Promise<void> {
    const data = (await this.loadData()) as Partial<EariSettings> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data ?? {});
    if (!this.settings.fileIndex) this.settings.fileIndex = {};
    if (!this.settings.deletedSeen) this.settings.deletedSeen = {};
    // migrate legacy tombstone format (number) -> { v, t }
    for (const k of Object.keys(this.settings.deletedSeen)) {
      const legacy: unknown = this.settings.deletedSeen[k];
      if (typeof legacy === "number") this.settings.deletedSeen[k] = { v: legacy, t: Date.now() };
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async startEngine(): Promise<void> {
    if (this.engine) return;
    if (!this.isConfigured()) return;
    this.engine = new SyncEngine({
      plugin: this,
      vault: this.app.vault,
      settings: this.settings,
      saveSettings: () => this.saveSettings(),
      onStatus: (s, d) => this.setStatus(s, d),
      onProgress: (m) => log(m),
    });
    await this.engine.start();
  }

  async stopEngine(): Promise<void> {
    if (this.engine) {
      const eng = this.engine;
      this.engine = null;
      await eng.stop();
    }
  }

  async syncNow(): Promise<void> {
    if (!this.isConfigured()) { new Notice("eari-sync: enter Server URL, Vault ID and Vault secret first"); return; }
    if (!this.engine) await this.startEngine();
    if (!this.engine) { new Notice("eari-sync: could not start the sync engine"); return; }
    const notice = new Notice("eari-sync: syncing…", 0);
    try {
      await this.engine.syncNow((msg) => notice.setMessage("eari-sync: " + msg));
      window.setTimeout(() => notice.hide(), 2500);
    } catch (e) {
      notice.setMessage("eari-sync: sync failed — " + (e instanceof Error ? e.message : String(e)));
      window.setTimeout(() => notice.hide(), 5000);
    }
  }

  async testConnection(): Promise<void> {
    const api = new ApiClient(this.settings);
    const res = await api.testConnection();
    new Notice(res.ok ? "eari-sync: connection OK" : `eari-sync: ${res.error}`);
  }
}

interface ObsNode {
  name: string;
  relPath: string; // relative to the configuration folder
  isFolder: boolean;
  children: ObsNode[];
  baseExcluded: boolean;
}

class EariSettingTab extends PluginSettingTab {
  plugin: EariSyncPlugin;
  private expanded = new Set<string>();
  private treeBox: HTMLElement | null = null;

  constructor(app: App, plugin: EariSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  private configDir(): string {
    return this.app.vault.configDir;
  }

  private isIncluded(rel: string): boolean {
    const inc = this.plugin.settings.obsidianInclude ?? [];
    return inc.some((e) => (e.endsWith("/") ? rel.startsWith(e) : rel === e || rel.startsWith(e + "/")));
  }

  private isAlwaysExcluded(rel: string): boolean {
    const cd = this.configDir();
    const p = cd + "/" + rel;
    const base = baseExcludes(cd);
    return isExcluded(p, base) || isExcluded(p + "/", base) || rel === "workspace" || rel === "workspace.json" || rel === "workspace-mobile.json";
  }

  /** nearest scrollable ancestor, used to keep the scroll position across re-renders */
  private scrollParent(): HTMLElement | null {
    let el: HTMLElement | null = this.containerEl.parentElement;
    while (el) {
      if (el.scrollHeight > el.clientHeight + 4) return el;
      el = el.parentElement;
    }
    return null;
  }

  display(): void {
    const { containerEl } = this;
    const scroller = this.scrollParent();
    const scrollTop = scroller ? scroller.scrollTop : 0;
    this.treeBox = null;

    containerEl.empty();
    new Setting(containerEl).setName("Connection").setHeading();

    new Setting(containerEl).setName("Server URL").setDesc("https://your-server:8443")
      .addText((t) => t.setPlaceholder("https://example.com:8443").setValue(this.plugin.settings.serverUrl)
        .onChange(async (v) => { this.plugin.settings.serverUrl = v.trim(); await this.plugin.saveSettings(); }));

    new Setting(containerEl).setName("Vault ID").addText((t) => t.setValue(this.plugin.settings.vaultId)
      .onChange(async (v) => { this.plugin.settings.vaultId = v.trim(); await this.plugin.saveSettings(); }));

    new Setting(containerEl).setName("Vault secret").addText((t) => {
      t.inputEl.type = "password";
      t.setValue(this.plugin.settings.vaultSecret).onChange(async (v) => { this.plugin.settings.vaultSecret = v.trim(); await this.plugin.saveSettings(); });
    });

    new Setting(containerEl).setName("Test connection")
      .setDesc("Verify the URL, Vault ID and secret")
      .addButton((b) => b.setButtonText("Test").onClick(() => { void this.plugin.testConnection(); }));

    new Setting(containerEl).setName("Sync now").addButton((b) => b.setButtonText("Sync").onClick(() => { void this.plugin.syncNow(); }));

    new Setting(containerEl).setName("Behavior").setHeading();

    new Setting(containerEl).setName("Auto sync")
      .setDesc("Sync while Obsidian is open")
      .addToggle((t) => t.setValue(this.plugin.settings.autoSync)
        .onChange(async (v) => { this.plugin.settings.autoSync = v; await this.plugin.saveSettings(); if (v) await this.plugin.startEngine(); else await this.plugin.stopEngine(); }));

    new Setting(containerEl).setName("Sync mode")
      .setDesc("How quickly changes are pushed")
      .addDropdown((d) => d
        .addOption("fast", "Fast").addOption("balanced", "Balanced").addOption("saver", "Saver")
        .setValue(this.plugin.settings.syncMode)
        .onChange(async (v) => {
          this.plugin.settings.syncMode = v as EariSettings["syncMode"];
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl).setName("Max file size (MB)")
      .setDesc("Files larger than this are skipped to protect memory")
      .addText((t) => t.setValue(String(this.plugin.settings.maxFileSizeMB ?? 50))
        .onChange(async (v) => {
          const n = Number(v);
          this.plugin.settings.maxFileSizeMB = Number.isFinite(n) && n > 0 ? n : 50;
          await this.plugin.saveSettings();
        }));

    const cd = this.configDir();
    new Setting(containerEl).setName(`Sync configuration folder (${cd})`)
      .setDesc("Off by default. When enabled, pick the items to sync below")
      .addToggle((t) => t.setValue(this.plugin.settings.syncObsidian)
        .onChange(async (v) => {
          this.plugin.settings.syncObsidian = v;
          await this.plugin.saveSettings();
          this.display(); // adds/removes the whole tree section
        }));

    if (this.plugin.settings.syncObsidian) {
      new Setting(containerEl).setName("Configuration folder items").setHeading();
      const note = containerEl.createEl("p");
      note.setText("Expand folders with ▶ to select items individually. Workspace files and eari-sync's own folder are always excluded.");
      note.addClass("eari-muted");
      this.treeBox = containerEl.createDiv();
      void this.renderTree();
    }

    new Setting(containerEl).setName("Advanced").setHeading();

    new Setting(containerEl)
      .setName("Extra exclude patterns")
      .setDesc("One glob per line. Optional. Always excluded: .git, .DS_Store, Thumbs.db")
      .addTextArea((t) => t.setValue((this.plugin.settings.excludePatterns ?? []).join("\n"))
        .onChange(async (v) => { this.plugin.settings.excludePatterns = v.split("\n").map((x) => x.trim()).filter(Boolean); await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName("Debug logging")
      .setDesc("Print detailed logs to the developer console")
      .addToggle((t) => t.setValue(this.plugin.settings.debug ?? false)
        .onChange(async (v) => {
          this.plugin.settings.debug = v;
          setDebug(v);
          await this.plugin.saveSettings();
        }));

    containerEl.createEl("p", { text: this.plugin.statusText(), cls: "eari-muted" });

    // restore scroll position (full re-render on section toggles)
    if (scroller && scrollTop > 0) {
      window.requestAnimationFrame(() => { scroller.scrollTop = scrollTop; });
    }
  }

  /** re-render only the tree so toggling items never scrolls the settings pane */
  private async renderTree(): Promise<void> {
    const box = this.treeBox;
    if (!box) return;
    const cd = this.configDir();
    let entries: DirEntry[] = [];
    try {
      entries = await listDirRecursive(this.app.vault, cd);
    } catch (e) {
      entries = [];
    }
    entries = entries.filter((e) => e.path.startsWith(cd + "/"));

    const root: ObsNode = { name: "", relPath: "", isFolder: true, children: [], baseExcluded: false };
    const dirNodes = new Map<string, ObsNode>([["", root]]);
    for (const e of entries) {
      const rel = e.path.slice(cd.length + 1);
      if (!rel) continue;
      const parts = rel.split("/");
      let parentPath = "";
      for (let i = 0; i < parts.length - 1; i++) {
        const pp = parts.slice(0, i + 1).join("/");
        if (!dirNodes.has(pp)) {
          const node: ObsNode = { name: parts[i], relPath: pp, isFolder: true, children: [], baseExcluded: this.isAlwaysExcluded(pp) };
          dirNodes.set(pp, node);
          (dirNodes.get(parentPath) as ObsNode).children.push(node);
        }
        parentPath = pp;
      }
      const node: ObsNode = {
        name: parts[parts.length - 1],
        relPath: rel,
        isFolder: e.isFolder,
        children: [],
        baseExcluded: this.isAlwaysExcluded(rel),
      };
      dirNodes.set(rel, node);
      (dirNodes.get(parentPath) as ObsNode).children.push(node);
    }

    box.empty();
    if (root.children.length === 0) {
      box.createEl("p", { text: "Configuration folder not found.", cls: "eari-muted" });
      return;
    }

    const rerender = () => { void this.renderTree(); };

    const renderLevel = (nodes: ObsNode[], depth: number, container: HTMLElement): void => {
      const sorted = [...nodes].sort((a, b) => (a.isFolder === b.isFolder ? a.name.localeCompare(b.name) : a.isFolder ? -1 : 1));
      for (const node of sorted) {
        if (node.relPath === "workspace" || node.relPath === "workspace.json" || node.relPath === "workspace-mobile.json") continue;
        const wrap = container.createDiv();
        wrap.addClass("eari-tree-item");
        wrap.style.setProperty("--eari-depth", String(depth));
        const setting = new Setting(wrap).setName(node.name);

        if (node.isFolder) {
          const parentIncluded = this.isIncluded(node.relPath + "/");
          const isOpen = this.expanded.has(node.relPath);
          if (node.baseExcluded) {
            setting.setDesc("Always excluded");
            setting.addToggle((t) => t.setValue(false).setDisabled(true));
          } else {
            setting.addButton((b) => {
              b.setButtonText(isOpen ? "▼" : "▶").setTooltip("Expand or collapse");
              b.onClick(() => {
                if (isOpen) this.expanded.delete(node.relPath); else this.expanded.add(node.relPath);
                rerender();
              });
            });
            setting.setDesc(parentIncluded ? "Whole folder included" : "Folder");
            setting.addToggle((t) => t
              .setValue(parentIncluded)
              .onChange(async (v) => {
                const inc = new Set(this.plugin.settings.obsidianInclude ?? []);
                if (v) inc.add(node.relPath + "/"); else inc.delete(node.relPath + "/");
                this.plugin.settings.obsidianInclude = Array.from(inc).sort();
                await this.plugin.saveSettings();
                rerender();
              }));
          }
          if (isOpen && !node.baseExcluded) {
            if (parentIncluded) {
              const hint = wrap.createDiv();
              hint.setText("Included as a whole — turn the toggle off to select items individually");
              hint.addClass("eari-hint");
            } else {
              renderLevel(node.children, depth + 1, wrap);
            }
          }
        } else {
          if (node.baseExcluded) {
            setting.setDesc("Always excluded");
            setting.addToggle((t) => t.setValue(false).setDisabled(true));
          } else {
            setting.addToggle((t) => t
              .setValue(this.isIncluded(node.relPath))
              .onChange(async (v) => {
                const inc = new Set(this.plugin.settings.obsidianInclude ?? []);
                const parts = node.relPath.split("/");
                for (let i = 1; i < parts.length; i++) inc.delete(parts.slice(0, i).join("/") + "/");
                const key = node.relPath;
                if (v) inc.add(key); else inc.delete(key);
                this.plugin.settings.obsidianInclude = Array.from(inc).sort();
                await this.plugin.saveSettings();
              }));
          }
        }
      }
    };

    renderLevel(root.children, 0, box);
  }
}
