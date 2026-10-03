import { createElement } from 'react';
import { describe, expect, it } from 'vitest';

import { EmptyState } from '@/components/ui/empty-state';
import { EMPTY_STATE } from '@/components/ui/fixed-strings';

import { firstClassAttribute, render } from './harness';

describe('EmptyState', () => {
  const html = render(
    createElement(EmptyState, {
      message: EMPTY_STATE.checklist,
      action: createElement('button', { type: 'button' }, 'Refresh'),
    }),
  );

  it('is a bordered panel with one sentence and one action', () => {
    const frame = firstClassAttribute(html);
    expect(frame).toContain('rounded-card');
    expect(frame).toContain('border');
    expect(frame).toContain('border-default');
    expect(html).toContain(EMPTY_STATE.checklist);
    expect(html).toContain('Refresh');
  });

  it('carries no illustration, mascot, emoji or icon', () => {
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('<figure');
    expect(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(html)).toBe(false);
  });

  it('never says "No data"', () => {
    expect(html).not.toContain('No data');
  });

  it('renders without an action when the state genuinely has no control', () => {
    const bare = render(createElement(EmptyState, { message: EMPTY_STATE.discussions }));
    expect(bare).toContain(EMPTY_STATE.discussions);
    expect(bare).not.toContain('<button');
  });

  it('is flat: elevation means "not part of the page" (`17` S3.5 rule 2)', () => {
    expect(firstClassAttribute(html)).not.toContain('shadow-');
  });
});
