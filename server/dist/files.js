import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, renameSync, unlinkSync, statSync, readFileSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { safeRelativePath, rejectSymlink, assertInsideVault } from "./paths.js";
export function sha256Buffer(buf) {
    return createHash("sha256").update(buf).digest("hex");
}
export function sha256File(absPath) {
    const h = createHash("sha256");
    const data = readFileSync(absPath);
    h.update(data);
    return h.digest("hex");
}
export function ensureParent(absPath) {
    const dir = dirname(absPath);
    if (!existsSync(dir))
        mkdirSync(dir, { recursive: true });
}
export function absPathFor(vaultFilesDir, relPath) {
    const safe = safeRelativePath(relPath);
    const full = join(vaultFilesDir, safe);
    assertInsideVault(vaultFilesDir, full);
    return full;
}
export async function writeAtomic(vaultFilesDir, relPath, data, mtime) {
    const full = absPathFor(vaultFilesDir, relPath);
    rejectSymlink(full);
    ensureParent(full);
    const tmp = full + ".tmp-" + Math.random().toString(36).slice(2);
    writeFileSync(tmp, data);
    // fsync
    const { openSync, fsyncSync, closeSync } = await import("node:fs");
    const fd = openSync(tmp, "r+");
    fsyncSync(fd);
    closeSync(fd);
    // atomic rename
    renameSync(tmp, full);
    if (mtime) {
        const { utimesSync } = await import("node:fs");
        utimesSync(full, new Date(mtime), new Date(mtime));
    }
    const st = statSync(full);
    return { size: st.size, hash: sha256File(full) };
}
export function readFileSyncSafe(vaultFilesDir, relPath) {
    const full = absPathFor(vaultFilesDir, relPath);
    rejectSymlink(full);
    return readFileSync(full);
}
export function fileExists(vaultFilesDir, relPath) {
    const full = absPathFor(vaultFilesDir, relPath);
    try {
        rejectSymlink(full);
        return existsSync(full);
    }
    catch {
        return false;
    }
}
export function deleteFilePhysical(vaultFilesDir, relPath) {
    const full = absPathFor(vaultFilesDir, relPath);
    rejectSymlink(full);
    if (existsSync(full))
        unlinkSync(full);
}
export function moveFilePhysical(vaultFilesDir, fromRel, toRel) {
    const from = absPathFor(vaultFilesDir, fromRel);
    const to = absPathFor(vaultFilesDir, toRel);
    rejectSymlink(from);
    rejectSymlink(to);
    ensureParent(to);
    renameSync(from, to);
}
export function listAllFiles(vaultFilesDir, base = "") {
    // recursive listing of relative paths
    const out = [];
    const dir = base ? join(vaultFilesDir, base) : vaultFilesDir;
    if (!existsSync(dir))
        return out;
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        const st = statSync(full);
        if (st.isSymbolicLink())
            continue;
        const rel = base ? `${base}/${name}` : name;
        if (st.isDirectory()) {
            out.push(...listAllFiles(vaultFilesDir, rel));
        }
        else if (st.isFile()) {
            out.push(rel);
        }
    }
    return out;
}
export function removeDirContents(dir) {
    if (existsSync(dir))
        rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
}
export { createReadStream };
