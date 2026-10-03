/*
 * Font families -- `17` S2.2/S2.3, in the degradation path recorded as **D106** in
 * `docs/17-DESIGN-SYSTEM.md` section 15, and as the font decision of `05-ISSUES.md` **I-44**
 * step 3.
 *
 * WHAT `17` S2.3 WANTS, AND WHY IT IS NOT HERE. `17` S2.3 declares three `next/font/local`
 * families loaded from seven committed woff2 files under `app/src/styles/fonts/`
 * (Newsreader, IBM Plex Sans, IBM Plex Mono; <= 190 KB total, OFL.txt beside each). Those
 * binaries are **not in this repository**, and inventing a path to a file that does not
 * exist fails the build at a place that reads like a stylesheet bug. A `next/font/google`
 * declaration is not an acceptable substitute: it fetches at build time, so a clean
 * checkout or a CI build becomes network-dependent, which `11` WP-01 and `12` section 8
 * both forbid. `G5` fails a live reference to either Google Fonts CSS host (both names are
 * in `17` S2.3 rule 6 and `17` S7.6 rule 3, which is where to look them up); this module
 * names neither, and it fetches nothing.
 *
 * THE DEGRADATION PATH. The three stacks below are the fallbacks `17` S2.2 rule 2 already
 * lists for these families, promoted to the primary position. They are also the L2 values
 * of `--font-editorial`, `--font-ui` and `--font-mono` in `app/src/styles/tokens.css`;
 * `scripts/check-design.mjs` asserts the two copies of each stack are identical, so the
 * CSS and this module cannot drift.
 *
 * ADDING THE REAL FAMILIES LATER is one line per family: declare it with
 * `localFont({ src: "./fonts/<family>-400.woff2", variable: LOCAL_FONT_VARIABLES.<role>,
 * ... })`, expose the variable on `<html>` in `app/src/app/layout.tsx`, and prepend
 * `var(--font-<family>), ` to that family's stack in both this file and `tokens.css`.
 *
 * WHAT IS BANNED IN EVERY STACK, including as a fallback: Inter, Roboto, Arial and
 * `system-ui` (`17` S2.2 rule 1, anti-pattern 12). None appears below, and the gate scans
 * every declared stack for them. Note that `17` S2.3's `adjustFontFallback: "Arial"` is a
 * `next/font` metric-override target inside a generated `@font-face` descriptor and is not
 * a stack; it does not appear here either.
 *
 * This module fetches nothing and imports nothing. It is a declaration of intent plus the
 * one source of truth for the fallback stacks.
 */

/** The three font roles of `17` S2.1. */
export const FONT_STACKS = {
  editorial: 'Georgia, "Times New Roman", serif',
  ui: '"DejaVu Sans", Verdana, sans-serif',
  mono: '"DejaVu Sans Mono", Consolas, monospace',
} as const;

export type FontFamilyRole = keyof typeof FONT_STACKS;

/**
 * The `next/font/local` CSS variable `17` S2.3 assigns to each role. They are absent
 * today because the woff2 binaries are absent: nothing declares them, so a stack that
 * referenced one would resolve to an invalid value and fall through to the next family.
 * They are listed here as the one-line change described in this file's header.
 */
export const LOCAL_FONT_VARIABLES = {
  editorial: '--font-newsreader',
  ui: '--font-plex-sans',
  mono: '--font-plex-mono',
} as const satisfies Record<FontFamilyRole, string>;
