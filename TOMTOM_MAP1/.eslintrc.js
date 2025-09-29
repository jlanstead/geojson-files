// .eslintrc.js (repo root)
const path = require("path");

module.exports = {
  root: true,
  overrides: [
    {
      files: ["src/**/*.ts", "src/**/*.d.ts"],
      parser: "@typescript-eslint/parser",
      parserOptions: {
        project: path.resolve(__dirname, "tsconfig.json"),
        tsconfigRootDir: __dirname,
      },
      plugins: ["@typescript-eslint"],
      rules: {},
    },
  ],
};