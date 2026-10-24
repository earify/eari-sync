export type Op = "create" | "modify" | "delete" | "move";
export interface FileMeta {
    path: string;
    size: number;
    mtime: number;
    hash: string;
    version: number;
    deleted?: boolean;
}
export interface Change {
    seq: number;
    path: string;
    op: Op;
    size?: number;
    mtime?: number;
    hash?: string;
    version: number;
    fromPath?: string;
    clientId?: string;
    createdAt: number;
}
export interface ChangesResponse {
    changes: Change[];
    nextSeq: number;
    hasMore: boolean;
    currentSeq: number;
}
export interface PushResult {
    path: string;
    version: number;
    seq: number;
    status: "created" | "updated" | "unchanged";
}
export interface ConflictInfo {
    path: string;
    serverVersion: number;
    serverHash: string;
    serverSize: number;
    serverMtime: number;
    clientVersion: number;
}
export interface VaultMeta {
    vaultId: string;
    seq: number;
    fileCount: number;
    trashCount: number;
}
export interface ClientInfo {
    clientId: string;
    deviceName?: string;
    platform?: "windows" | "android" | "ipados" | "other";
}
export interface WsMessage {
    type: "change" | "ping" | "pong" | "auth" | "auth_ok" | "auth_fail" | "error";
    vaultId?: string;
    seq?: number;
    token?: string;
    message?: string;
}
export interface ServerSettings {
    port: number;
    dataDir: string;
    httpsMode: "letsencrypt" | "selfsigned";
    certPath?: string;
    keyPath?: string;
    caCertPath?: string;
}
export interface SyncMode {
    mode: "fast" | "balanced" | "saver";
}
export declare const DEFAULT_EXCLUDES: string[];
export declare function normalizePath(p: string): string;
