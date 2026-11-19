// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['out/**', 'dist/**', 'docs/**', 'node_modules/**', '*.cjs', 'phone/public/**'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ['src/renderer/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts', '*.config.{ts,js,mjs}'],
    languageOptions: { globals: globals.node },
  },
  {
    // Tests may assert presence with `!` after checking it.
    files: ['tests/**/*.{ts,tsx}'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  {
    // Plain Node helper scripts (CommonJS).
    files: ['scripts/**/*.cjs'],
    languageOptions: { globals: globals.node, sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    // The renderer must never reach Node APIs directly — everything goes through window.arc.
    files: ['src/renderer/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['node:*', 'electron', 'fs', 'path', 'os', 'child_process'] },
      ],
    },
  },
  prettier,
);
