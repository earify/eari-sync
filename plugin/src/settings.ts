export interface EariSettings {
  serverUrl: string;
  vaultId: string;
  vaultSecret: string;
  autoSync: boolean;
  syncMode: "fast" | "balanced" | "saver";
  excludePatterns: string[];
  syncObsidian: boolean;
  obsidianInclude: string[];
  conflictKeepBoth: boolean;
  trashRetentionDays: number;
  deviceId: string;
  lastSeq: number;
  fileIndex: Record<string, { version: number; hash: string }>;
  deletedSeen: Record<string, number>; // path -> delete version seen from server (tombstones)
  serverCertFingerprint?: string;
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
  conflictKeepBoth: true,
  trashRetentionDays: 30,
  deviceId: "",
  lastSeq: 0,
  fileIndex: {},
  deletedSeen: {},
};

export function isConfigured(s: EariSettings): boolean {
  return !!(s.serverUrl && s.vaultId && s.vaultSecret);
}
