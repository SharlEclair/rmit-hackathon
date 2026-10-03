import { createElement } from 'react';
import { describe, expect, it } from 'vitest';

import { StatePanel } from '@/components/ui/state-panel';
import { BADGE, STATE_COPY } from '@/components/ui/fixed-strings';

import { decodeEntities, firstClassAttribute, render } from './harness';

const ESCALATION = createElement('button', { type: 'button' }, STATE_COPY.refusalEscalation);

describe('StatePanel: loading', () => {
  const loading = render(
    createElement(StatePanel, { kind: 'loading', noun: 'Checklist', skeletonShape: 'text' }),
  );

  it('announces politely through a status region and carries the loading copy', () => {
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-live="polite"');
    expect(loading).toContain('Loading Checklist...');
  });

  it('renders a skeleton that assistive technology ignores', () => {
    expect(loading).toContain('data-skeleton="true"');
    expect(loading).toContain('aria-hidden="true"');
  });

  it('is not an alert', () => {
    expect(loading).not.toContain('role="alert"');
  });

  it('adds the 8-second line only when asked', () => {
    expect(loading).not.toContain(STATE_COPY.stillWorking);
    const slow = render(createElement(StatePanel, { kind: 'loading', noun: 'page', stillWorking: true }));
    expect(slow).toContain(STATE_COPY.stillWorking);
    expect(slow).toContain(STATE_COPY.stillWorkingNote);
  });
});

describe('StatePanel: empty', () => {
  it('delegates to the one empty-state implementation and is not a live region', () => {
    const html = render(
      createElement(StatePanel, {
        kind: 'empty',
        message: 'Your Checklist will appear here once your tutor publishes it.',
        action: createElement('button', { type: 'button' }, 'Refresh'),
      }),
    );
    expect(html).toContain('Your Checklist will appear here once your tutor publishes it.');
    expect(html).toContain('Refresh');
    expect(html).toContain('rounded-card');
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain('role="status"');
  });
});

describe('StatePanel: error', () => {
  const error = render(
    createElement(StatePanel, {
      kind: 'error',
      message: 'We could not load your Checklist. Nothing was changed.',
      requestId: 'req_abc123',
      action: createElement('button', { type: 'button' }, 'Try again'),
    }),
  );

  it('is an assertive atomic alert that includes the request id', () => {
    expect(error).toContain('role="alert"');
    expect(error).toContain('aria-live="assertive"');
    expect(error).toContain('aria-atomic="true"');
    expect(error).toContain('We could not load your Checklist. Nothing was changed.');
    expect(error).toContain('req_abc123');
    expect(error).toContain('Try again');
  });

  it('uses the error treatment', () => {
    expect(error).toContain('border-error');
    expect(error).toContain('text-error');
  });
});

describe('StatePanel: insufficient data', () => {
  const html = render(createElement(StatePanel, { kind: 'insufficient-data' }));

  it('renders the fixed string and never a number, a count or an estimate', () => {
    expect(html).toContain(STATE_COPY.insufficientData);
    expect(html).toContain('fewer than 5 students');
    expect(html).not.toContain('>0<');
    expect(html).not.toContain('0%');
    expect(html).not.toContain('Contributors');
  });

  it('is static content, not an event', () => {
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain('role="status"');
    expect(html).not.toContain('aria-live');
  });
});

describe('StatePanel: refused', () => {
  const refused = render(
    createElement(StatePanel, {
      kind: 'refused',
      opener: STATE_COPY.refusalOpener('review or change your implementation'),
      policyQuote: { text: 'The assistant must not debug, evaluate, or modify student implementations.' },
      canHelpWith: [
        'Understanding the requirement you are working on',
        'Interpreting the rubric',
        'Planning your own next steps at a high level',
      ],
      action: ESCALATION,
    }),
  );

  it('announces the opener assertively', () => {
    expect(refused).toContain('role="alert"');
    expect(refused).toContain('aria-live="assertive"');
    expect(decodeEntities(refused)).toContain(
      "I cannot review or change your implementation under this assignment's AI usage policy.",
    );
  });

  it('uses the boundary treatment and never the error treatment (I4, trap T13)', () => {
    expect(refused).not.toContain('text-error');
    expect(refused).not.toContain('border-error');
    expect(refused).not.toContain('bg-error');
    expect(refused.toLowerCase()).not.toContain('something went wrong');
    expect(refused).toContain('border-dashed');
    expect(refused).toContain('border-border-interpretation');
    expect(refused).toContain('border-l-4');
  });

  it('is not a content-class frame: it carries no data-content-class', () => {
    expect(refused).not.toContain('data-content-class');
  });

  it('quotes the published rule and offers the escalation route', () => {
    expect(refused).toContain('The assistant must not debug, evaluate, or modify student implementations.');
    expect(refused).toContain(BADGE.publishedByTutor);
    expect(refused).toContain(STATE_COPY.refusalCanHelpWithLabel);
    expect(refused).toContain('Interpreting the rubric');
    expect(refused).toContain(STATE_COPY.refusalEscalation);
    expect(refused).toContain('data-refusal-variant="refusal"');
  });

  it('marks the POL_ABSENT variant as unavailable and invents no default policy', () => {
    const unavailable = render(
      createElement(StatePanel, {
        kind: 'refused',
        opener: STATE_COPY.refusalUnavailable,
        unavailable: true,
        action: ESCALATION,
      }),
    );
    expect(unavailable).toContain('data-refusal-variant="unavailable"');
    expect(unavailable).toContain(STATE_COPY.refusalUnavailable);
    expect(unavailable).not.toContain(STATE_COPY.refusalPolicyLabel);
    expect(unavailable).not.toContain('text-error');
  });
});

describe('StatePanel panel geometry', () => {
  it('keeps every non-refusal panel on the card radius and the neutral or error border', () => {
    const loading = render(createElement(StatePanel, { kind: 'loading', noun: 'page' }));
    expect(firstClassAttribute(loading)).toContain('rounded-card');
    expect(firstClassAttribute(loading)).toContain('border-default');
    expect(firstClassAttribute(loading)).not.toContain('shadow-');

    const insufficient = render(createElement(StatePanel, { kind: 'insufficient-data' }));
    expect(firstClassAttribute(insufficient)).toContain('rounded-card');
    expect(firstClassAttribute(insufficient)).toContain('border-default');
  });
});
