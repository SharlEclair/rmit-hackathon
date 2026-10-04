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
 * - `17` S6.1 rule 1  no component reads an L1 primitive
 * - `AGENTS.md` 5.3   kebab-case files, PascalCase exports, ASCII only
 *
 * The token-reference check at the end exists because `check-design.mjs`'s DEF gate reads only
 * `tailwind.config.ts` and `src/styles/*.css`, so a mistyped `var(--...)` inside a component is
 * not caught there.
 *
 * GATE INTERACTION, when editing anything in `src/components/ui/`: those checks scan a component
 * file VERBATIM, comments included. So a comment that restates a hex value (for example recording
 * trap T11 by writing the rejected colour) fails `pnpm lint`'s HEX gate, and a comment naming an
 * L1 `--p-*` primitive fails its L1 gate. Cite the trap or decision id instead of the value:
 * "trap T11 / D65" or "`07` S2.3" is enough, and this file's own tests below read comments
 * differently (they strip them) only because they are proving a declaration exists rather than
 * catching a stray literal.
 */
const UI_DIR = fileURLToPath(new URL('../../src/components/ui/', import.meta.url));
const UTILS_PATH = fileURLToPath(new URL('../../src/lib/utils.ts', import.meta.url));
const STYLES_DIR = fileURLToPath(new URL('../../src/styles/', import.meta.url));

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

/**
 * CSS has block comments only, and `texture.css` carries a data URI whose `http://` would be
 * eaten by a line-comment strip. Stripping blocks alone keeps the SVG line intact.
 */
function stripBlockComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ');
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

/**
 * A declaration scan tolerant of a quoted property key, which is how a same-file L3 component
 * token is written in a style object (`'--content-frame-rule': '4px'`) and how `tokens.css`
 * writes its own names.
 *
 * The CALLER strips comments first. Without that, a comment spelling `--token: value` would enter
 * the declaration set and make a `var(--token)` reference resolve with no real declaration, which
 * is exactly the hole the same-file L3 allowance opens.
 */
function declarationSet(source: string): Set<string> {
  return new Set(
    [...source.matchAll(/(--[a-z0-9-]+)['"]?\s*:/g)].map((match) => match[1] ?? ''),
  );
}

/**
 * `17` S6.1 rule 1: components read the meaning layer. This is the union of every custom
 * property declared in `src/styles/*.css` -- `tokens.css`, `typography.css`, `texture.css` and
 * `motion.css` -- because `17` S10.4 declares the motion tokens in `motion.css` and `17` S10.5
 * rule 1 requires a component to consume them rather than hard-code a duration.
 */
function declarationSetInStylesheets(): Set<string> {
  const declared = new Set<string>();
  for (const file of readdirSync(STYLES_DIR)) {
    if (file.endsWith('.css')) {
      const source = stripBlockComments(readFileSync(join(STYLES_DIR, file), 'utf8'));
      for (const name of declarationSet(source)) {
        declared.add(name);
      }
    }
  }
  return declared;
}

/** Every `var(--token)` reference, including the `var(--token, fallback)` form. */
function tokenReferences(source: string): string[] {
  return [...stripComments(source).matchAll(/var\(\s*(--[a-z0-9-]+)\s*[,)]/g)].map(
    (match) => match[1] ?? '',
  );
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

  /**
   * **This assertion was stricter than the specification it cites, and that is why it changed.**
   *
   * It used to ban `transition` and `opacity-` outright, on the reading that `17` S10.4 forbids
   * animation in the primitives. But the spec does not say that. `17` S10.3 rule 1 says the opposite:
   * "**Hover changes exactly one property**: the colour of a border, an underline, or a background,
   * **at the `fast` duration**" -- a hover transition is required, not banned -- and `17` S10.2 defines
   * a three-step entrance with opacity and transform. `09` S10 caps motion at 150ms and `motion.css`
   * already declares `--motion-fast/base/slow` with a reduced-motion reset to 0ms.
   *
   * So `transition: none` was the documented value and any easing was the undocumented one, which is
   * how a test comes to enforce a stricter rule than its own source. What is worth enforcing is the
   * **bound**, not the absence: motion must reference a declared token (so it cannot be hand-rolled and
   * cannot exceed 150ms without changing the token), and it must not be keyframe animation, whose
   * timing is not covered by a single duration token.
   *
   * `opacity-` is allowed again for the same reason, with one real restriction kept: it must not be
   * used to hide content that a reader needs. The spec's objection was to "opacity de-emphasis", not
   * to a disabled control or a hover state, and those are legitimate.
   */
  it('uses only tokenised motion, caps it at the declared ceiling, and animates no keyframes', () => {
    for (const name of UI_FILES) {
      const source = stripComments(sourceOf(name));
      expect(source).not.toContain('@keyframes');
      expect(source).not.toContain('animate-');
      for (const match of source.matchAll(/transition(?:-[a-z]+)?\s*:\s*([^"'`;]+)/g)) {
        const value = (match[1] ?? '').trim();
        // `none` is always fine: not animating is a choice the spec allows.
        if (value === 'none') continue;
        expect(
          /var\(--motion-(fast|base|slow)\)/.test(value),
          `${name} transitions with a literal duration: ${value}`,
        ).toBe(true);
      }
    }
  });

  it('never hides required content behind an opacity utility', () => {
    for (const name of UI_FILES) {
      const source = stripComments(sourceOf(name));
      // The spec objects to "opacity de-emphasis" -- fading a thing a reader needs. A disabled state
      // or a hover treatment is not that, so only the full-hide utilities are refused.
      expect(source).not.toContain('opacity-0');
      expect(source).not.toContain('opacity-40');
      expect(source).not.toContain('opacity-50');
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

  it('references only custom properties the design system declares, and never an L1 primitive', () => {
    const declared = declarationSetInStylesheets();
    // A silently empty declaration set would make the loop below vacuous.
    expect(declared.size).toBeGreaterThan(40);

    const referenced = new Set<string>();
    for (const name of UI_FILES) {
      for (const token of tokenReferences(sourceOf(name))) {
        referenced.add(token);
      }
    }
    // The primitives do read L2 directly in one place (AuthorityQuote's document-edge hairline),
    // so an empty reference set would mean this check stopped checking anything.
    expect(referenced.size).toBeGreaterThan(0);

    for (const name of referenced) {
      expect(name.startsWith('--p-'), `${name} is an L1 primitive and no component may read it`).toBe(
        false,
      );

      // A reference resolves if the design-system stylesheets declare it, or if the referencing
      // component declares it beside itself: `17` S6.1 rule 3 makes an L3 component token local
      // and non-exported, so requiring it in `src/styles/` would reject a legitimate token.
      // Comments are stripped first, so a doc comment naming `--token:` cannot stand in for a
      // declaration.
      const declaredInAComponent = UI_FILES.some((file) =>
        declarationSet(stripComments(sourceOf(file))).has(name),
      );
      expect(
        declared.has(name) || declaredInAComponent,
        `${name} is referenced but declared in no stylesheet and in no component`,
      ).toBe(true);
    }
  });

  /**
   * Negative controls. The resolution rule above is only worth anything if it rejects an
   * undeclared name and accepts one declared outside `tokens.css`, so both directions are pinned
   * on synthetic sources rather than trusted.
   */
  it('rejects an undeclared token, accepts a motion token, and matches a fallback form', () => {
    expect(tokenReferences('transition-duration: var(--motion-slow);')).toEqual(['--motion-slow']);
    expect(tokenReferences('transition-duration: var(--motion-slow, 0ms);')).toEqual([
      '--motion-slow',
    ]);
    expect(tokenReferences('color: var(--not-a-real-token);')).toEqual(['--not-a-real-token']);

    const declared = declarationSetInStylesheets();
    // `17` S10.4 declares the motion tokens in motion.css, not tokens.css: a transition written
    // against `--motion-slow` is the correct implementation of S10.5 rule 1 and must resolve.
    expect(declared.has('--motion-slow')).toBe(true);
    expect(declared.has('--motion-fast')).toBe(true);
    expect(declared.has('--ease-out')).toBe(true);
    expect(declared.has('--not-a-real-token')).toBe(false);

    // A same-file L3 component token (`17` S6.1 rule 3) is accepted by the declaration scan.
    expect(declarationSet("const css = { '--content-frame-rule': '4px' };").has('--content-frame-rule')).toBe(
      true,
    );
  });

  /**
   * The hole WS-A found in the same-file allowance, pinned so it cannot come back. `declarationSet`
   * and `tokenReferences` are plain scanners whose caller must supply comment-free source; these
   * assertions show why that matters and that the resolution path does supply it.
   */
  it('does not read a token out of a comment', () => {
    const commentedDeclaration = "// --content-frame-rule: 4px\nconst css = {};";
    // The scanner itself does see it, which is exactly why the caller strips comments.
    expect(declarationSet(commentedDeclaration).has('--content-frame-rule')).toBe(true);
    // The path the resolution check actually uses does not.
    expect(declarationSet(stripComments(commentedDeclaration)).has('--content-frame-rule')).toBe(
      false,
    );
    expect(declarationSet(stripComments('/* --content-frame-rule: 4px */')).size).toBe(0);

    // A CSS block comment naming a token is not a declaration either, and a real declaration with
    // a trailing comment still registers.
    const stylesheetLike =
      '/* --not-a-real-token: 1px */\n--surface-document-edge: var(--p-paper-200); /* warm hairline */';
    const declared = declarationSet(stripBlockComments(stylesheetLike));
    expect(declared.has('--not-a-real-token')).toBe(false);
    expect(declared.has('--surface-document-edge')).toBe(true);

    // A `var()` that appears only in a comment is not a reference.
    expect(tokenReferences('// see var(--not-a-real-token) for the guard')).toEqual([]);
  });
});
