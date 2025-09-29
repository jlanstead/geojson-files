// .eslintrc.js
const path = require('path');

module.exports = {
  root: true,
  env: {
    browser: true,
    es2021: true
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    tsconfigRootDir: path.resolve(__dirname)
    // Do NOT set "project" to avoid other parser errors
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended'
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'off'
  },
  ignorePatterns: [
    'dist/**',
    'node_modules/**',
    '.tmp/**',
    '.vscode/**'
  ]
};
