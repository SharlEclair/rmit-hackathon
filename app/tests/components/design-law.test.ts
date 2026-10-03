import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Structural checks over the primitive sources, with no rendering involved. Each one encodes a
 * rule that a reviewer would otherwise have to check by eye on every future change:
 *
 * - `17` S6.1 rule 2  no hex literal outside `tokens.css`
 * - `17` S6.1 rule 4  no dark-mode block
 * - `17` S2.4 rule 7  no truncation or ellipsis anywhere
 * - `17` S12 G10      `font-editorial` only inside `AuthorityQuote`
 * - `17` S7.6 rule 1  only `ContentClassPanel` sets `data-content-class`
 * - `17` S3.5 rule 1  a content-class frame is flat
 * - `17` S10.4        no animation or transition in the primitives
 * - `17` S11.5        no opacity de-emphasis
 * - `AGENTS.md` 5.3   kebab-case files, PascalCase exports, ASCII only
 */
const UI_DIR = fileURLToPath(new URL('../../src/components/ui/', import.meta.url));
const UTILS_PATH = fileURLToPath(new URL('../../src/lib/utils.ts', import.meta.url));

const UI_FILES = readdirSync(UI_DIR).filter((name) => name.endsWith('.ts') || name.endsWith('.tsx'));

/** The colour keys of `app/tailwind.config.ts` -- the only colour utilities that exist. */
const COLOUR_KEYS = [
  'transparent',
  'current',
  'page',
  'card',
  'official',
  'approved',
  'interpretation',
  'peer',
  'document-mat',
  'ink',
  'muted',
  'inverse',
  'default',
  'border-official',
  'border-approved',
  'border-interpretation',
  'border-peer',
  'error',
  'warning',
  'success',
  'info',
];

const ALLOWED_COLOUR_CLASSES = new Set(
  ['bg', 'text', 'border'].flatMap((prefix) => COLOUR_KEYS.map((key) => `${prefix}-${key}`)),
);

/** Non-colour utilities with a `border-` or `text-` prefix, which the allowlist must tolerate. */
const NON_COLOUR_CLASSES = new Set([
  'border-l',
  'border-l-4',
  'border-solid',
  'border-dashed',
  'border-dotted',
]);

function sourceOf(name: string): string {
  return readFileSync(join(UI_DIR, name), 'utf8');
}

/** Removes block and line comments so a doc reference cannot be read as a class string. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

function classTokens(source: string): string[] {
  const withoutComments = stripComments(source);
  const literals = [
    ...withoutComments.matchAll(/'([^']*)'/g),
    ...withoutComments.matchAll(/"([^"]*)"/g),
    ...withoutComments.matchAll(/`([^`]*)`/g),
  ].map((match) => match[1] ?? '');

  return literals
    .filter((literal) => literal.includes(' '))
    .flatMap((literal) => literal.split(/\s+/))
    .map((token) => (token.includes(':') ? token.slice(token.lastIndexOf(':') + 1) : token))
    .filter((token) => token !== '');
}

describe('design law over the primitive sources', () => {
  it('finds the primitive files it expects', () => {
    expect(UI_FILES.length).toBeGreaterThanOrEqual(10);
    expect(UI_FILES).toContain('badge.tsx');
    expect(UI_FILES).toContain('content-class-panel.tsx');
    expect(UI_FILES).toContain('state-panel.tsx');
    expect(UI_FILES).toContain('authority-quote.tsx');
    expect(UI_FILES).toContain('source-link.tsx');
    expect(UI_FILES).toContain('progress-mark.tsx');
    expect(UI_FILES).toContain('checklist-item-row.tsx');
    expect(UI_FILES).toContain('theme-scope.tsx');
    expect(UI_FILES).toContain('empty-state.tsx');
  });

  it('names files kebab-case and exports PascalCase (AGENTS.md 5.3)', () => {
    for (const name of UI_FILES) {
      expect(name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*\.tsx?$/);

      const exported = [...sourceOf(name).matchAll(/export (?:function|const) ([A-Za-z0-9_]+)/g)].map(
        (match) => match[1] ?? '',
      );
      for (const symbol of exported) {
        if (name.endsWith('.tsx')) {
          // Component files export components; `.ts` modules export constants and helpers.
          expect(symbol).toMatch(/^[A-Z]/);
        } else {
          expect(symbol).toMatch(/^[A-Za-z]/);
        }
      }
    }
  });

  it('writes ASCII only in code and comments (AGENTS.md 5.3, `17` S13 item 18)', () => {
    for (const path of [...UI_FILES.map((name) => join(UI_DIR, name)), UTILS_PATH]) {
      const bytes = [...readFileSync(path)];
      expect(bytes.some((byte) => byte > 0x7f)).toBe(false);
    }
  });

  it('contains no hex literal (`17` S6.1 rule 2)', () => {
    for (const name of UI_FILES) {
      expect(sourceOf(name)).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
    expect(readFileSync(UTILS_PATH, 'utf8')).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('uses only colour utilities that exist in tailwind.config.ts', () => {
    for (const name of UI_FILES) {
      for (const token of classTokens(sourceOf(name))) {
        if (!/^(bg|text|border)-/.test(token)) {
          continue;
        }
        if (NON_COLOUR_CLASSES.has(token)) {
          continue;
        }
        expect(ALLOWED_COLOUR_CLASSES.has(token), `${name} uses ${token}`).toBe(true);
      }
    }
  });

  it('never truncates or ellipsises (`17` S2.4 rule 7)', () => {
    for (const name of UI_FILES) {
      const source = stripComments(sourceOf(name));
      expect(source).not.toContain('truncate');
      expect(source).not.toContain('text-ellipsis');
      expect(source).not.toContain('line-clamp');
      expect(source).not.toContain('text-overflow');
      expect(source).not.toContain('whitespace-nowrap');
    }
  });

  it('uses font-editorial only inside AuthorityQuote (`17` S12 G10)', () => {
    const files = UI_FILES.filter((name) => sourceOf(name).includes('font-editorial'));
    expect(files).toEqual(['authority-quote.tsx']);
  });

  it('sets data-content-class in exactly one component (`17` S7.6 rule 1)', () => {
    const files = UI_FILES.filter((name) => sourceOf(name).includes('data-content-class={'));
    expect(files).toEqual(['content-class-panel.tsx']);
  });

  it('keeps content-class frames flat (`17` S3.5 rule 1)', () => {
    expect(stripComments(sourceOf('content-class-panel.tsx'))).not.toContain('shadow');
  });

  it('carries no animation, transition or opacity de-emphasis', () => {
    for (const name of UI_FILES) {
      const source = stripComments(sourceOf(name));
      expect(source).not.toContain('@keyframes');
      expect(source).not.toContain('animate-');
      expect(source).not.toContain('transition');
      expect(source).not.toContain('opacity-');
    }
  });

  it('declares no dark-mode block (`17` S6.1 rule 4)', () => {
    for (const name of UI_FILES) {
      expect(sourceOf(name)).not.toContain('prefers-color-scheme');
    }
  });

  it('never removes a focus outline (`17` S11.1)', () => {
    for (const name of UI_FILES) {
      const source = stripComments(sourceOf(name));
      expect(source).not.toContain('outline-none');
      expect(source).not.toContain('outline: none');
      expect(source).not.toContain('outline:none');
    }
  });

  it('keeps the five content classes in one vocabulary', () => {
    const source = sourceOf('badge.tsx');
    for (const contentClass of ['official', 'approved', 'structure', 'peer', 'interpretation']) {
      expect(source).toContain(`'${contentClass}'`);
    }
  });
});
