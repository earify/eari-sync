export function conflictName(original: string, deviceId: string): string {
  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, "").replace("T", "-").slice(0, 15);
  const idx = original.lastIndexOf(".");
  if (idx > 0 && idx > original.lastIndexOf("/")) {
    const base = original.slice(0, idx);
    const ext = original.slice(idx);
    return `${base}.conflict-${deviceId}-${ts}${ext}`;
  }
  return `${original}.conflict-${deviceId}-${ts}`;
}
