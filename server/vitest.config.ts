import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  server: {
    deps: {
      external: ["node:sqlite", "node:fs", "node:path", "node:crypto", "node:os", "node:stream", "node:readline", "node:http", "node:util"],
    },
  },
});