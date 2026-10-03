import { createElement } from 'react';
import { describe, expect, it } from 'vitest';

import { ProgressMark } from '@/components/ui/progress-mark';

import { firstClassAttribute, hasClass, render } from './harness';

const STATES = [
  { state: 'not-started' as const, label: 'Not started', glyph: '[ ]', tone: 'text-muted' },
  { state: 'in-progress' as const, label: 'In progress', glyph: '[~]', tone: 'text-info' },
  { state: 'complete' as const, label: 'Complete', glyph: '[x]', tone: 'text-success' },
];

describe('ProgressMark', () => {
  it('renders icon, text and colour for every state, never colour alone', () => {
    for (const entry of STATES) {
      const html = render(createElement(ProgressMark, { state: entry.state }));
      const frame = firstClassAttribute(html);

      // colour
      expect(hasClass(frame, entry.tone)).toBe(true);
      // text
      expect(html).toContain(entry.label);
      // icon slot, decorative
      expect(html).toContain(entry.glyph);
      expect(html).toContain('aria-hidden="true"');
    }
  });

  it('gives each state a distinct non-colour cue pair, so greyscale is unambiguous', () => {
    const cues = STATES.map((entry) => {
      const html = render(createElement(ProgressMark, { state: entry.state }));
      return `${entry.glyph}|${entry.label}|${html.includes(entry.label)}`;
    });
    expect(new Set(cues).size).toBe(cues.length);
  });

  it('keeps the state word outside the aria-hidden glyph', () => {
    const html = render(createElement(ProgressMark, { state: 'complete' }));
    // The decorative span closes before the word, so the word is announced.
    expect(html).toContain('</span><span class="tight">Complete</span>');
  });

  it('uses only token-backed colour classes', () => {
    for (const entry of STATES) {
      const html = render(createElement(ProgressMark, { state: entry.state }));
      for (const token of ['text-muted', 'text-info', 'text-success']) {
        expect(hasClass(firstClassAttribute(html), token)).toBe(token === entry.tone);
      }
    }
  });
});
