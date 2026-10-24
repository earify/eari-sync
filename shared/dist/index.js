// Shared protocol types for eari-sync (server + plugin)
export const DEFAULT_EXCLUDES = [
    ".git/**",
    ".obsidian/cache/**",
    ".obsidian/workspace*.json",
    "**/.DS_Store",
    "**/Thumbs.db",
];
export function normalizePath(p) {
    // POSIX normalize, no leading slash, no .. segments
    const parts = p.split("/").filter((x) => x.length > 0 && x !== ".");
    const out = [];
    for (const part of parts) {
        if (part === "..")
            throw new Error("path traversal not allowed");
        out.push(part);
    }
    return out.join("/");
}
