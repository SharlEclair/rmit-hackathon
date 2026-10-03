import { createElement } from 'react';
import { describe, expect, it } from 'vitest';

import { Badge } from '@/components/ui/badge';
import {
  BADGE,
  EMPTY_STATE,
  MARKER,
  STATE_COPY,
  anonymousDisplay,
  blockedUpload,
} from '@/components/ui/fixed-strings';

import { decodeEntities, firstClassAttribute, hasClass, render } from './harness';

/**
 * The `07` S2.5 table, retyped here from the doc rather than imported, so this test fails if the
 * module and the specification ever diverge. These literals are the contract.
 */
const S2_5 = {
  interpretationPreApproval: 'AI generated - requires tutor approval',
  interpretationStudentFacing: 'AI-generated interpretation - not the official requirement',
  mapDisclaimer: 'Refer to the original brief for exact requirements.',
  officialBriefHeader: 'Original assignment brief',
  officialRubricHeader: 'Official rubric',
  publishedByTutor: 'Published by your tutor',
  approvedStructure: 'Approved by your tutor - structure, not requirements',
  peerContent: 'Peer discussion - not official guidance',
  refusalEscalation: 'Ask your tutor privately',
  elapsedTime: 'Elapsed time',
  insufficientData: 'Insufficient data - fewer than 5 students have worked on this Milestone.',
  emptyChecklist: 'Your Checklist will appear here once your tutor publishes it.',
  emptyQueries: 'Your private questions to your tutor will appear here.',
  emptyDiscussions: 'No discussion threads yet. Ask the first question.',
  assistantUnavailable:
    'The Assistant is unavailable for this assignment because no AI usage policy has been approved yet. Ask your tutor privately.',
} as const;

describe('fixed strings of `07` S2.5', () => {
  it('matches the specification verbatim', () => {
    expect(BADGE.interpretationPreApproval).toBe(S2_5.interpretationPreApproval);
    expect(BADGE.interpretationStudentFacing).toBe(S2_5.interpretationStudentFacing);
    expect(BADGE.officialBrief).toBe(S2_5.officialBriefHeader);
    expect(BADGE.officialRubric).toBe(S2_5.officialRubricHeader);
    expect(BADGE.publishedByTutor).toBe(S2_5.publishedByTutor);
    expect(BADGE.approvedStructure).toBe(S2_5.approvedStructure);
    expect(BADGE.peerDiscussion).toBe(S2_5.peerContent);

    expect(MARKER.mapDisclaimer).toBe(S2_5.mapDisclaimer);
    expect(MARKER.approvedByTutor).toBe('Approved by your tutor');
    expect(MARKER.peerDiscussion).toBe('Peer discussion');
    expect(MARKER.officialSource('COSC1234_Assignment_A.pdf', 4)).toBe(
      'Source: COSC1234_Assignment_A.pdf, page 4',
    );
    expect(MARKER.publishedOn('2 Oct')).toBe('Published by your tutor on 2 Oct');
    expect(MARKER.authorityQuoteLabel('brief', 4)).toBe('From the brief, page 4');
    expect(MARKER.sourceLinkBrief(4)).toBe('Brief, page 4');
    expect(MARKER.sourceLinkRubric(2)).toBe('Official rubric, page 2');
    expect(MARKER.sourceLinkUnresolved).toBe('No page location found');

    expect(STATE_COPY.loading('Checklist')).toBe('Loading Checklist...');
    expect(STATE_COPY.insufficientData).toBe(S2_5.insufficientData);
    expect(STATE_COPY.elapsedTime).toBe(S2_5.elapsedTime);
    expect(STATE_COPY.refusalEscalation).toBe(S2_5.refusalEscalation);
    expect(STATE_COPY.refusalUnavailable).toBe(S2_5.assistantUnavailable);

    expect(anonymousDisplay(482)).toBe('Anonymous Student #482');
    expect(blockedUpload('it is a video file')).toBe(
      'This file was not sent to the Assistant because it is a video file.',
    );
  });

  it('keeps the empty-state strings the screens use', () => {
    expect(EMPTY_STATE.checklist).toBe(S2_5.emptyChecklist);
    expect(EMPTY_STATE.queries).toBe(S2_5.emptyQueries);
    expect(EMPTY_STATE.discussions).toBe(S2_5.emptyDiscussions);
  });

  it('spells the refusal opener with the student\'s own action', () => {
    expect(STATE_COPY.refusalOpener('review or change your implementation')).toBe(
      "I cannot review or change your implementation under this assignment's AI usage policy.",
    );
    const html = render(
      createElement('p', null, STATE_COPY.refusalOpener('review or change your implementation')),
    );
    expect(decodeEntities(html)).toContain(
      "I cannot review or change your implementation under this assignment's AI usage policy.",
    );
  });
});

describe('Badge', () => {
  it('renders every fixed content-class string from `07` S2.2 and S2.5', () => {
    expect(render(createElement(Badge, { variant: 'official-brief' }))).toContain(BADGE.officialBrief);
    expect(render(createElement(Badge, { variant: 'official-rubric' }))).toContain(BADGE.officialRubric);
    expect(render(createElement(Badge, { variant: 'approved' }))).toContain(BADGE.publishedByTutor);
    expect(render(createElement(Badge, { variant: 'structure' }))).toContain(BADGE.approvedStructure);
    expect(render(createElement(Badge, { variant: 'peer' }))).toContain(BADGE.peerDiscussion);
    expect(render(createElement(Badge, { variant: 'interpretation' }))).toContain(
      BADGE.interpretationStudentFacing,
    );
    expect(render(createElement(Badge, { variant: 'interpretation-pre-approval' }))).toContain(
      BADGE.interpretationPreApproval,
    );
  });

  it('carries a status label that is not a content-class string', () => {
    const html = render(createElement(Badge, { variant: 'status', label: 'In review' }));
    expect(html).toContain('In review');
    expect(html).toContain('border-default');
    expect(html).not.toContain('border-border-official');
  });

  it('repeats the tier as a border STYLE so the greyscale test holds at the badge', () => {
    expect(render(createElement(Badge, { variant: 'peer' }))).toContain('border-dotted');
    expect(render(createElement(Badge, { variant: 'interpretation' }))).toContain('border-dashed');
    expect(render(createElement(Badge, { variant: 'approved' }))).toContain('border-solid');
    expect(render(createElement(Badge, { variant: 'official-brief' }))).toContain('border-solid');
  });

  it('never truncates or ellipsises: the badge may wrap', () => {
    for (const variant of ['official-rubric', 'interpretation', 'peer'] as const) {
      const html = render(createElement(Badge, { variant }));
      expect(html).not.toContain('truncate');
      expect(html).not.toContain('ellipsis');
      expect(html).not.toContain('line-clamp');
      expect(html).not.toContain('whitespace-nowrap');
      expect(html).not.toContain('overflow-hidden');
    }
    // `max-w-full` without a clamp is what lets the text wrap instead of overflowing.
    expect(render(createElement(Badge, { variant: 'interpretation' }))).toContain('max-w-full');
  });

  it('supports the sticky Map badge and the full-width T5 badge', () => {
    const sticky = render(createElement(Badge, { variant: 'interpretation', sticky: true }));
    expect(sticky).toContain('sticky');
    const fullWidth = render(
      createElement(Badge, { variant: 'interpretation', fullWidth: true }),
    );
    expect(hasClass(firstClassAttribute(fullWidth), 'w-full')).toBe(true);
  });

  it('takes the badge type role, which is the 11px uppercase floor of `17` S2.4', () => {
    expect(render(createElement(Badge, { variant: 'peer' }))).toContain('badge');
  });
});
