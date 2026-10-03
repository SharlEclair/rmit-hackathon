/*
 * G4 as a test -- `17` S6.4, S12 G4, and the parity half of the style gate in `17` S7.6
 * rule 3.
 *
 * This file asserts BOTH directions of the gate, not just the passing one. A parity test
 * that only proves the repository is currently consistent proves nothing about the next
 * commit: the failure modes that matter are a dropped token, a renamed token, a silently
 * retuned value (trap T11 is exactly this: `--border-peer` moved from `#98A2B3` to
 * `#667085` and G4 passed either way because it only compared a value against itself), and
 * a new L2 token invented without a doc change. Each of those is a synthetic fixture below
 * that must produce a violation.
 *
 * The tests import `scripts/check-design.mjs` rather than restating its rules. It is a
 * plain Node ESM script with no declaration file and `allowJs` is false, so the import is
 * a runtime-computed URL cast to the interface this file declares. That is deliberate: a
 * copy of the rules here would drift from the rules `pnpm lint` enforces.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

interface GateResult {
  name: string;
  ok: boolean;
  detail: string;
  violations: unknown[];
}

interface Gate {
  parseCssDeclarations(css: string): Map<string, string>;
  resolveValue(name: string, declarations: Map<string, string>): string | undefined;
  extractSection(markdown: string, headingPattern: RegExp): string | null;
  extractFencedBlock(section: string, language?: string): string | null;
  parseSpecTokenBlock(block: string): Map<string, string>;
  parseSpecPrimitives(block: string): Map<string, string>;
  missingProseRows(block: string): Array<{ id: string }>;
  allowedL2Names(specTokens: Map<string, string>): Set<string>;
  compareTokenParity(args: {
    specTokens: Map<string, string>;
    declarations: Map<string, string>;
    allowedExtra: Set<string>;
  }): { violations: string[]; checked: number };
  comparePrimitiveParity(args: {
    specPrimitives: Map<string, string>;
    declarations: Map<string, string>;
  }): string[];
  parseFontStacksFromTs(ts: string): Map<string, string>;
  REQUIRED_EXTRA: Map<string, { value: string; source: string }>;
  runGate(): { results: GateResult[]; violations: unknown[] };
}

const gateUrl = new URL('../../scripts/check-design.mjs', import.meta.url).href;
const gate = (await import(/* @vite-ignore */ gateUrl)) as unknown as Gate;

const APP_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const REPO_ROOT = join(APP_ROOT, '..');

const readApp = (relativePath: string) => readFileSync(join(APP_ROOT, relativePath), 'utf8');
const readRepo = (relativePath: string) => readFileSync(join(REPO_ROOT, relativePath), 'utf8');

const TOKENS_CSS = readApp('src/styles/tokens.css');
const FONTS_TS = readApp('src/styles/fonts.ts');
const TOKEN_DECLARATIONS = gate.parseCssDeclarations(TOKENS_CSS);

/** The `07` S2.3 token block, parsed by the gate's own parser. */
function specTokensFrom07(): Map<string, string> {
  const section = gate.extractSection(readRepo('docs/07-UI-UX-SPEC.md'), /^###\s+2\.3\s/) ?? '';
  const block = gate.extractFencedBlock(section, 'text') ?? '';
  return gate.parseSpecTokenBlock(block);
}

/** The L1 primitive block of `17` S3.2, parsed by the gate's own parser. */
function specPrimitivesFrom17(): Map<string, string> {
  const section = gate.extractSection(readRepo('docs/17-DESIGN-SYSTEM.md'), /^###\s+3\.2\s/) ?? '';
  const block = gate.extractFencedBlock(section, 'css') ?? '';
  return gate.parseSpecPrimitives(block);
}

function parity(
  spec: string,
  declarations: Array<[string, string]>,
): { violations: string[]; checked: number } {
  const specTokens = gate.parseSpecTokenBlock(spec);
  return gate.compareTokenParity({
    specTokens,
    declarations: new Map(declarations),
    allowedExtra: gate.allowedL2Names(specTokens),
  });
}

describe('token parity gate (G4, 07 S2.3 is the contract)', () => {
  it('parses all 24 tokens of 07 S2.3 and finds every one declared with the stated value', () => {
    const specTokens = specTokensFrom07();
    const result = gate.compareTokenParity({
      specTokens,
      declarations: TOKEN_DECLARATIONS,
      allowedExtra: gate.allowedL2Names(specTokens),
    });

    expect(result.checked).toBe(24);
    expect(result.violations).toEqual([]);
  });

  it('declares no L2 token outside 07 S2.3 plus the authorised additions', () => {
    const specTokens = specTokensFrom07();
    const allowed = gate.allowedL2Names(specTokens);
    const declaredL2 = [...TOKEN_DECLARATIONS.keys()].filter((name) => !name.startsWith('--p-'));

    expect(declaredL2.filter((name) => !allowed.has(name))).toEqual([]);
    expect(declaredL2.length).toBe(32);
  });

  it('resolves --border-peer through L1 to #667085 and never to #98A2B3 (D65, trap T11)', () => {
    expect(gate.resolveValue('--border-peer', TOKEN_DECLARATIONS)).toBe('#667085');
    expect(gate.resolveValue('--border-peer', TOKEN_DECLARATIONS)).not.toBe('#98A2B3');
    expect(gate.resolveValue('--p-slate-500', TOKEN_DECLARATIONS)).toBe('#667085');
  });

  it('declares the four added semantic tokens of 17 S3.3', () => {
    for (const name of [
      '--surface-document-mat',
      '--surface-document-edge',
      '--focus-ring-width',
      '--focus-ring-offset',
    ]) {
      expect(gate.REQUIRED_EXTRA.has(name)).toBe(true);
      expect(TOKEN_DECLARATIONS.has(name)).toBe(true);
    }
  });

  it('fails when a token 07 S2.3 names is missing from tokens.css', () => {
    const result = parity('--surface-page #F7F8FA\n--surface-card #FFFFFF', [
      ['--surface-page', '#F7F8FA'],
    ]);

    expect(result.checked).toBe(2);
    expect(result.violations.join('\n')).toContain('missing L2 token --surface-card');
  });

  it('fails when a token is renamed, naming both the loss and the unlisted token', () => {
    const result = parity('--border-peer #667085', [['--border-peers', '#667085']]);

    const joined = result.violations.join('\n');
    expect(joined).toContain('missing L2 token --border-peer');
    expect(joined).toContain('unlisted L2 token --border-peers');
  });

  it('fails when a value is silently retuned back to the pre-D65 #98A2B3', () => {
    const result = parity('--border-peer #667085', [['--border-peer', '#98A2B3']]);

    expect(result.violations.join('\n')).toContain('retuned L2 token --border-peer');
  });

  it('fails when an L2 token is invented without a doc change', () => {
    const result = parity('--surface-page #F7F8FA', [
      ['--surface-page', '#F7F8FA'],
      ['--surface-invented', '#123456'],
    ]);

    expect(result.violations.join('\n')).toContain('unlisted L2 token --surface-invented');
  });

  it('compares the resolved value, so an L2 reference to L1 matches the doc hex', () => {
    const result = parity('--border-peer #667085', [
      ['--p-slate-500', '#667085'],
      ['--border-peer', 'var(--p-slate-500)'],
    ]);

    expect(result.violations).toEqual([]);
  });

  it('fails when an L2 reference cannot be resolved through L1', () => {
    const result = parity('--border-peer #667085', [['--border-peer', 'var(--p-slate-500)']]);

    expect(result.violations.join('\n')).toContain('retuned L2 token --border-peer');
  });

  it('compares values whitespace-insensitively but nothing else', () => {
    const result = parity('--surface-page   #F7F8FA', [['--surface-page', '  #F7F8FA  ']]);
    expect(result.violations).toEqual([]);
  });
});

describe('L1 primitive parity gate (17 S3.2)', () => {
  it('declares the 22 primitives exactly, including both slate greys', () => {
    const specPrimitives = specPrimitivesFrom17();

    expect(specPrimitives.size).toBe(22);
    expect(specPrimitives.get('--p-slate-500')).toBe('#667085');
    expect(specPrimitives.get('--p-slate-400')).toBe('#98A2B3');
    expect(
      gate.comparePrimitiveParity({ specPrimitives, declarations: TOKEN_DECLARATIONS }),
    ).toEqual([]);
  });

  it('fails when a primitive is retuned', () => {
    const violations = gate.comparePrimitiveParity({
      specPrimitives: new Map([['--p-slate-500', '#667085']]),
      declarations: new Map([['--p-slate-500', '#98A2B3']]),
    });

    expect(violations.join('\n')).toContain('retuned L1 primitive --p-slate-500');
  });

  it('fails when a primitive is invented', () => {
    const violations = gate.comparePrimitiveParity({
      specPrimitives: new Map([['--p-slate-500', '#667085']]),
      declarations: new Map([
        ['--p-slate-500', '#667085'],
        ['--p-slate-450', '#7A8797'],
      ]),
    });

    expect(violations.join('\n')).toContain('unlisted L1 primitive --p-slate-450');
  });
});

describe('doc guard rails', () => {
  it('fails if 07 S2.3 rewords the prose Focus row instead of dropping the token', () => {
    const reworded = 'Focus  --focus-ring 2px solid --state-info with a 3px offset';
    expect(gate.missingProseRows(reworded)).toHaveLength(1);
    expect(gate.missingProseRows(gate.extractFencedBlock(readRepo('docs/07-UI-UX-SPEC.md'), 'text') ?? '')).toEqual([]);
  });

  it('keeps the font stacks in tokens.css and fonts.ts identical', () => {
    const stacks = gate.parseFontStacksFromTs(FONTS_TS);

    expect(stacks.size).toBe(3);
    expect(stacks.get('--font-editorial')).toBe('Georgia, "Times New Roman", serif');
    for (const [name, stack] of stacks) {
      expect(gate.resolveValue(name, TOKEN_DECLARATIONS)).toBe(stack);
    }
  });
});

describe('the whole gate against the repository', () => {
  it('reports every named gate line and no violation', () => {
    const { results, violations } = gate.runGate();
    const names = results.map((result) => result.name);

    expect(violations).toEqual([]);
    expect(results.every((result) => result.ok)).toBe(true);
    for (const expected of [
      'G4a token parity vs 07 S2.3',
      'G4b L1 primitives vs 17 S3.2',
      'G4c added L2 tokens',
      'G4d font stacks match fonts.ts',
      'G5a default theme replaced not extended',
      'G5b no network font',
      'G5c no banned font family in a stack',
      'G8a motion ceiling',
      'G8b keyframe containment',
      'G9 grain containment',
      'HEX tokens.css is the only hex literal',
      'L1 no component reads a primitive',
      'DEF every referenced token is declared',
    ]) {
      expect(names).toContain(expected);
    }
  });
});
