import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
const KEYLEN = 64;
const SALTLEN = 16;
const COST = 0.5; // not used; scrypt defaults
export function hashSecret(secret) {
    const salt = randomBytes(SALTLEN);
    const hash = scryptSync(secret, salt, KEYLEN);
    return `${salt.toString("hex")}:${hash.toString("hex")}`;
}
export function verifySecret(secret, stored) {
    if (typeof stored !== "string" || !stored.includes(":"))
        return false;
    const [saltHex, hashHex] = stored.split(":");
    if (!saltHex || !hashHex)
        return false;
    let salt, hash;
    try {
        salt = Buffer.from(saltHex, "hex");
        hash = Buffer.from(hashHex, "hex");
    }
    catch {
        return false;
    }
    const computed = scryptSync(secret, salt, KEYLEN);
    if (computed.length !== hash.length)
        return false;
    return timingSafeEqual(computed, hash);
}
export function generateSecret(bytes = 32) {
    // url-safe base64-ish
    return randomBytes(bytes).toString("base64url");
}
export function generateVaultId() {
    return randomBytes(8).toString("hex");
}
