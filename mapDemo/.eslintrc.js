module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: "./tsconfig.json",
    tsconfigRootDir: __dirname,
    sourceType: "module"
  },
  extends: ["plugin:@typescript-eslint/recommended"],
  env: { browser: true, node: true },
  rules: {}
};