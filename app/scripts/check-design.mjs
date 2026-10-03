#!/usr/bin/env node
/**
 * Design-system gates -- `17-DESIGN-SYSTEM.md` section 12 (G4, G5, G8, G9) plus the style
 * gate of `17` S7.6 rule 3 that this script owns. Run by `pnpm lint`, and asserted by
 * `app/tests/design/token-parity.test.ts`, which imports the pure functions below so the
 * gate's rejecting direction is tested and not merely its passing one.
 *
 * Contract of each gate, and what "fails" means:
 *
 *   G4a  token parity with `07` S2.3. Parses the fenced `text` block of `07` S2.3, and
 *        requires `tokens.css` to declare every name in it with the same value. Values are
 *        compared after resolving L2 `var(--p-*)` references into the L1 ramp, so the
 *        comparison is against what the browser computes, not against the reference text.
 *   G4b  L1 parity with `17` S3.2. Same comparison for the primitive ramp, both directions.
 *   G4c  the authorised L2 additions (`17` S3.3, plus the two `17` names `07` does not
 *        carry: `--shadow-overlay` from S3.5 and the three font stacks of S2.2/S2.3).
 *        Any other L2 token in `tokens.css` is a violation, so a semantic token cannot be
 *        invented without a doc change.
 *   G4d  the font stacks in `tokens.css` and `src/styles/fonts.ts` are identical.
 *   G5a  `tailwind.config.ts` replaces the default theme: no `extend` entry for `colors`
 *        or `fontFamily`, no default-theme spread.
 *   G5b  no font CDN and no font stylesheet import anywhere in `src/` or the config.
 *   G5c  no Inter, Roboto, Arial or `system-ui` in any declared font stack (`17` S2.2).
 *   G8a  no transition or animation duration above 150ms (`07` S2.7, `17` S10.4 rule 1).
 *   G8b  no `@keyframes` outside `motion.css` and `components/ui/skeleton.tsx` (S10.4 r3).
 *   G9   exactly one selector applies the paper grain, and it is the T1 selector (S3.4).
 *   HEX  no hex literal outside `tokens.css` (`17` S6.1 rule 2).
 *   L1   no component reads an L1 primitive (`17` S6.1 rule 1).
 *   DEF  every custom property referenced by the Tailwind config or by a stylesheet is
 *        declared (the I-44 defect class: a theme key that resolves to nothing).
 *
 * Not implemented here, and deliberately: G2 (adopt-list and radius scan), G6 (computed
 * focus styles), G7 (contrast pair extraction), G10 (authority-type containment). Those
 * need the component tree and, for G6/G7, a browser. G1 and G3 are the e2e screenshot
 * gate. Do not read this script's "ok" as coverage of them.
 *
 * Scope note for the DEF gate: it reads the Tailwind config and `src/styles/*.css`, not
 * the whole source tree. A vendored shadcn component legitimately introduces its own
 * `--radix-*` variables (`17` S7.2), and a check that failed on those would be a false
 * positive that a later session would have to disable.
 *
 * Text scanning is NOT uniform, and the difference is deliberate. G5b, G5c, G8a, G9 and
 * the font-stack walk blank block comments first, because a prose mention is not a fetch,
 * a class string or an animation. HEX and L1 read the file verbatim, in the tradition of
 * `scripts/check-c8.mjs` ("a cleverer matcher is a matcher someone can reason around"):
 * that direction can only OVER-catch, never let a value through, so a hex literal or an
 * `--p-*` name written inside a comment fails the gate and the message says why. The two
 * cases are not symmetric with a gate that resolves declarations out of comments -- that
 * one becomes vacuous, this one becomes louder.
 *
 * HEX and L1 also read `src/` only, never `tests/` or `scripts/`. `17` S6.1 rule 2 governs
 * a COMPONENT that needs a value; a test that pins the contract must write the expected
 * hex, and `app/tests/design/token-parity.test.ts` does exactly that on purpose. Widening
 * the scope would fail the gate's own refusal tests and so force the gate to be weakened,
 * which is the one repair that must never happen. The hex matcher also requires 6 or 8
 * digits, or a letter, so a pseudonym such as `Anonymous Student #482` is not a colour.
 *
 * CSS is stripped of block comments only. CSS has no `//` comment form, and
 * `src/styles/texture.css` carries a grain data URI containing `http://www.w3.org/2000/svg`:
 * a line-comment strip would truncate that line and could hide whatever follows it.
 *
 * No network, no database, no writes. Plain node, no dependency (`17` S7.6 rule 3).
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(SCRIPT_DIR, '..');
const REPO_ROOT = resolve(APP_ROOT, '..');

const SRC_DIR = join(APP_ROOT, 'src');
const STYLES_DIR = join(SRC_DIR, 'styles');
const TOKENS_CSS = join(STYLES_DIR, 'tokens.css');
const MOTION_CSS = join(STYLES_DIR, 'motion.css');
const TEXTURE_CSS = join(STYLES_DIR, 'texture.css');
const GLOBALS_CSS = join(STYLES_DIR, 'globals.css');
const TYPOGRAPHY_CSS = join(STYLES_DIR, 'typography.css');
const FONTS_TS = join(STYLES_DIR, 'fonts.ts');
const TAILWIND_CONFIG = join(APP_ROOT, 'tailwind.config.ts');
const SPEC_07 = join(REPO_ROOT, 'docs', '07-UI-UX-SPEC.md');
const SPEC_17 = join(REPO_ROOT, 'docs', '17-DESIGN-SYSTEM.md');

/** The one duration ceiling the product has (`07` S2.7, `17` S10.4). */
const MAX_DURATION_MS = 150;

/** Files where an `@keyframes` block is permitted (`17` S10.4 rule 3). */
const KEYFRAME_ALLOWED = ['src/styles/motion.css', 'src/components/ui/skeleton.tsx'];

/** Font families banned at any position in a stack (`17` S2.2 rule 1, anti-pattern 12). */
const BANNED_FAMILIES = /\b(Inter|Roboto|Arial|system-ui)\b/i;

/** The source files the HEX, L1 and keyframe scanners read. */
const SCAN_EXTENSIONS = ['.ts', '.tsx', '.css'];

// ---------------------------------------------------------------------------
// Text and CSS helpers
// ---------------------------------------------------------------------------

/** Path relative to `app/`, with forward slashes, for stable messages on Windows. */
export function relToApp(file) {
  return relative(APP_ROOT, file).split('\\').join('/');
}

/** 1-based line number of a character offset. */
export function lineAt(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i += 1) if (text[i] === '\n') line += 1;
  return line;
}

/** Blank out comments while preserving newlines, so line numbers stay true. */
export function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '));
}

/** Whitespace-insensitive form. "Whitespace-insensitive" is literal: nothing else moves. */
export function normaliseValue(value) {
  return String(value).replace(/\s+/g, ' ').trim();
}

/**
 * Every `--name: value;` declaration in a stylesheet, in source order.
 * The value stops at `;`, `{` or `}` so a rule without a trailing semicolon cannot swallow
 * the next block.
 */
export function parseCssDeclarationsWithLines(cssText) {
  const declarations = new Map();
  const text = stripComments(cssText);
  const pattern = /(--[a-z0-9-]+)\s*:\s*([^;{}]+);/g;
  let match = pattern.exec(text);
  while (match !== null) {
    if (!declarations.has(match[1])) {
      declarations.set(match[1], { value: normaliseValue(match[2]), line: lineAt(text, match.index) });
    }
    match = pattern.exec(text);
  }
  return declarations;
}

/** The same map without line numbers, which is what the parity checks need. */
export function parseCssDeclarations(cssText) {
  const plain = new Map();
  for (const [name, entry] of parseCssDeclarationsWithLines(cssText)) plain.set(name, entry.value);
  return plain;
}

/**
 * Substitute `var(--x)` references until none remains, so two declarations are compared as
 * the browser would resolve them. An unresolvable reference is left in place: that makes
 * the comparison fail, which is the correct outcome for a missing primitive or a cycle.
 */
export function resolveExpression(expression, declarations, seen = new Set()) {
  return normaliseValue(
    String(expression).replace(/var\(\s*(--[a-z0-9-]+)\s*\)/g, (reference, name) => {
      if (seen.has(name)) return reference;
      const raw = declarations.get(name);
      if (raw === undefined) return reference;
      const chain = new Set(seen);
      chain.add(name);
      return resolveExpression(raw, declarations, chain);
    }),
  );
}

export function resolveValue(name, declarations) {
  const raw = declarations.get(name);
  return raw === undefined ? undefined : resolveExpression(raw, declarations);
}

/** The slice of a markdown file from a heading line to the next heading of the same level. */
export function extractSection(markdown, headingPattern) {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => headingPattern.test(line));
  if (start === -1) return null;
  const level = /^(#+)/.exec(lines[start])[1].length;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const heading = /^(#+)\s/.exec(lines[index]);
    if (heading && heading[1].length <= level) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

/** The first fenced block of a section, optionally requiring its language tag. */
export function extractFencedBlock(sectionText, language) {
  const lines = sectionText.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const opening = /^```(\w*)\s*$/.exec(lines[index]);
    if (!opening) continue;
    if (language && opening[1] !== language) continue;
    const body = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      if (/^```\s*$/.test(lines[cursor])) return body.join('\n');
      body.push(lines[cursor]);
    }
    return null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// `07` S2.3 token block
// ---------------------------------------------------------------------------

/**
 * Rows in `07` S2.3 that are a sentence rather than a `--name value` pair, and the
 * translation this gate applies. The `match` is exact (after whitespace collapsing): if
 * `07` rewords the row, the row no longer matches, the normal parser then mis-reads
 * `--state-info`, and the gate fails loudly instead of dropping a token. `missingProseRows`
 * makes that failure explicit rather than leaving it to a confusing value mismatch.
 */
export const PROSE_ROWS = [
  {
    id: '07 S2.3 Focus row',
    match: /^Focus\s+--focus-ring 2px solid --state-info with 2px offset, always visible$/,
    token: '--focus-ring',
    value: '2px solid var(--state-info)',
  },
];

/** Prose rows whose exact wording is no longer present in the block. */
export function missingProseRows(blockText) {
  const normalised = blockText.split('\n').map((line) => normaliseValue(line));
  return PROSE_ROWS.filter((row) => !normalised.some((line) => row.match.test(line)));
}

/**
 * Every `--name value` pair in the `07` S2.3 block, plus the prose rows above translated.
 *
 * `07` writes the pairs space-separated and column-aligned, so a name's value is the text
 * between it and the next name on the same line. A trailing parenthetical annotation
 * (`(solid)`, `(dashed)`, `(dotted)`, `(cards)`, `(badges)`) is not part of the value: it is
 * stripped only when whitespace precedes the `(`, so `rgba(16,24,40,0.06)` survives intact.
 */
export function parseSpecTokenBlock(blockText) {
  const tokens = new Map();
  for (const rawLine of blockText.split('\n')) {
    const line = normaliseValue(rawLine);
    if (line === '') continue;

    const prose = PROSE_ROWS.find((row) => row.match.test(line));
    if (prose) {
      tokens.set(prose.token, prose.value);
      continue;
    }

    if (!line.includes('--')) continue;
    for (const part of line.split(/(?=--[a-z0-9-]+\b)/)) {
      const match = /^(--[a-z0-9-]+)([\s\S]*)$/.exec(part);
      if (!match) continue;
      const value = normaliseValue(match[2].replace(/\s+\([^)]*\)$/, ''));
      if (value === '') continue;
      tokens.set(match[1], value);
    }
  }
  return tokens;
}

/** The L1 primitive declarations of `17` S3.2's fenced `css` block. */
export function parseSpecPrimitives(blockText) {
  const primitives = new Map();
  const text = stripComments(blockText);
  const pattern = /^\s*(--p-[a-z0-9-]+)\s*:\s*([^;]+);/gm;
  let match = pattern.exec(text);
  while (match !== null) {
    primitives.set(match[1], normaliseValue(match[2]));
    match = pattern.exec(text);
  }
  return primitives;
}

// ---------------------------------------------------------------------------
// The authorised L2 set
// ---------------------------------------------------------------------------

/**
 * L2 tokens `17` names that `07` S2.3 does not carry. Each entry cites its source, so the
 * allowlist cannot grow silently.
 *
 * `--shadow-overlay` is `17` S3.5's new semantic token, and `17` S6.3's Tailwind boxShadow
 * map -- already committed in `app/tailwind.config.ts` -- reads it. `17` S3.3 enumerates
 * only four additions, so S3.3's count is one short of what the same document requires;
 * that divergence is reported rather than worked around, and the alternative (leaving the
 * theme key undefined) is the I-44 defect class the DEF gate exists to catch.
 */
export const REQUIRED_EXTRA = new Map([
  ['--surface-document-mat', { value: 'var(--p-paper-050)', source: '17 S3.3' }],
  ['--surface-document-edge', { value: 'var(--p-paper-200)', source: '17 S3.3' }],
  ['--focus-ring-width', { value: '2px', source: '17 S3.3' }],
  ['--focus-ring-offset', { value: '2px', source: '17 S3.3' }],
  [
    '--shadow-overlay',
    {
      value: '0 8px 24px rgba(16,24,40,0.12), 0 1px 2px rgba(16,24,40,0.08)',
      source: '17 S3.5',
    },
  ],
]);

/** Font roles of `17` S2.1. The stack values live in `fonts.ts` and are checked by G4d. */
export const FONT_ROLES = ['editorial', 'ui', 'mono'];

/** Every L2 name the docs authorise: `07` S2.3, `17` S3.3, `17` S3.5, `17` S2.2. */
export function allowedL2Names(specTokens) {
  const allowed = new Set(specTokens.keys());
  for (const name of REQUIRED_EXTRA.keys()) allowed.add(name);
  for (const role of FONT_ROLES) allowed.add(`--font-${role}`);
  return allowed;
}

// ---------------------------------------------------------------------------
// Pure comparisons
// ---------------------------------------------------------------------------

/**
 * G4a. Both directions: a `07` S2.3 name must exist with the same resolved value, and no
 * L2 token outside the authorised set may exist. Renaming, dropping, retuning and inventing
 * therefore all fail.
 */
export function compareTokenParity({ specTokens, declarations, allowedExtra }) {
  const violations = [];
  let checked = 0;

  for (const [name, expected] of specTokens) {
    checked += 1;
    const actual = resolveValue(name, declarations);
    if (actual === undefined) {
      violations.push(`missing L2 token ${name} (07 S2.3 states "${expected}")`);
      continue;
    }
    if (actual !== resolveExpression(expected, declarations)) {
      violations.push(
        `retuned L2 token ${name}: tokens.css resolves to "${actual}", 07 S2.3 states "${expected}"`,
      );
    }
  }

  for (const name of declarations.keys()) {
    if (name.startsWith('--p-')) continue;
    if (specTokens.has(name)) continue;
    if (allowedExtra.has(name)) continue;
    violations.push(
      `unlisted L2 token ${name}: not named by 07 S2.3 nor by the additions this gate allows`,
    );
  }

  return { violations, checked };
}

/** G4b. The same both-directions comparison for the L1 ramp of `17` S3.2. */
export function comparePrimitiveParity({ specPrimitives, declarations }) {
  const violations = [];

  for (const [name, expected] of specPrimitives) {
    const actual = resolveValue(name, declarations);
    if (actual === undefined) {
      violations.push(`missing L1 primitive ${name} (17 S3.2 states "${expected}")`);
      continue;
    }
    if (actual !== normaliseValue(expected)) {
      violations.push(
        `retuned L1 primitive ${name}: tokens.css declares "${actual}", 17 S3.2 states "${expected}"`,
      );
    }
  }

  for (const name of declarations.keys()) {
    if (!name.startsWith('--p-')) continue;
    if (!specPrimitives.has(name)) violations.push(`unlisted L1 primitive ${name}: not in 17 S3.2`);
  }

  return violations;
}

/** The FONT_STACKS literal of `fonts.ts`, as `--font-<role>` -> stack. */
export function parseFontStacksFromTs(tsText) {
  const stacks = new Map();
  const block = /FONT_STACKS\s*=\s*\{([\s\S]*?)\}/.exec(tsText);
  if (!block) return stacks;
  for (const role of FONT_ROLES) {
    const match = new RegExp(`(?:^|[,{\\s])${role}\\s*:\\s*'([^']*)'`).exec(block[1]);
    if (match) stacks.set(`--font-${role}`, match[1]);
  }
  return stacks;
}

// ---------------------------------------------------------------------------
// Repository scanning
// ---------------------------------------------------------------------------

function walk(directory, predicate) {
  const found = [];
  let entries;
  try {
    entries = readdirSync(directory);
  } catch {
    return found;
  }
  for (const entry of entries) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      found.push(...walk(full, predicate));
      continue;
    }
    if (predicate(full)) found.push(full);
  }
  return found;
}

function sourceFiles() {
  return walk(SRC_DIR, (file) => SCAN_EXTENSIONS.some((extension) => file.endsWith(extension)));
}

function readText(file) {
  return readFileSync(file, 'utf8');
}

function occurrences(text, pattern) {
  const found = [];
  pattern.lastIndex = 0;
  let match = pattern.exec(text);
  while (match !== null) {
    found.push({ index: match.index, match });
    match = pattern.exec(text);
  }
  return found;
}

/** Rule blocks of a stylesheet: selector -> declarations, comments blanked. */
function cssRuleBlocks(cssText) {
  const blocks = [];
  const text = stripComments(cssText);
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  let match = pattern.exec(text);
  while (match !== null) {
    blocks.push({ selector: match[1].replace(/\s+/g, ' ').trim(), body: match[2], index: match.index });
    match = pattern.exec(text);
  }
  return blocks;
}

function braceBlockAfter(text, startIndex) {
  const open = text.indexOf('{', startIndex);
  if (open === -1) return null;
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === '{') depth += 1;
    else if (text[index] === '}') {
      depth -= 1;
      if (depth === 0) return { start: open, body: text.slice(open + 1, index) };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// The gates
// ---------------------------------------------------------------------------

function toViolation(rule, where, message) {
  return { rule, where, message };
}

function runTokenParityGates(results, app) {
  const tokensText = readText(TOKENS_CSS);
  const declarations = parseCssDeclarationsWithLines(tokensText);
  const plainDeclarations = new Map();
  for (const [name, entry] of declarations) plainDeclarations.set(name, entry.value);
  const declarationLine = (name) => declarations.get(name)?.line ?? 1;
  const where = relToApp(TOKENS_CSS);

  // G4a -- `07` S2.3.
  const spec07 = readText(SPEC_07);
  const section23 = extractSection(spec07, /^###\s+2\.3\s/);
  const block07 = section23 === null ? null : extractFencedBlock(section23, 'text');
  if (block07 === null) {
    results.push({
      name: 'G4a token parity vs 07 S2.3',
      ok: false,
      detail: 'the fenced text block of section 2.3 could not be parsed',
      violations: [toViolation('G4', relToApp(SPEC_07), 'section 2.3 has no fenced text block')],
    });
  } else {
    const missingProse = missingProseRows(block07);
    const specTokens = parseSpecTokenBlock(block07);
    const parities = compareTokenParity({
      specTokens,
      declarations: plainDeclarations,
      allowedExtra: allowedL2Names(specTokens),
    });
    const violations = parities.violations.map((message) =>
      toViolation('G4', where, message),
    );
    for (const row of missingProse) {
      violations.push(
        toViolation('G4', relToApp(SPEC_07), `${row.id} is no longer in the expected form`),
      );
    }
    results.push({
      name: 'G4a token parity vs 07 S2.3',
      ok: violations.length === 0,
      detail: `${parities.checked} tokens declared and value-matched`,
      violations,
    });
    app.specTokens = specTokens;
  }

  // G4b -- the L1 ramp of `17` S3.2.
  const spec17 = readText(SPEC_17);
  const section32 = extractSection(spec17, /^###\s+3\.2\s/);
  const block32 = section32 === null ? null : extractFencedBlock(section32, 'css');
  if (block32 === null) {
    results.push({
      name: 'G4b L1 primitives vs 17 S3.2',
      ok: false,
      detail: 'the fenced css block of section 3.2 could not be parsed',
      violations: [toViolation('G4', relToApp(SPEC_17), 'section 3.2 has no fenced css block')],
    });
  } else {
    const specPrimitives = parseSpecPrimitives(block32);
    const violations = comparePrimitiveParity({
      specPrimitives,
      declarations: plainDeclarations,
    }).map((message) => toViolation('G4', where, message));
    results.push({
      name: 'G4b L1 primitives vs 17 S3.2',
      ok: violations.length === 0,
      detail: `${specPrimitives.size} primitives declared and value-matched`,
      violations,
    });
  }

  // G4c -- the authorised additions, and only those.
  const extraViolations = [];
  for (const [name, expected] of REQUIRED_EXTRA) {
    const actual = resolveValue(name, plainDeclarations);
    const wanted = resolveExpression(expected.value, plainDeclarations);
    if (actual === undefined) {
      extraViolations.push(
        toViolation('G4', where, `missing added L2 token ${name} (${expected.source} states "${expected.value}")`),
      );
      continue;
    }
    if (actual !== wanted) {
      extraViolations.push(
        toViolation(
          'G4',
          `${where}:${declarationLine(name)}`,
          `retuned added L2 token ${name}: tokens.css declares "${actual}", ${expected.source} states "${expected.value}"`,
        ),
      );
    }
  }
  results.push({
    name: 'G4c added L2 tokens',
    ok: extraViolations.length === 0,
    detail: `${REQUIRED_EXTRA.size} additions present and value-matched`,
    violations: extraViolations,
  });

  // G4d -- the two copies of each font stack agree.
  const fontsText = readText(FONTS_TS);
  const stacksFromTs = parseFontStacksFromTs(fontsText);
  const stackViolations = [];
  for (const role of FONT_ROLES) {
    const name = `--font-${role}`;
    const fromTs = stacksFromTs.get(name);
    const fromCss = resolveValue(name, plainDeclarations);
    if (fromTs === undefined) {
      stackViolations.push(
        toViolation('G4', relToApp(FONTS_TS), `FONT_STACKS.${role} could not be read from fonts.ts`),
      );
      continue;
    }
    if (fromCss === undefined) {
      stackViolations.push(toViolation('G4', where, `missing L2 token ${name}`));
      continue;
    }
    if (normaliseValue(fromTs) !== normaliseValue(fromCss)) {
      stackViolations.push(
        toViolation(
          'G4',
          `${where}:${declarationLine(name)}`,
          `${name} is "${fromCss}" but fonts.ts declares "${fromTs}" (17 S2.2/S2.3)`,
        ),
      );
    }
  }
  results.push({
    name: 'G4d font stacks match fonts.ts',
    ok: stackViolations.length === 0,
    detail: `${FONT_ROLES.length} stacks identical in both files`,
    violations: stackViolations,
  });

  return { plainDeclarations, declarationLine };
}

function runTailwindGates(results) {
  const configText = readText(TAILWIND_CONFIG);
  const text = stripComments(configText);
  const configViolations = [];

  if (/defaultTheme/.test(text)) {
    configViolations.push(
      toViolation('G5', relToApp(TAILWIND_CONFIG), 'the default theme is imported or spread (17 S6.3)'),
    );
  }
  if (!/fontFamily\s*:/.test(text)) {
    configViolations.push(
      toViolation('G5', relToApp(TAILWIND_CONFIG), 'theme.fontFamily is absent, so font-sans would resolve to the default stack'),
    );
  }
  if (!/(^|[,{\s])colors\s*:/.test(text)) {
    configViolations.push(
      toViolation('G5', relToApp(TAILWIND_CONFIG), 'theme.colors is absent, so the default palette is reachable'),
    );
  }
  const extendPattern = /extend\s*:\s*\{/g;
  let extend = extendPattern.exec(text);
  while (extend !== null) {
    const block = braceBlockAfter(text, extend.index);
    if (block) {
      for (const key of ['colors', 'fontFamily']) {
        if (new RegExp(`(^|[,{\\s])${key}\\s*:`).test(block.body)) {
          configViolations.push(
            toViolation(
              'G5',
              `${relToApp(TAILWIND_CONFIG)}:${lineAt(text, block.start)}`,
              `theme.extend.${key} is declared: the default theme is EXTENDED, not replaced (17 S6.3)`,
            ),
          );
        }
      }
      if (/\.\.\./.test(block.body)) {
        configViolations.push(
          toViolation(
            'G5',
            `${relToApp(TAILWIND_CONFIG)}:${lineAt(text, block.start)}`,
            'theme.extend spreads a default theme object (17 S6.3)',
          ),
        );
      }
    }
    extend = extendPattern.exec(text);
  }
  results.push({
    name: 'G5a default theme replaced not extended',
    ok: configViolations.length === 0,
    detail: 'no extend entry for colors or fontFamily',
    violations: configViolations,
  });

  // G5b -- no font CDN, no font stylesheet import, no next/font/google.
  // Comments are blanked first. The rule exists because a font must not be FETCHED
  // (`17` S2.3 rule 6), and a mention in a comment explains the ban rather than breaking
  // it; a check that failed on the explanation would be worked around rather than obeyed.
  // The pattern still catches a live `@import`, a live URL, and a live module import.
  const fontHostPattern = /fonts\.googleapis\.com|fonts\.gstatic\.com|next\/font\/google|@import[^;]*(https?:)?\/\/|@import[^;]*\.woff2?/;
  const hostViolations = [];
  for (const file of [...sourceFiles(), TAILWIND_CONFIG]) {
    const source = stripComments(readText(file));
    for (const hit of occurrences(source, new RegExp(fontHostPattern.source, 'g'))) {
      hostViolations.push(
        toViolation(
          'G5',
          `${relToApp(file)}:${lineAt(source, hit.index)}`,
          `a font is fetched from a network source: "${hit.match[0].trim()}" (17 S2.3 rule 6)`,
        ),
      );
    }
  }
  results.push({
    name: 'G5b no network font',
    ok: hostViolations.length === 0,
    detail: 'no font host, font stylesheet import or next/font/google',
    violations: hostViolations,
  });

  // G5c -- no banned family in any declared stack.
  const bannedViolations = [];
  const stacks = [];
  for (const file of sourceFiles().filter((candidate) => candidate.endsWith('.css'))) {
    const source = readText(file);
    const cssText = stripComments(source);
    for (const hit of occurrences(cssText, /font-family\s*:\s*([^;}]+)/g)) {
      stacks.push({ file, line: lineAt(cssText, hit.index), value: hit.match[1] });
    }
    if (file === TOKENS_CSS) {
      for (const [name, entry] of parseCssDeclarationsWithLines(source)) {
        if (name.startsWith('--font-')) stacks.push({ file, line: entry.line, value: entry.value });
      }
    }
  }
  const fontsTsText = readText(FONTS_TS);
  const fontsTsStripped = stripComments(fontsTsText);
  for (const hit of occurrences(fontsTsStripped, /:\s*'([^']*)'/g)) {
    stacks.push({ file: FONTS_TS, line: lineAt(fontsTsStripped, hit.index), value: hit.match[1] });
  }
  for (const stack of stacks) {
    if (BANNED_FAMILIES.test(stack.value)) {
      bannedViolations.push(
        toViolation(
          'G5',
          `${relToApp(stack.file)}:${stack.line}`,
          `a banned family appears in a font stack: "${stack.value}" (17 S2.2 rule 1)`,
        ),
      );
    }
  }
  results.push({
    name: 'G5c no banned font family in a stack',
    ok: bannedViolations.length === 0,
    detail: `Inter, Roboto, Arial and system-ui absent from ${stacks.length} declared stacks`,
    violations: bannedViolations,
  });
}

function runMotionGates(results) {
  const ceilingViolations = [];
  for (const file of sourceFiles()) {
    const source = readText(file);
    const text = stripComments(source);
    if (file.endsWith('.css')) {
      const pattern = /(?:transition|animation)(?:-duration)?\s*:\s*([^;}]+)/g;
      for (const hit of occurrences(text, pattern)) {
        const durations = /(\d+(?:\.\d+)?)(ms|s)\b/g;
        let duration = durations.exec(hit.match[1]);
        while (duration !== null) {
          const ms = duration[2] === 's' ? Number(duration[1]) * 1000 : Number(duration[1]);
          if (ms > MAX_DURATION_MS) {
            ceilingViolations.push(
              toViolation(
                'G8',
                `${relToApp(file)}:${lineAt(text, hit.index)}`,
                `${duration[0]} exceeds the ${MAX_DURATION_MS}ms ceiling (07 S2.7, 17 S10.4 rule 1)`,
              ),
            );
          }
          duration = durations.exec(hit.match[1]);
        }
      }
      continue;
    }
    const classPattern = /duration-(\d+)\b|duration-\[(\d+(?:\.\d+)?)(ms|s)\]/g;
    for (const hit of occurrences(text, classPattern)) {
      const ms = hit.match[1] !== undefined
        ? Number(hit.match[1])
        : hit.match[3] === 's'
          ? Number(hit.match[2]) * 1000
          : Number(hit.match[2]);
      if (ms > MAX_DURATION_MS) {
        ceilingViolations.push(
          toViolation(
            'G8',
            `${relToApp(file)}:${lineAt(text, hit.index)}`,
            `${hit.match[0]} exceeds the ${MAX_DURATION_MS}ms ceiling (17 S10.4 rule 1)`,
          ),
        );
      }
    }
  }
  results.push({
    name: 'G8a motion ceiling',
    ok: ceilingViolations.length === 0,
    detail: `no transition or animation duration above ${MAX_DURATION_MS}ms`,
    violations: ceilingViolations,
  });

  const keyframeViolations = [];
  for (const file of sourceFiles()) {
    const source = readText(file);
    const where = relToApp(file);
    if (KEYFRAME_ALLOWED.includes(where)) continue;
    for (const hit of occurrences(source, /@keyframes\s+[A-Za-z0-9_-]+/g)) {
      keyframeViolations.push(
        toViolation(
          'G8',
          `${where}:${lineAt(source, hit.index)}`,
          `@keyframes outside ${KEYFRAME_ALLOWED.join(' and ')} (17 S10.4 rule 3)`,
        ),
      );
    }
  }
  results.push({
    name: 'G8b keyframe containment',
    ok: keyframeViolations.length === 0,
    detail: `@keyframes allowed only in ${KEYFRAME_ALLOWED.join(' and ')}`,
    violations: keyframeViolations,
  });
}

function runTextureGate(results) {
  const violations = [];
  let grainSelectors = 0;
  let grainWhere = null;
  let grainSelector = null;

  for (const file of sourceFiles()) {
    const source = readText(file);
    const total = occurrences(source, /feTurbulence/g).length;
    if (total === 0) continue;
    if (!file.endsWith('.css')) {
      violations.push(
        toViolation('G9', relToApp(file), 'the paper grain must live in a stylesheet selector, not inline (17 S3.4)'),
      );
      continue;
    }
    for (const block of cssRuleBlocks(source)) {
      if (!block.body.includes('feTurbulence')) continue;
      grainSelectors += 1;
      grainWhere = relToApp(file);
      grainSelector = block.selector;
    }
  }

  if (grainSelectors !== 1) {
    violations.push(
      toViolation(
        'G9',
        grainWhere ?? 'src',
        `exactly one selector must apply the paper grain, found ${grainSelectors} (17 S3.4, G9)`,
      ),
    );
  } else if (!grainSelector.includes('[data-content-class="official"]')) {
    violations.push(
      toViolation('G9', grainWhere, `the grain selector "${grainSelector}" is not the T1 selector (17 S3.4)`),
    );
  }

  results.push({
    name: 'G9 grain containment',
    ok: violations.length === 0,
    detail: grainSelectors === 1 ? `one grain selector: ${grainSelector}` : 'grain selector count',
    violations,
  });
}

function runTokensSourceGates(results, app) {
  // HEX -- no hex literal outside tokens.css.
  const hexViolations = [];
  for (const file of sourceFiles()) {
    if (file === TOKENS_CSS) continue;
    const source = readText(file);
    for (const hit of occurrences(source, /#([0-9a-fA-F]{3,8})\b/g)) {
      const digits = hit.match[1];
      // A pseudonym like `Anonymous Student #482` is not a colour. A real hex literal is
      // either 6/8 digits or contains a letter, which is what this keeps.
      if (digits.length !== 6 && digits.length !== 8 && !/[a-fA-F]/.test(digits)) continue;
      hexViolations.push(
        toViolation(
          'HEX',
          `${relToApp(file)}:${lineAt(source, hit.index)}`,
          `hex literal ${hit.match[0]} outside tokens.css: add an L2 token instead (17 S6.1 rule 2)`,
        ),
      );
    }
  }
  results.push({
    name: 'HEX tokens.css is the only hex literal',
    ok: hexViolations.length === 0,
    detail: 'no hex literal in src outside tokens.css',
    violations: hexViolations,
  });

  // L1 -- no component reads a primitive.
  const l1Violations = [];
  for (const file of sourceFiles()) {
    if (file === TOKENS_CSS) continue;
    const source = readText(file);
    for (const hit of occurrences(source, /--p-[a-z0-9-]+/g)) {
      l1Violations.push(
        toViolation(
          'L1',
          `${relToApp(file)}:${lineAt(source, hit.index)}`,
          `${hit.match[0]} reads layer 1 directly: use an L2 token (17 S6.1 rule 1)`,
        ),
      );
    }
  }
  results.push({
    name: 'L1 no component reads a primitive',
    ok: l1Violations.length === 0,
    detail: 'no --p-* reference outside tokens.css',
    violations: l1Violations,
  });

  // DEF -- every referenced custom property exists.
  const declared = new Set(app.plainDeclarations.keys());
  const declaredText = readText(MOTION_CSS);
  for (const name of parseCssDeclarations(declaredText).keys()) declared.add(name);
  const declaredTypography = readText(TYPOGRAPHY_CSS);
  for (const name of parseCssDeclarations(declaredTypography).keys()) declared.add(name);

  const undefinedViolations = [];
  const referenced = [TAILWIND_CONFIG, GLOBALS_CSS, TOKENS_CSS, TYPOGRAPHY_CSS, TEXTURE_CSS, MOTION_CSS];
  for (const file of referenced) {
    const source = readText(file);
    for (const hit of occurrences(stripComments(source), /var\(\s*(--[a-z0-9-]+)\s*\)/g)) {
      if (declared.has(hit.match[1])) continue;
      undefinedViolations.push(
        toViolation(
          'DEF',
          `${relToApp(file)}:${lineAt(source, hit.index)}`,
          `${hit.match[1]} is referenced but never declared: the theme key resolves to nothing (I-44)`,
        ),
      );
    }
  }
  results.push({
    name: 'DEF every referenced token is declared',
    ok: undefinedViolations.length === 0,
    detail: `${declared.size} declared custom properties cover the config and the stylesheets`,
    violations: undefinedViolations,
  });
}

/**
 * Run every gate against the repository. Returns each gate's result and the flat violation
 * list, so a caller (the test) can assert on structure rather than on printed text.
 */
export function runGate() {
  const results = [];
  const app = { specTokens: new Map(), plainDeclarations: new Map() };
  const tokenState = runTokenParityGates(results, app);
  app.plainDeclarations = tokenState.plainDeclarations;
  runTailwindGates(results);
  runMotionGates(results);
  runTextureGate(results);
  runTokensSourceGates(results, app);
  const violations = results.flatMap((result) => result.violations);
  return { results, violations };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main() {
  let outcome;
  try {
    outcome = runGate();
  } catch (error) {
    process.stderr.write(`design gates: FAILED to run: ${error.message}\n`);
    process.exit(1);
  }

  process.stdout.write('design gates (17 S12; the style gate of 17 S7.6 rule 3)\n');
  for (const result of outcome.results) {
    const status = result.ok ? 'ok  ' : 'FAIL';
    process.stdout.write(`  ${status} ${result.name}: ${result.detail}\n`);
  }

  if (outcome.violations.length > 0) {
    process.stderr.write(`\ndesign gates: ${outcome.violations.length} violation(s)\n`);
    for (const violation of outcome.violations) {
      process.stderr.write(`  [${violation.rule}] ${violation.where}: ${violation.message}\n`);
    }
    process.exit(1);
  }

  process.stdout.write(`design gates: ok (${outcome.results.length} checks)\n`);
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (invokedDirectly) main();
