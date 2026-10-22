import { Plugin, PluginSettingTab, Setting, Notice, TFile } from "obsidian";
import { DEFAULT_SETTINGS, type EariSettings } from "./settings.js";
import { ApiClient } from "./api.js";
import { SyncEngine } from "./sync-engine.js";
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

    this.statusEl = this.addStatusBarItem();
    this.statusEl.setText(STATUS_LABELS.idle);
    this.statusEl.addClass("eari-sync-status");

    this.addCommand({ id: "sync-now", name: "eari-sync: Sync now", callback: () => this.syncNow() });
    this.addCommand({ id: "test-connection", name: "eari-sync: Test connection", callback: () => this.testConnection() });
    this.addCommand({ id: "show-status", name: "eari-sync: Show sync status", callback: () => new Notice(this.statusText()) });
    this.addCommand({ id: "retry-failed", name: "eari-sync: Retry failed items", callback: () => this.syncNow() });

    this.addSettingTab(new EariSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      if (this.settings.autoSync && this.isConfigured()) {
        this.startEngine();
      }
    });
  }

  async onunload(): Promise<void> {
    if (this.engine) { await this.engine.stop(); this.engine = null; }
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
    const data = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data ?? {});
    if (!this.settings.fileIndex) this.settings.fileIndex = {};
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
      onProgress: (m) => console.log("eari-sync:", m),
    });
    await this.engine.start();
  }

  async stopEngine(): Promise<void> {
    if (this.engine) { await this.engine.stop(); this.engine = null; }
  }

  async syncNow(): Promise<void> {
    if (!this.isConfigured()) { new Notice("eari-sync: not configured"); return; }
    if (!this.engine) await this.startEngine();
    await this.engine?.syncNow();
  }

  async testConnection(): Promise<void> {
    const api = new ApiClient(this.settings);
    const res = await api.testConnection();
    new Notice(res.ok ? "eari-sync: connection OK" : `eari-sync: ${res.error}`);
  }
}

class EariSettingTab extends PluginSettingTab {
  plugin: EariSyncPlugin;
  constructor(app: any, plugin: EariSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "eari-sync" });

    new Setting(containerEl).setName("Server URL").setDesc("https://your-ddns:port")
      .addText((t) => t.setPlaceholder("https://example.iptime.org:8443").setValue(this.plugin.settings.serverUrl)
        .onChange(async (v) => { this.plugin.settings.serverUrl = v.trim(); await this.plugin.saveSettings(); }));

    new Setting(containerEl).setName("Vault ID").addText((t) => t.setValue(this.plugin.settings.vaultId)
      .onChange(async (v) => { this.plugin.settings.vaultId = v.trim(); await this.plugin.saveSettings(); }));

    new Setting(containerEl).setName("Vault Secret").addText((t) => {
      t.inputEl.type = "password";
      t.setValue(this.plugin.settings.vaultSecret).onChange(async (v) => { this.plugin.settings.vaultSecret = v.trim(); await this.plugin.saveSettings(); });
    });

    new Setting(containerEl).setName("Test connection").addButton((b) => b.setButtonText("Test").onClick(() => this.plugin.testConnection()));

    new Setting(containerEl).setName("Auto sync").addToggle((t) => t.setValue(this.plugin.settings.autoSync)
      .onChange(async (v) => { this.plugin.settings.autoSync = v; await this.plugin.saveSettings(); if (v) await this.plugin.startEngine(); else await this.plugin.stopEngine(); }));

    new Setting(containerEl).setName("Sync mode").addDropdown((d) => d
      .addOption("fast", "Fast").addOption("balanced", "Balanced").addOption("saver", "Saver")
      .setValue(this.plugin.settings.syncMode)
      .onChange(async (v: any) => { this.plugin.settings.syncMode = v; await this.plugin.saveSettings(); }));

    new Setting(containerEl).setName("Exclude patterns (one per line)").addTextArea((t) => t.setValue(this.plugin.settings.excludePatterns.join("\n"))
      .onChange(async (v) => { this.plugin.settings.excludePatterns = v.split("\n").map((x) => x.trim()).filter(Boolean); await this.plugin.saveSettings(); }));

    new Setting(containerEl).setName("Sync now").addButton((b) => b.setButtonText("Sync").onClick(() => this.plugin.syncNow()));

    containerEl.createEl("p", { text: this.plugin.statusText() });
  }
}
