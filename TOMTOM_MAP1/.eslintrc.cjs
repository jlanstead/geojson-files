const path = require("path");
module.exports = {
  overrides: [{
    files: ["src/**/*.ts"],
    parser: "@typescript-eslint/parser",
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      tsconfigRootDir: path.resolve(process.cwd()),  
      project: ["./tsconfig.json"]
    },
    plugins: ["@typescript-eslint"],
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "off"
    }
  }]
};
