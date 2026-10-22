export async function sha256ArrayBuffer(buf: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256String(s: string): Promise<string> {
  return sha256ArrayBuffer(new TextEncoder().encode(s).buffer as ArrayBuffer);
}
