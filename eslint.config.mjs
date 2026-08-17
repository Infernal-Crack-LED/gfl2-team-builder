import eslint from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'prefer-const': 'error',
      'prefer-arrow-callback': 'error',
      curly: 'error',
      'dot-notation': 'error',
      'require-await': 'error',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    files: ['**/*.test.*'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    files: ['web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    files: ['web/src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    // Infographics core/ is DOM-free AND platform-free: it must never import the
    // Node render host. This invariant is what keeps @napi-rs/canvas and sharp out
    // of the web bundle AND keeps the fonts-before-draw ordering guarantee honest
    // (node/render.ts is the only module that may import node/fonts.ts). The rule
    // enforces what core/canvas2d.ts already states in prose.
    files: ['src/infographics/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@napi-rs/canvas', 'sharp'],
              message:
                'core/ must stay platform-free — Node-only deps belong in src/infographics/node/ (imported via node/render.ts).',
            },
            {
              group: ['../node', '../node/**'],
              message:
                'core/ must never import the Node render host — the fonts-first ordering guarantee lives in node/render.ts only.',
            },
          ],
        },
      ],
    },
  },
  {
    ignores: ['**/dist/**/*', '**/dist-server/**/*', '**/drizzle/**/*'],
  }
);
