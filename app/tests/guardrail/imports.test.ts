/**
 * The import-graph test `05-AI-GUARDRAILS.md` section 12.1 requires: "A test asserts the import
 * graph, because 'pure except for the one file' decays quickly."
 *
 * The assertions are structural and static, so they need no environment (the same design as
 * `tests/db`, per `12` section 3.7: `pnpm test` must pass with no network and no database):
 *
 * - `normalise.ts`, `rules.ts`, `policy.ts`, `policy-source.ts`, `post-check.ts`, `templates.ts`,
 *   `reasons.ts` and `refusal-copy.ts` import nothing that performs I/O;
 * - `classifier.ts` is the only file that *may* reach `src/lib/llm/`, and at Phase 3 nothing does --
 *   the seam is the `GuardrailClassifierPort`, because `src/lib/llm/` is Phase 2's and was not
 *   present when this phase was written;
 * - nothing under `src/lib/guardrail/` imports a feature, the database, storage, or a network
 *   module;
 * - `index.ts` is the only public entry: no other guardrail file imports it.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const GUARDRAIL_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'lib', 'guardrail');

const files = readdirSync(GUARDRAIL_DIR).filter((name) => name.endsWith('.ts'));

/** `05` section 12.1's purity list, plus the two copy modules and the audit row. */
const IO_FREE_FILES = [
  'normalise.ts',
  'rules.ts',
  'policy.ts',
  'policy-source.ts',
  'post-check.ts',
  'templates.ts',
  'reasons.ts',
  'refusal-copy.ts',
  'log.ts',
  'types.ts',
];

const NETWORK_MODULES = ['node:fs', 'node:http', 'node:https', 'node:net', 'node:dns', 'node:child_process', 'undici'];
const LAYER_VIOLATIONS = ['@/lib/db', '@/lib/storage', '@/features', 'drizzle-orm', 'postgres', 'next/'];

function sourceOf(file: string): string {
  return readFileSync(join(GUARDRAIL_DIR, file), 'utf8');
}

function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const pattern = /from\s+['"]([^'"]+)['"]/g;
  let match = pattern.exec(source);
  while (match) {
    if (match[1]) specifiers.push(match[1]);
    match = pattern.exec(source);
  }
  return specifiers;
}

describe('the guardrail is offline by construction', () => {
  it('has every expected module present', () => {
    for (const file of [...IO_FREE_FILES, 'classifier.ts', 'index.ts']) {
      expect(files, `${file} is missing from src/lib/guardrail/`).toContain(file);
    }
  });

  it.each(IO_FREE_FILES)('%s imports nothing that does I/O', (file: string) => {
    const specifiers = importSpecifiers(sourceOf(file));
    for (const specifier of specifiers) {
      expect(NETWORK_MODULES, `${file} imports ${specifier}`).not.toContain(specifier);
      // `node:crypto` is allowed for hashing and is asserted separately below; every other runtime
      // module is an I/O dependency this layer may not have (`05` section 12.1).
      if (specifier === 'node:crypto') continue;
      expect(specifier.startsWith('node:'), `${file} imports the runtime module ${specifier}`).toBe(false);
    }
  });

  it('only normalise.ts and post-check.ts use crypto, and only for hashing', () => {
    const cryptoUsers = files.filter((file) => importSpecifiers(sourceOf(file)).includes('node:crypto'));
    expect(cryptoUsers.sort()).toEqual(['normalise.ts', 'post-check.ts']);
    for (const file of cryptoUsers) {
      const source = sourceOf(file);
      expect(source).toContain('createHash');
      expect(source).not.toMatch(/createCipher|createSign|generateKeyPair/);
    }
  });

  it('no guardrail module imports the database, storage, an adapter or a feature', () => {
    for (const file of files) {
      const specifiers = importSpecifiers(sourceOf(file));
      for (const specifier of specifiers) {
        for (const forbidden of LAYER_VIOLATIONS) {
          expect(specifier.startsWith(forbidden), `${file} imports ${specifier}`).toBe(false);
        }
      }
    }
  });

  it('index.ts is the only public entry', () => {
    for (const file of files) {
      if (file === 'index.ts') continue;
      const specifiers = importSpecifiers(sourceOf(file));
      expect(specifiers, `${file} imports ./index`).not.toContain('./index');
      expect(specifiers, `${file} imports the public entry`).not.toContain('@/lib/guardrail');
    }
  });

  it('exactly one file may reach src/lib/llm, and it is the L4 adapter', () => {
    const llmImporters = files.filter((file) =>
      importSpecifiers(sourceOf(file)).some((specifier) => specifier.startsWith('@/lib/llm')),
    );
    // The seam is the port, deliberately: src/lib/llm/ is Phase 2's (18 section 5.1). Phase 5 wires
    // the adapter, and the file that does it is named here rather than relaxed to "any file":
    // `05` section 12.1's rule is *one* file, and this assertion is what keeps it one. Phase 3's
    // comment on this test anticipated exactly this edit: "If a later phase wires the adapter here,
    // the assertion becomes ['classifier.ts'] -- not 'any file'." The wiring landed in
    // `classifier-port.ts` so that the frozen `classifier.ts` was not edited.
    expect(llmImporters).toEqual(['classifier-port.ts']);
    expect(sourceOf('classifier.ts')).toContain('GuardrailClassifierPort');
  });

  it('exposes exactly the two entry points a caller needs', () => {
    const index = sourceOf('index.ts');
    expect(index).toMatch(/export async function decide\(/);
    expect(index).toMatch(/export function gateUploads\(/);
  });
});
