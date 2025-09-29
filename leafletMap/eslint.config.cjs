// eslint.config.cjs
const tsParser = require('@typescript-eslint/parser');

module.exports = [
  // Ignore everything pbiviz shouldn't lint
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '.tmp/**',
      '.vscode/**',
      // Skip TS sources during pbiviz's lint pass
      'src/*.ts',
      'src/**/*.ts'
    ],
  },

  // (Optional) If you want local linting in VS Code, keep this block.
  // pbiviz will still skip because files are ignored above.
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { tsconfigRootDir: __dirname }
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off'
    }
  }
];
