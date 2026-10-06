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
      border: 'var(--color-border)',
      primary: 'var(--color-primary)',
      danger: 'var(--color-danger)',
      bg: 'var(--color-bg)',
      surface: 'var(--color-surface)',
      text: 'var(--color-text)',
      'text-muted': 'var(--color-text-muted)',
      error: 'var(--state-error)',
      warning: 'var(--state-warning)',
      success: 'var(--state-success)',
      info: 'var(--state-info)',
    },
    fontFamily: {
      sans: 'var(--font-sans)',
      editorial: 'var(--font-editorial)',
      ui: 'var(--font-ui)',
      mono: 'var(--font-mono)',
    },
    borderRadius: {
      sheet: '2px',
      control: '4px',
      card: '6px',
      md: '6px',
      lg: '8px',
      xl: '12px',
      '2xl': '16px',
      full: '9999px',
    },
    boxShadow: {
      card: 'var(--shadow-card)',
      overlay: 'var(--shadow-overlay)',
      lift: 'var(--shadow-overlay)',
      sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      DEFAULT: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
      md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
      lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
    },
    spacing: { 0: '0', 1: '4px', 2: '8px', 3: '12px', 4: '16px', 6: '24px', 8: '32px', 12: '48px' },
    transitionDuration: {
      fast: 'var(--motion-fast)',
      base: 'var(--motion-base)',
      slow: 'var(--motion-slow)',
      150: '150ms',
      200: '200ms',
      300: '300ms',
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
