import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  { ignores: ["main.js", "esbuild.config.mjs", "node_modules/**", "release/**"] },
  ...obsidianmd.configs.recommended,
  {
    files: ["src/**/*.ts"],
    rules: {
      // TypeScript already checks identifiers; no-undef produces false positives for DOM/Electron globals
      "no-undef": "off",
      // classic PluginSettingTab keeps compatibility with Obsidian versions older than the declarative API
      "@typescript-eslint/no-deprecated": "warn",
      "obsidianmd/ui/sentence-case": "warn",
    },
  },
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
