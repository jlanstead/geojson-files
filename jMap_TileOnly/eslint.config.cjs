module.exports = [
  { ignores: ["node_modules/**",".tmp/**","dist/**","webpack.statistics.*.html"] },
  { files: ["**/*.ts","**/*.tsx"],
    languageOptions:{ parserOptions:{ tsconfigRootDir: __dirname, project:["./tsconfig.json"] }},
    rules:{} }
];
