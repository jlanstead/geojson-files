export default [
  { ignores: ["node_modules/**", ".tmp/**", "dist/**", "webpack.statistics.*.html"] },
  {
    files: ["**/*.ts","**/*.tsx"],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: new URL('.', import.meta.url).pathname,
        project: ["./tsconfig.json"]
      }
    },
    rules: {}
  }
];
