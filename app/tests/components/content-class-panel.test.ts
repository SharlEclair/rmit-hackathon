import { createElement } from 'react';
import { describe, expect, it } from 'vitest';

import { ContentClassPanel } from '@/components/ui/content-class-panel';
import { BADGE, MARKER } from '@/components/ui/fixed-strings';

import { borderStyleOf, contentClassFrame, hasClass, render } from './harness';

const CHILD = 'panel body';

const official = render(
  createElement(ContentClassPanel, {
    contentClass: 'official',
    officialKind: 'brief',
    sourceFile: 'COSC1234_Assignment_A.pdf',
    sourcePage: 4,
    children: CHILD,
  }),
);

const rubric = render(
  createElement(ContentClassPanel, {
    contentClass: 'official',
    officialKind: 'rubric',
    sourceFile: 'COSC1234_Rubric.pdf',
    sourcePage: 2,
    children: CHILD,
  }),
);

const approved = render(
  createElement(ContentClassPanel, {
    contentClass: 'approved',
    publishedOn: '2 Oct',
    children: CHILD,
  }),
);

const structure = render(
  createElement(ContentClassPanel, { contentClass: 'structure', children: CHILD }),
);

const peer = render(createElement(ContentClassPanel, { contentClass: 'peer', children: CHILD }));

const interpretation = render(
  createElement(ContentClassPanel, { contentClass: 'interpretation', children: CHILD }),
);

const preApproval = render(
  createElement(ContentClassPanel, {
    contentClass: 'interpretation',
    approvalState: 'pre-approval',
    children: CHILD,
  }),
);

describe('ContentClassPanel', () => {
  it('sets data-content-class to exactly one of the five class names', () => {
    const rendered = [official, rubric, approved, structure, peer, interpretation, preApproval];
    const allowed = new Set(['official', 'approved', 'structure', 'peer', 'interpretation']);

    for (const html of rendered) {
      const matches = [...html.matchAll(/data-content-class="([^"]*)"/g)];
      expect(matches).toHaveLength(1);
      expect(allowed.has(matches[0]?.[1] ?? '')).toBe(true);
    }
  });

  it('renders the official frame: 1px solid official border, 4px solid left rule, official surface', () => {
    const frame = contentClassFrame(official, 'official');
    expect(hasClass(frame, 'border')).toBe(true);
    expect(hasClass(frame, 'border-solid')).toBe(true);
    expect(hasClass(frame, 'border-border-official')).toBe(true);
    expect(hasClass(frame, 'border-l-4')).toBe(true);
    expect(hasClass(frame, 'bg-official')).toBe(true);
    expect(borderStyleOf(frame)).toBe('solid');
  });

  it('gives T1 its own fixed header string and marker, and no AI badge', () => {
    expect(official).toContain(BADGE.officialBrief);
    expect(official).toContain(MARKER.officialSource('COSC1234_Assignment_A.pdf', 4));
    expect(official).not.toContain(BADGE.publishedByTutor);
    expect(official).not.toContain(BADGE.interpretationStudentFacing);
    expect(official).not.toContain(BADGE.interpretationPreApproval);

    expect(rubric).toContain(BADGE.officialRubric);
    expect(rubric).not.toContain(BADGE.officialBrief);
    expect(rubric).toContain('Source: COSC1234_Rubric.pdf, page 2');
  });

  it('renders the tutor-published frame: solid approved border plus the 4px left rule', () => {
    const frame = contentClassFrame(approved, 'approved');
    expect(hasClass(frame, 'border-solid')).toBe(true);
    expect(hasClass(frame, 'border-border-approved')).toBe(true);
    expect(hasClass(frame, 'border-l-4')).toBe(true);
    expect(hasClass(frame, 'bg-approved')).toBe(true);
  });

  it('renders the approved-structure frame: the same surface and border, no left rule', () => {
    const frame = contentClassFrame(structure, 'structure');
    expect(hasClass(frame, 'border-solid')).toBe(true);
    expect(hasClass(frame, 'border-border-approved')).toBe(true);
    expect(hasClass(frame, 'border-l-4')).toBe(false);
    expect(hasClass(frame, 'bg-approved')).toBe(true);
    expect(structure).toContain(BADGE.approvedStructure);
    expect(structure).toContain(MARKER.approvedByTutor);
  });

  it('renders the peer frame as a dotted border with no left rule', () => {
    const frame = contentClassFrame(peer, 'peer');
    expect(hasClass(frame, 'border-dotted')).toBe(true);
    expect(hasClass(frame, 'border-border-peer')).toBe(true);
    expect(hasClass(frame, 'border-l-4')).toBe(false);
    expect(peer).toContain(BADGE.peerDiscussion);
    expect(peer).toContain(MARKER.peerDiscussion);
  });

  it('renders the interpretation frame as a dashed border with a 4px dashed left rule', () => {
    const frame = contentClassFrame(interpretation, 'interpretation');
    expect(hasClass(frame, 'border-dashed')).toBe(true);
    expect(hasClass(frame, 'border-border-interpretation')).toBe(true);
    expect(hasClass(frame, 'border-l-4')).toBe(true);
    expect(hasClass(frame, 'bg-interpretation')).toBe(true);
    expect(interpretation).toContain(BADGE.interpretationStudentFacing);
    expect(interpretation).toContain(MARKER.mapDisclaimer);
  });

  it('switches the T5 badge to the pre-approval string for a tutor-facing artifact', () => {
    expect(preApproval).toContain(BADGE.interpretationPreApproval);
    expect(preApproval).not.toContain(BADGE.interpretationStudentFacing);
    // `07` S2.2 gives the disclaimer only as a post-approval marker.
    expect(preApproval).not.toContain(MARKER.mapDisclaimer);
  });

  it('is flat: sheet radius, no elevation, on every class', () => {
    for (const html of [official, approved, structure, peer, interpretation]) {
      const frame = contentClassFrame(html, /data-content-class="([^"]*)"/.exec(html)?.[1] ?? '');
      expect(hasClass(frame, 'rounded-sheet')).toBe(true);
      expect(frame).not.toContain('shadow-card');
      expect(frame).not.toContain('shadow-overlay');
    }
  });

  it('never emits a truncating class on the frame', () => {
    for (const html of [official, approved, structure, peer, interpretation]) {
      expect(html).not.toContain('truncate');
      expect(html).not.toContain('ellipsis');
    }
  });
});
