import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['node_modules/**', 'coverage/**', 'dist/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ['**/*.ts'],
  })),
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  eslintConfigPrettier,
  {
    files: ['**/*.{js,mjs,cjs,ts}'],
    rules: {
      curly: ['error', 'all'],
      'padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: '*', next: 'if' },
        { blankLine: 'always', prev: '*', next: 'return' },
      ],
    },
  },
];
