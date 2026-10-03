// ESLint 10 flat config.
//
// **Why this is not `eslint-config-next` (decision D78).** `04` S2.2 pins
// `typescript 7.0.2`, and every package in the `typescript-eslint` family aborts on
// import when the installed TypeScript major is >= 7 ("typescript-eslint does not support
// TS 7.0"). `eslint-config-next@16.3.8` re-exports that family, so it cannot load at all.
// Two options were rejected:
//   - pinning `typescript` back to 6.x, because TS 7.0.2 is the committed pin and it is
//     available (04 S2.2 rule 3 only permits moving a pin that is unavailable);
//   - installing a second, older TypeScript for the linter alone, because then the linter
//     reasons about the codebase with a stale type API and two compilers can disagree.
// What is used instead keeps `pnpm lint` meaning `eslint` (11 WP-01, 12 S3.7):
//   @babel/eslint-parser parses TS/TSX syntax with Babel's own parser, which is not
//   coupled to the TypeScript version, and the rules that matter here are parser-
//   independent. The lost capability is *type-aware* lint rules; `pnpm typecheck`
//   (`tsc --noEmit`, `strict: true`) is the compensating check and is a stronger one.
//
// `04` S5.9 requires the C8 import rule at this level. It is enforced below with the core
// `no-restricted-imports` rule, with a targeted exception for `src/lib/llm/**`, plus the
// grep backstop in `scripts/check-c8.mjs` (run from `pnpm lint`).

import js from '@eslint/js';
import babelParser from '@babel/eslint-parser';
import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

/** Naming the vendor packages once, so the rule and its message cannot drift apart. */
const VENDOR_SDK_PATTERNS = [
  {
    group: ['openai', 'openai/*'],
    message: 'C8: vendor SDKs may only be imported inside src/lib/llm/.',
  },
  {
    group: ['@google/genai', '@google/genai/*', '@google/generative-ai', '@google/generative-ai/*'],
    message: 'C8: vendor SDKs may only be imported inside src/lib/llm/.',
  },
  {
    group: ['@anthropic-ai/*'],
    message: 'C8: vendor SDKs may only be imported inside src/lib/llm/.',
  },
  {
    group: ['ollama', 'ollama/*', '@langchain/*', 'langchain', 'langchain/*'],
    message: 'C8: no LLM vendor SDK outside src/lib/llm/, and no second orchestration layer.',
  },
];

// Babel 8's preset-typescript detects TS vs TSX from the file extension, so no
// `allExtensions`/`isTSX` (both were removed in Babel 8). preset-react supplies the JSX
// syntax for `.tsx`; the transform target is irrelevant because ESLint only parses.
const babelOptions = {
  babelrc: false,
  configFile: false,
  presets: [
    ['@babel/preset-typescript'],
    ['@babel/preset-react', { runtime: 'automatic' }],
  ],
};

export default [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'next-env.d.ts',
      'pnpm-lock.yaml',
      // The gitignored scratch directory. Diagnostics and one-off probes live here, and they are operator
      // tools rather than deliverables: they legitimately print, and they are not shipped. Linting them
      // meant a `.ts` probe could fail the build for a reason that has nothing to do with the product --
      // which happened once, to two measurement scripts written during the Phase 7 rehearsal (`I-53`).
      '.local/**',
    ],
  },

  // Baseline: plain JavaScript (the config files and the scripts).
  {
    files: ['**/*.{js,mjs,cjs}'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.es2021 },
    },
  },

  // TypeScript and TSX: Babel parses, the plugin rules see the AST.
  {
    files: ['**/*.{ts,tsx}'],
    ...js.configs.recommended,
    languageOptions: {
      parser: babelParser,
      parserOptions: { requireConfigFile: false, babelOptions, ecmaVersion: 2023, sourceType: 'module' },
      globals: { ...globals.node, ...globals.browser },
    },
    plugins: {
      '@next/next': nextPlugin,
      'react-hooks': reactHooks,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      ...reactHooks.configs.recommended.rules,

      // `tsc --noEmit` owns undefined-identifier checking for TypeScript. `no-undef` in a
      // TS project reports type-only names as undefined, so it is a false-positive
      // generator, not a safety net.
      'no-undef': 'off',

      // Same reasoning for unused symbols, one level deeper: the core rule does not walk
      // TypeScript type positions, so an `import type { X }` used only in a signature is
      // reported as unused. TypeScript understands its own type positions, so the check
      // lives in `tsc --noEmit` via `noUnusedLocals`/`noUnusedParameters` (D78) and the
      // rule is off here rather than silenced per file.
      'no-unused-vars': 'off',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],

      // C8 (04 S5.9). Must stay in error: a vendor SDK outside src/lib/llm/ is the one
      // import the architecture forbids outright.
      'no-restricted-imports': ['error', { patterns: VENDOR_SDK_PATTERNS }],
    },
  },

  // C8's exception (04 S5.9): the adapter is the only place a vendor SDK may be imported.
  {
    files: ['src/lib/llm/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': 'off' },
  },

  // Scripts run in Node and are the one place a CLI may print to stdout.
  {
    files: ['scripts/**/*.{ts,mjs,js}'],
    rules: { 'no-console': 'off' },
  },
];
