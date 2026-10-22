export type SyncStatus = "idle" | "connecting" | "connected" | "syncing" | "done" | "offline" | "conflict" | "auth" | "error";

export const STATUS_LABELS: Record<SyncStatus, string> = {
  idle: "eari-sync: idle",
  connecting: "eari-sync: connecting…",
  connected: "eari-sync: connected",
  syncing: "eari-sync: syncing…",
  done: "eari-sync: synced",
  offline: "eari-sync: offline",
  conflict: "eari-sync: conflict",
  auth: "eari-sync: auth error",
  error: "eari-sync: error",
};
