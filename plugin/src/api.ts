import { requestUrl } from "obsidian";
import type { EariSettings } from "./settings.js";
export interface VaultMeta {
  vaultId: string;
  seq: number;
  fileCount: number;
  trashCount: number;
}

// shared types are not bundled; redefine minimal locally
export interface RemoteChange {
  seq: number;
  path: string;
  op: "create" | "modify" | "delete" | "move";
  size?: number;
  mtime?: number;
  hash?: string;
  version: number;
  fromPath?: string;
  clientId?: string;
  createdAt: number;
}

export interface ChangesResponse {
  changes: RemoteChange[];
  nextSeq: number;
  hasMore: boolean;
  currentSeq: number;
}

export class ApiClient {
  constructor(private s: EariSettings) {}

  update(s: EariSettings): void { this.s = s; }

  private base(): string {
    return this.s.serverUrl.replace(/\/+$/, "");
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      Authorization: `Bearer ${this.s.vaultSecret}`,
      "X-Vault-Id": this.s.vaultId,
      "X-Client-Id": this.s.deviceId,
      ...extra,
    };
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      const r = await requestUrl({
        url: `${this.base()}/api/v1/auth/test`,
        method: "POST",
        headers: this.headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({ vaultId: this.s.vaultId, secret: this.s.vaultSecret }),
        throw: false,
      });
      if (r.status === 204 || r.status === 200) return { ok: true };
      return { ok: false, error: `HTTP ${r.status}: ${r.text}` };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? String(e) };
    }
  }

  async meta(): Promise<VaultMeta> {
    const r = await requestUrl({
      url: `${this.base()}/api/v1/vaults/${encodeURIComponent(this.s.vaultId)}/meta`,
      method: "GET",
      headers: this.headers(),
      throw: false,
    });
    if (r.status !== 200) throw new Error(`meta ${r.status}: ${r.text}`);
    return r.json;
  }

  async changes(since: number, limit = 500): Promise<ChangesResponse> {
    const r = await requestUrl({
      url: `${this.base()}/api/v1/vaults/${encodeURIComponent(this.s.vaultId)}/changes?since=${since}&limit=${limit}`,
      method: "GET",
      headers: this.headers(),
      throw: false,
    });
    if (r.status !== 200) throw new Error(`changes ${r.status}: ${r.text}`);
    return r.json;
  }

  async download(path: string): Promise<{ data: ArrayBuffer; hash: string; version: number; mtime: number; size: number }> {
    const r = await requestUrl({
      url: `${this.base()}/api/v1/vaults/${encodeURIComponent(this.s.vaultId)}/files/${encodePath(path)}`,
      method: "GET",
      headers: this.headers(),
      throw: false,
    });
    if (r.status !== 200) throw new Error(`download ${r.status}: ${r.text}`);
    return {
      data: r.arrayBuffer,
      hash: r.headers["x-hash"] ?? r.headers["X-Hash"] ?? "",
      version: Number(r.headers["x-version"] ?? r.headers["X-Version"] ?? 0),
      mtime: Number(r.headers["x-mtime"] ?? r.headers["X-Mtime"] ?? 0),
      size: Number(r.headers["x-size"] ?? r.headers["X-Size"] ?? 0),
    };
  }

  async upload(path: string, data: ArrayBuffer, baseVersion: number, mtime: number, hash: string, seenDeleteVersion?: number): Promise<{ version: number; seq: number; status: string }> {
    const extra: Record<string, string> = {
      "Content-Type": "application/octet-stream",
      "X-Base-Version": String(baseVersion),
      "X-Mtime": String(mtime),
      "X-Hash": hash,
    };
    if (seenDeleteVersion) extra["X-Seen-Delete-Version"] = String(seenDeleteVersion);
    const r = await requestUrl({
      url: `${this.base()}/api/v1/vaults/${encodeURIComponent(this.s.vaultId)}/files/${encodePath(path)}`,
      method: "PUT",
      headers: this.headers(extra),
      body: data,
      throw: false,
    });
    if (r.status === 409) {
      const info = r.json;
      throw new ConflictError(info);
    }
    if (r.status !== 200) throw new Error(`upload ${r.status}: ${r.text}`);
    return r.json;
  }

  async remove(path: string, baseVersion: number): Promise<void> {
    const r = await requestUrl({
      url: `${this.base()}/api/v1/vaults/${encodeURIComponent(this.s.vaultId)}/files/${encodePath(path)}?baseVersion=${baseVersion}`,
      method: "DELETE",
      headers: this.headers(),
      throw: false,
    });
    if (r.status !== 200 && r.status !== 204) throw new Error(`delete ${r.status}: ${r.text}`);
  }

  async move(from: string, to: string, baseVersion: number): Promise<void> {
    const r = await requestUrl({
      url: `${this.base()}/api/v1/vaults/${encodeURIComponent(this.s.vaultId)}/move`,
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ from, to, baseVersion }),
      throw: false,
    });
    if (r.status !== 200) throw new Error(`move ${r.status}: ${r.text}`);
  }

  connectWs(onChange: (seq: number) => void, onStatus: (s: string) => void): WebSocket | null {
    try {
      const url = `${this.base().replace(/^http/, "ws")}/api/v1/vaults/${encodeURIComponent(this.s.vaultId)}/ws?token=${encodeURIComponent(this.s.vaultSecret)}`;
      const ws = new WebSocket(url);
      ws.onopen = () => onStatus("connected");
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "change" && typeof msg.seq === "number") onChange(msg.seq);
          if (msg.type === "auth_fail") onStatus("auth");
        } catch {}
      };
      ws.onclose = () => onStatus("disconnected");
      ws.onerror = () => onStatus("error");
      return ws;
    } catch {
      return null;
    }
  }
}

export class ConflictError extends Error {
  info: any;
  constructor(info: any) {
    super("conflict");
    this.info = info;
  }
}

function encodePath(p: string): string {
  return p.split("/").map(encodeURIComponent).join("/");
}
