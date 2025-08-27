// eslint.config.mjs — JMap (ESM-safe)
import powerbiVisualsConfigs from "eslint-plugin-powerbi-visuals";
import tsParser from "@typescript-eslint/parser";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

export default [
  // Microsoft’s recommended baseline (pbiviz leverages this)
  powerbiVisualsConfigs.configs.recommended,

  // Our overrides: apply to TS files and (critically) set an ABSOLUTE tsconfigRootDir
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        // If you prefer type-aware linting, keep "project" and ensure tsconfig includes src/**/* (see tsconfig.json below)
        project: "./tsconfig.json",
        tsconfigRootDir: __dirname
      }
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-var-requires": "off"
    }
  },

  // ESLint 9 wants ignores defined in config (not .eslintignore)
  {
    ignores: ["node_modules/**", "dist/**", ".vscode/**", ".tmp/**"]
  }
];
