import { createElement } from 'react';
import { describe, expect, it } from 'vitest';

import { ChecklistItemRow } from '@/components/ui/checklist-item-row';
import { STATE_COPY, reopenedCountLabel } from '@/components/ui/fixed-strings';

import { render } from './harness';

const noop = (): void => undefined;

describe('ChecklistItemRow', () => {
  it('offers Start on a not-started item and no elapsed time', () => {
    const html = render(
      createElement(ChecklistItemRow, {
        title: 'Verify the design against the requirements',
        state: 'not-started',
        onStart: noop,
      }),
    );
    expect(html).toContain('Start');
    expect(html).toContain('Not started');
    expect(html).not.toContain(STATE_COPY.elapsedTime);
    expect(html).not.toContain('Reopened');
  });

  it('offers Complete on an in-progress item and no elapsed time yet', () => {
    const html = render(
      createElement(ChecklistItemRow, {
        title: 'Review the rubric weightings',
        state: 'in-progress',
        onComplete: noop,
      }),
    );
    expect(html).toContain('Complete');
    expect(html).toContain('In progress');
    expect(html).not.toContain(STATE_COPY.elapsedTime);
  });

  it('offers Reopen on a completed item and labels the interval `Elapsed time`', () => {
    const html = render(
      createElement(ChecklistItemRow, {
        title: 'Plan the module boundaries',
        state: 'complete',
        elapsed: '24m',
        onReopen: noop,
      }),
    );
    expect(html).toContain('Reopen');
    expect(html).toContain('Complete');
    expect(html).toContain(`${STATE_COPY.elapsedTime} 24m`);
    expect(html).toContain(STATE_COPY.elapsedTimeTooltip);
    expect(html).not.toContain('Reopened');
  });

  it('never uses the forbidden elapsed-time labels (D33)', () => {
    const html = render(
      createElement(ChecklistItemRow, {
        title: 'Plan the module boundaries',
        state: 'complete',
        elapsed: '24m',
      }),
    );
    expect(html).not.toContain('Time worked');
    expect(html).not.toContain('Time on task');
    expect(html).not.toContain('Time spent');
  });

  it('shows the FIRST interval plus the reopen count on a reopened item (D48)', () => {
    const html = render(
      createElement(ChecklistItemRow, {
        title: 'Plan the module boundaries',
        state: 'reopened',
        elapsed: '12m',
        reopenedCount: 2,
        onComplete: noop,
      }),
    );
    expect(html).toContain(`${STATE_COPY.elapsedTime} 12m`);
    expect(html).toContain(reopenedCountLabel(2));
    expect(html).toContain('Reopened 2 times');
    expect(html).toContain('Complete');
    // One interval only: the row cannot accumulate across reopen cycles.
    expect([...html.matchAll(/12m/g)]).toHaveLength(1);
    expect(html).not.toContain('24m');
  });

  it('writes the singular reopen note for one reopen', () => {
    expect(reopenedCountLabel(1)).toBe('Reopened 1 time');
    const html = render(
      createElement(ChecklistItemRow, {
        title: 'Review the rubric weightings',
        state: 'reopened',
        elapsed: '8m',
        reopenedCount: 1,
        onComplete: noop,
      }),
    );
    expect(html).toContain('Reopened 1 time');
  });

  it('renders the planning level word where it is provided', () => {
    const html = render(
      createElement(ChecklistItemRow, {
        title: 'the submission format',
        state: 'not-started',
        planningLevel: 'Understand',
        onStart: noop,
      }),
    );
    expect(html).toContain('Understand');
  });

  it('renders the related FAQ link as the only per-item affordance', () => {
    const html = render(
      createElement(ChecklistItemRow, {
        title: 'the required deliverables',
        state: 'complete',
        elapsed: '8m',
        relatedFaqHref: '/student/assignments/a1#faq',
        onReopen: noop,
      }),
    );
    expect(html).toContain('href="/student/assignments/a1#faq"');
    expect(html).toContain('Related FAQ entries');
    // No "how to" affordance and no Assistant hand-off (`07` S4.6 rules 6 and 7).
    expect(html).not.toContain('How to');
    expect(html).not.toContain('Ask the Assistant');
  });

  it('disables the control when the owning page has not supplied a callback', () => {
    const html = render(
      createElement(ChecklistItemRow, { title: 'the submission format', state: 'not-started' }),
    );
    expect(html).toContain('disabled=""');
  });

  it('is a list row and holds no data-fetching seam', () => {
    const html = render(
      createElement(ChecklistItemRow, {
        title: 'the submission format',
        state: 'in-progress',
        onComplete: noop,
      }),
    );
    expect(html.startsWith('<li')).toBe(true);
    expect(html).not.toContain('fetch');
    expect(html).not.toContain('<form');
  });
});
