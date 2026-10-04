// Tailwind v4 is CSS-first. This file exists because `17-DESIGN-SYSTEM.md` S6.2/S6.3
// names it as the theme surface (and `components.json` points at it), so the paths in
// that spec hold; it is loaded from `src/styles/globals.css` through Tailwind v4's
// `@config` compatibility directive, which keeps v3 semantics: a key under `theme`
// REPLACES the default namespace, and only `theme.extend` would merge.
//
// Decision: D75 (docs/01-DECISIONS.md section J). Constraint the value ordering
// enforces: a utility that would produce a default-Tailwind look must not be
// reachable by accident, so there is no default-theme spread anywhere in this file.
//
// The values below are CSS custom properties, not literals. The hex literals live in
// `src/styles/tokens.css` and nowhere else (`17` S6.1 rule 2).
/** @type {import('tailwindcss').Config} */
const config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      page: 'var(--surface-page)',
      card: 'var(--surface-card)',
      official: 'var(--surface-official)',
      approved: 'var(--surface-approved)',
      interpretation: 'var(--surface-interpretation)',
      peer: 'var(--surface-peer)',
      'document-mat': 'var(--surface-document-mat)',
      ink: 'var(--text-primary)',
      muted: 'var(--text-secondary)',
      inverse: 'var(--text-inverse)',
      default: 'var(--border-default)',
      'border-official': 'var(--border-official)',
      'border-approved': 'var(--border-approved)',
      'border-interpretation': 'var(--border-interpretation)',
      'border-peer': 'var(--border-peer)',
      error: 'var(--state-error)',
      warning: 'var(--state-warning)',
      success: 'var(--state-success)',
      info: 'var(--state-info)',
    },
    fontFamily: {
      editorial: 'var(--font-editorial)',
      ui: 'var(--font-ui)',
      mono: 'var(--font-mono)',
    },
    borderRadius: { sheet: '2px', control: '4px', card: '6px', full: '9999px' },
    boxShadow: {
      card: 'var(--shadow-card)',
      overlay: 'var(--shadow-overlay)',
      // **A lift for interactive surfaces, composed from the two existing tokens rather than a new
      // literal.** `--shadow-card` is the resting shadow (`0 1px 2px` at 6% ink) and `--shadow-overlay`
      // is the raised one (`0 8px 24px` at 12%), and both already exist in `tokens.css` from `07`
      // section 2.3 -- so a hover lift needs no new value and no new hex, which keeps `17` section 6.1
      // rule 2 intact: hex lives in `tokens.css` and nowhere else.
      //
      // This is D111: `17` section 1.3 principle 4 reserved elevation for overlays, and now allows it on
      // a surface the reader can act on, because a card that cannot be told apart from the page cannot
      // be told to be clickable either. Content-class frames stay flat -- that exception is asserted by
      // the design-law test.
      lift: 'var(--shadow-overlay)',
    },
    spacing: { 0: '0', 1: '4px', 2: '8px', 3: '12px', 4: '16px', 6: '24px', 8: '32px', 12: '48px' },
    // **Motion utilities that name a token rather than a literal.** `17` section 10.4 caps motion at
    // 150ms and `motion.css` resets those tokens to `0ms` under `prefers-reduced-motion`, so a component
    // that eases through one of these inherits both the ceiling and the reset. A hand-rolled
    // `transition-colors duration-200` would satisfy neither -- which is exactly why the design-law test
    // refuses a literal duration, and why the tokenised form is made the convenient one here.
    transitionDuration: {
      fast: 'var(--motion-fast)',
      base: 'var(--motion-base)',
      slow: 'var(--motion-slow)',
    },
    transitionTimingFunction: {
      out: 'var(--ease-out)',
      'in-out': 'var(--ease-in-out)',
    },
    screens: { sm: '640px', md: '768px', lg: '1024px', xl: '1280px' },
  },
  plugins: [],
};

export default config;
