const path = require("path");
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: "./tsconfig.json",
    tsconfigRootDir: path.resolve(__dirname),
    sourceType: "module"
  },
  extends: ["plugin:@typescript-eslint/recommended"],
  env: { browser: true, node: true },
  rules: {}
};