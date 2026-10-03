import { createElement } from 'react';
import { describe, expect, it } from 'vitest';

import { ContentClassPanel } from '@/components/ui/content-class-panel';
import { BADGE } from '@/components/ui/fixed-strings';

import { borderStyleOf, contentClassFrame, hasClass, render } from './harness';

/**
 * `07` S2.2 rule 6, the design law: with colour removed, the five classes remain distinguishable
 * by border STYLE (solid / dashed / dotted), badge TEXT, and left-rule presence. This test reads
 * those three non-colour cues out of the rendered markup and asserts that no two classes share a
 * combination. `17` S12 G1 asserts the same property on a desaturated screenshot; this is the
 * machine-checkable half of it.
 */
const CLASSES = [
  {
    contentClass: 'official' as const,
    html: render(
      createElement(ContentClassPanel, {
        contentClass: 'official',
        officialKind: 'brief',
        sourceFile: 'COSC1234_Assignment_A.pdf',
        sourcePage: 4,
        children: 'body',
      }),
    ),
    badge: BADGE.officialBrief,
  },
  {
    contentClass: 'approved' as const,
    html: render(
      createElement(ContentClassPanel, {
        contentClass: 'approved',
        publishedOn: '2 Oct',
        children: 'body',
      }),
    ),
    badge: BADGE.publishedByTutor,
  },
  {
    contentClass: 'structure' as const,
    html: render(createElement(ContentClassPanel, { contentClass: 'structure', children: 'body' })),
    badge: BADGE.approvedStructure,
  },
  {
    contentClass: 'peer' as const,
    html: render(createElement(ContentClassPanel, { contentClass: 'peer', children: 'body' })),
    badge: BADGE.peerDiscussion,
  },
  {
    contentClass: 'interpretation' as const,
    html: render(
      createElement(ContentClassPanel, { contentClass: 'interpretation', children: 'body' }),
    ),
    badge: BADGE.interpretationStudentFacing,
  },
];

describe('greyscale test: the three non-colour cues', () => {
  it('gives every class a distinct (border style, badge text, left rule) triple', () => {
    const triples = CLASSES.map((entry) => {
      const frame = contentClassFrame(entry.html, entry.contentClass);
      return {
        contentClass: entry.contentClass,
        borderStyle: borderStyleOf(frame),
        badge: entry.badge,
        hasLeftRule: hasClass(frame, 'border-l-4'),
        key: `${borderStyleOf(frame)}|${entry.badge}|${hasClass(frame, 'border-l-4')}`,
      };
    });

    const keys = triples.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);

    // Sanity: the cue values are the ones `07` S2.2 and `17` S5.2 specify, so a distinctness that
    // came from a wrong style would still fail here.
    expect(triples.find((entry) => entry.contentClass === 'official')).toMatchObject({
      borderStyle: 'solid',
      hasLeftRule: true,
    });
    expect(triples.find((entry) => entry.contentClass === 'approved')).toMatchObject({
      borderStyle: 'solid',
      hasLeftRule: true,
    });
    expect(triples.find((entry) => entry.contentClass === 'structure')).toMatchObject({
      borderStyle: 'solid',
      hasLeftRule: false,
    });
    expect(triples.find((entry) => entry.contentClass === 'peer')).toMatchObject({
      borderStyle: 'dotted',
      hasLeftRule: false,
    });
    expect(triples.find((entry) => entry.contentClass === 'interpretation')).toMatchObject({
      borderStyle: 'dashed',
      hasLeftRule: true,
    });
  });

  it('renders each class badge text in full, never shortened', () => {
    for (const entry of CLASSES) {
      expect(entry.html).toContain(entry.badge);
    }
  });

  it('applies exactly one border style per frame', () => {
    for (const entry of CLASSES) {
      const frame = contentClassFrame(entry.html, entry.contentClass);
      const styles = ['border-solid', 'border-dashed', 'border-dotted'].filter((name) =>
        hasClass(frame, name),
      );
      expect(styles).toHaveLength(1);
    }
  });
});
