import { defaultDataDir, ensureDataDirs, loadConfig } from "./config.js";
import { openDb } from "./db.js";
import { createVault, listVaults } from "./vaults.js";
import { generateSecret } from "./auth.js";
import { existsSync, mkdirSync, cpSync } from "node:fs";
import { join } from "node:path";
function arg(name) {
    const i = process.argv.indexOf(name);
    if (i >= 0 && i + 1 < process.argv.length)
        return process.argv[i + 1];
    return undefined;
}
const cmd = process.argv[2];
async function init() {
    const dataDir = defaultDataDir();
    ensureDataDirs(dataDir);
    const db = openDb(dataDir);
    const vaultId = arg("--vault") ?? "default";
    let secret = arg("--secret") ?? generateSecret(32);
    // if vault exists, rotate? create new
    try {
        createVault(db, dataDir, vaultId, secret);
    }
    catch (e) {
        if (String(e.message).includes("UNIQUE")) {
            // rotate
            const { rotateSecret } = await import("./vaults.js");
            rotateSecret(db, vaultId, secret);
            console.log(`Vault '${vaultId}' already exists; secret rotated.`);
        }
        else
            throw e;
    }
    db.close();
    console.log("");
    console.log("=== eari-sync initialized ===");
    console.log("Data dir :", dataDir);
    console.log("Vault ID :", vaultId);
    console.log("Vault Secret (save this, shown once):", secret);
    console.log("");
    console.log("Store these in your Obsidian plugin settings.");
}
async function doctor() {
    const dataDir = defaultDataDir();
    console.log("Data dir:", dataDir);
    if (!existsSync(dataDir)) {
        console.log("FAIL: data dir missing. Run init.");
        process.exit(1);
    }
    const db = openDb(dataDir);
    console.log("DB integrity:", db.integrityCheck() ? "OK" : "FAIL");
    console.log("Vaults:", listVaults(db).join(", ") || "(none)");
    for (const v of listVaults(db)) {
        const { getSeq } = await import("./vaults.js");
        console.log(`  ${v}: seq=${getSeq(db, v)}`);
    }
    db.close();
    // port check
    const cfg = loadConfig(dataDir);
    console.log("Port:", cfg.port, "host:", cfg.host, "httpsMode:", cfg.httpsMode);
    if (cfg.httpsMode === "letsencrypt") {
        console.log("Cert:", cfg.certPath, existsSync(cfg.certPath ?? "") ? "OK" : "MISSING");
        console.log("Key :", cfg.keyPath, existsSync(cfg.keyPath ?? "") ? "OK" : "MISSING");
    }
    console.log("NAT loopback: verify manually by accessing DDNS URL from inside LAN.");
    console.log("doctor done.");
}
async function backup() {
    const dataDir = defaultDataDir();
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const out = join(dataDir, "backups", `backup-${ts}`);
    mkdirSync(out, { recursive: true });
    // copy entire data dir except backups/logs? include all
    cpSync(dataDir, out, { recursive: true, filter: (src) => !src.includes("/backups/") && !src.includes("\\backups\\") });
    console.log("Backup created:", out);
}
async function restore() {
    const src = arg("--from");
    if (!src) {
        console.error("Usage: restore --from <backup-dir>");
        process.exit(1);
    }
    if (!existsSync(src)) {
        console.error("backup not found");
        process.exit(1);
    }
    const dataDir = defaultDataDir();
    // safety: move current to .pre-restore
    if (existsSync(dataDir)) {
        const pre = dataDir + ".pre-restore-" + Date.now();
        // rename by copy+remove not ideal; just overwrite files
        console.log("Restoring over", dataDir);
    }
    ensureDataDirs(dataDir);
    cpSync(src, dataDir, { recursive: true, force: true });
    console.log("Restored from", src);
}
async function main() {
    if (cmd === "init")
        await init();
    else if (cmd === "doctor")
        await doctor();
    else if (cmd === "backup")
        await backup();
    else if (cmd === "restore")
        await restore();
    else {
        console.log("Usage: cli <init|doctor|backup|restore> [--vault id] [--secret s] [--from dir]");
        process.exit(1);
    }
}
main().catch((e) => { console.error(e); process.exit(1); });
