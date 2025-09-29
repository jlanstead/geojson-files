const path = require("path");
const tsParser = require("@typescript-eslint/parser");
const tsPlugin = require("@typescript-eslint/eslint-plugin");

module.exports = [{
  files: ["src/**/*.ts", "src/**/*.tsx", "src/**/*.d.ts"],
  languageOptions: {
    parser: tsParser,
    parserOptions: {
      tsconfigRootDir: path.resolve(__dirname),
      project: [path.resolve(__dirname, "tsconfig.json")]
    }
  },
  plugins: { "@typescript-eslint": tsPlugin },
  rules: {}
}];
