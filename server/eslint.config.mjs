// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // ── Base JS rules ──────────────────────────────────────────────────────────
  eslint.configs.recommended,

  // ── TypeScript rules ───────────────────────────────────────────────────────
  ...tseslint.configs.recommended,

  // ── Project-specific overrides ─────────────────────────────────────────────
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    rules: {
      // Allow unused vars prefixed with _
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Allow explicit any in a few places (legacy code)
      '@typescript-eslint/no-explicit-any': 'warn',
      // Don't require return types on every function
      '@typescript-eslint/explicit-function-return-type': 'off',
      // Allow require() in a few places (dynamic imports, BullMQ sandboxed processors)
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // ── Ignore patterns ────────────────────────────────────────────────────────
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'tests/**',
      '*.js',
      '*.mjs',
    ],
  },
);
