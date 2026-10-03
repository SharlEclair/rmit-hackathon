#!/usr/bin/env node
/**
 * C8 backstop: `04` S5.9 check 2.
 *
 * ESLint's `no-restricted-imports` catches an imported vendor SDK. It cannot catch a raw
 * `fetch()` to the provider, which is the failure mode that actually matters: it bypasses
 * the adapter's budget accounting, its thinking-level policy, and its no-secret-in-a-log
 * handling (C7, C8, D39, D73).
 *
 * This gate fails when a provider hostname or an inline bearer token appears anywhere
 * under `src/` outside `src/lib/llm/`. It is deliberately a plain string search: a
 * cleverer matcher is a matcher someone can reason around.
 *
 * Run by `pnpm lint`.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_ROOT = join(APP_ROOT, 'src');
const ADAPTER_DIR = join(SRC_ROOT, 'lib', 'llm');

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mjs', '.js', '.cjs'];

/** Each entry is a substring that must not appear outside the adapter. */
const FORBIDDEN = [
  'api.deepseek.com',
  'generativelanguage.googleapis.com',
  'generativelanguage.googleapis',
  'Authorization: Bearer',
  'authorization: bearer',
  'x-goog-api-key',
];

function walk(directory) {
  const found = [];
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      found.push(...walk(full));
      continue;
    }
    if (SOURCE_EXTENSIONS.some((extension) => entry.endsWith(extension))) found.push(full);
  }
  return found;
}

const violations = [];

for (const file of walk(SRC_ROOT)) {
  // The adapter is the only place a provider hostname or header may be named (C8).
  if (file.startsWith(ADAPTER_DIR)) continue;
  const source = readFileSync(file, 'utf8');
  for (const needle of FORBIDDEN) {
    const lines = source.split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index].includes(needle)) {
        violations.push(`${relative(APP_ROOT, file)}:${index + 1} contains "${needle}"`);
      }
    }
  }
}

if (violations.length > 0) {
  process.stderr.write(
    'C8 VIOLATION (04 S5.9): a provider hostname or credential header appears outside ' +
      'src/lib/llm/. Every model call must go through the provider adapter.\n',
  );
  for (const violation of violations) process.stderr.write(`  ${violation}\n`);
  process.exit(1);
}

process.stdout.write('C8 import/endpoint gate: ok\n');
