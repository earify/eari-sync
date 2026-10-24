export interface EariSettings {
  serverUrl: string;
  vaultId: string;
  vaultSecret: string;
  autoSync: boolean;
  syncMode: "fast" | "balanced" | "saver";
  excludePatterns: string[];
  syncObsidian: boolean;
  obsidianInclude: string[];
  maxFileSizeMB: number;
  configDir: string;
  debug: boolean;
  deviceId: string;
  lastSeq: number;
  fileIndex: Record<string, { version: number; hash: string }>;
  deletedSeen: Record<string, { v: number; t: number }>; // tombstones: server delete version + time
}

export const DEFAULT_SETTINGS: EariSettings = {
  serverUrl: "",
  vaultId: "",
  vaultSecret: "",
  autoSync: true,
  syncMode: "balanced",
  excludePatterns: [],
  syncObsidian: false,
  obsidianInclude: [],
  maxFileSizeMB: 50,
  configDir: ".obsidian",
  debug: false,
  deviceId: "",
  lastSeq: 0,
  fileIndex: {},
  deletedSeen: {},
};

export function isConfigured(s: EariSettings): boolean {
  return !!(s.serverUrl && s.vaultId && s.vaultSecret);
}
