export interface EariSettings {
  serverUrl: string;
  vaultId: string;
  vaultSecret: string;
  autoSync: boolean;
  syncMode: "fast" | "balanced" | "saver";
  excludePatterns: string[];
  conflictKeepBoth: boolean;
  trashRetentionDays: number;
  deviceId: string;
  lastSeq: number;
  fileIndex: Record<string, { version: number; hash: string }>;
  serverCertFingerprint?: string;
}

export const DEFAULT_SETTINGS: EariSettings = {
  serverUrl: "",
  vaultId: "",
  vaultSecret: "",
  autoSync: true,
  syncMode: "balanced",
  excludePatterns: [".git/**", ".obsidian/cache/**", ".obsidian/workspace*.json", "**/.DS_Store"],
  conflictKeepBoth: true,
  trashRetentionDays: 30,
  deviceId: "",
  lastSeq: 0,
  fileIndex: {},
};

export function isConfigured(s: EariSettings): boolean {
  return !!(s.serverUrl && s.vaultId && s.vaultSecret);
}
