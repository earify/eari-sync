import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  { ignores: ["main.js", "esbuild.config.mjs", "node_modules/**"] },
  ...obsidianmd.configs.recommended,
  {
    files: ["src/logger.ts"],
    rules: {
      "no-console": "off",
      "obsidianmd/rule-custom-message": "off",
    },
  },
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.mjs"],
        },
      },
    },
  },
]);
