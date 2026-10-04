/**
 * The proactive notice (`07-UI-UX-SPEC.md` section 4.7.1; O2, `06` section 7.3.5).
 *
 * Three properties are asserted, in the document's own terms: at most three bullets, each grounded in
 * published content; fewer bullets when published content cannot support three, never padded; and a
 * bullet order that the two stored id arrays can reconstruct, so a second visit shows what was
 * delivered rather than a differently-assembled message.
 *
 * There is no provider anywhere in this file, and that is the point: the notice is assembled, not
 * generated (O2, rule 4).
 */

import { describe, expect, it } from 'vitest';

import type { MilestoneRequirement } from '@/lib/db/queries/assistant';
import type {
  VisibleChecklistItem,
  VisibleFaqEntry,
  VisibleMilestone,
} from '@/lib/db/queries/student-visibility';
import {
  MAX_PROACTIVE_BULLETS,
  assembleProactiveNotice,
  clipQuote,
  parseProactiveBullets,
  renderProactiveBody,
} from '@/features/assistant/proactive';

const MILESTONE: VisibleMilestone = {
  id: '30000000-0000-4000-8000-000000000001',
  title: 'Milestone 2 - Design',
  summary: 'Design the service and justify the choices you make.',
  displayOrder: 1,
};

const REQUIREMENTS: MilestoneRequirement[] = [
  {
    id: '40000000-0000-4000-8000-000000000001',
    title: 'Submission format',
    verbatimText: 'One file only is accepted for submission.',
    sourceKind: 'brief',
    pageFrom: 4,
    pageTo: 4,
    sectionLabel: '3.2',
  },
  {
    id: '40000000-0000-4000-8000-000000000002',
    title: 'Verifiability',
    verbatimText: 'The design must be verifiable against the stated requirements.',
    sourceKind: 'brief',
    pageFrom: 6,
    pageTo: 6,
    sectionLabel: null,
  },
];

function item(id: string, title: string, order: number): VisibleChecklistItem {
  return {
    id,
    milestoneId: MILESTONE.id,
    title,
    planningLevel: 'identify',
    description: null,
    displayOrder: order,
  };
}

const CHECKLIST: VisibleChecklistItem[] = [
  item('50000000-0000-4000-8000-000000000001', 'Identify the acceptance criteria', 1),
  item('50000000-0000-4000-8000-000000000002', 'Plan the component boundaries', 2),
];

const FAQ: VisibleFaqEntry = {
  id: '60000000-0000-4000-8000-000000000001',
  milestoneId: MILESTONE.id,
  question: 'Which diagram notation is expected?',
  answer: 'Use a component diagram. The brief does not require a UML profile.',
  displayOrder: 1,
  publishedAt: '2026-10-02T04:00:00.000Z',
};

describe('at most three bullets, each cited (07 section 4.7.1 rule 2)', () => {
  it('uses requirements first, and cites each bullet', () => {
    const assembly = assembleProactiveNotice({
      milestone: MILESTONE,
      requirements: REQUIREMENTS,
      checklistItems: CHECKLIST,
      faqEntries: [FAQ],
    });

    expect(assembly).not.toBeNull();
    if (assembly === null) return;
    expect(assembly.bullets).toHaveLength(MAX_PROACTIVE_BULLETS);
    expect(assembly.bullets[0]?.text).toBe('One file only is accepted for submission.');
    expect(assembly.bullets[0]?.citation.kind).toBe('requirement_node');
    expect(assembly.bullets[0]?.citation.truthTier).toBe('T1');
    expect(assembly.bullets[0]?.citation.label).toBe('Brief p.4, section 3.2');
    expect(assembly.bullets[0]?.citation.deepLink).toBe('#page=4');
    // A Checklist item has no page in a document, so it carries no deep link (`context.ts`): a
    // citation never invents a page location it cannot point at (`07` section 4.3 rule 3).
    expect(assembly.bullets[2]?.citation.kind).toBe('checklist_item');
    expect(assembly.bullets[2]?.citation.deepLink).toBeNull();
    for (const bullet of assembly.bullets) {
      expect(bullet.text.length).toBeGreaterThan(0);
      expect(bullet.citation.id).toBeTruthy();
    }
  });

  it('never pads: two published requirements give two bullets', () => {
    const assembly = assembleProactiveNotice({
      milestone: { ...MILESTONE, summary: null },
      requirements: REQUIREMENTS,
      checklistItems: [],
      faqEntries: [],
    });
    expect(assembly?.bullets).toHaveLength(2);
  });

  it('returns null when published content cannot support a single bullet', () => {
    const assembly = assembleProactiveNotice({
      milestone: { ...MILESTONE, summary: null },
      requirements: [],
      checklistItems: [],
      faqEntries: [],
    });
    expect(assembly).toBeNull();
  });

  it('falls back to the milestone summary when there are no requirements', () => {
    const assembly = assembleProactiveNotice({
      milestone: MILESTONE,
      requirements: [],
      checklistItems: [],
      faqEntries: [],
    });
    expect(assembly?.bullets).toHaveLength(1);
    expect(assembly?.bullets[0]?.citation.kind).toBe('milestone');
    expect(assembly?.bullets[0]?.citation.truthTier).toBe('T3');
  });
});

describe('the two id arrays can reconstruct the bullet order', () => {
  it('puts every non-FAQ citation before every FAQ citation', () => {
    const assembly = assembleProactiveNotice({
      milestone: { ...MILESTONE, summary: null },
      requirements: [REQUIREMENTS[0] as MilestoneRequirement],
      checklistItems: [],
      faqEntries: [FAQ],
    });

    expect(assembly).not.toBeNull();
    if (assembly === null) return;
    expect(assembly.bullets.map((bullet) => bullet.citation.kind)).toEqual([
      'requirement_node',
      'faq_entry',
    ]);
    // Concatenating the two stored arrays in the documented order reproduces the bullet citations,
    // which is what a transcript read depends on (`06` section 7.3.4 gives no ordered column).
    expect([...assembly.groundingIds, ...assembly.faqEntryIds]).toEqual(
      assembly.bullets.map((bullet) => bullet.citation.id),
    );
    expect(assembly.citedTiers).toEqual(['T1', 'T2']);
  });
});

describe('verbatim quotes, clipped visibly, never advice (07 section 4.7.1 rule 3)', () => {
  it('clips a long requirement at a word boundary with an ellipsis', () => {
    const long = `${'word '.repeat(80)}end`;
    const clipped = clipQuote(long, 60);
    expect(clipped.length).toBeLessThanOrEqual(63);
    expect(clipped.endsWith('...')).toBe(true);

    const assembly = assembleProactiveNotice({
      milestone: { ...MILESTONE, summary: null },
      requirements: [
        {
          id: '40000000-0000-4000-8000-000000000009',
          title: 'Long',
          verbatimText: long,
          sourceKind: 'brief',
          pageFrom: 1,
          pageTo: 1,
          sectionLabel: null,
        },
      ],
      checklistItems: [],
      faqEntries: [],
    });
    expect(assembly?.bullets[0]?.text.endsWith('...')).toBe(true);
  });

  it('skips a published requirement whose text carries a fenced code block', () => {
    const assembly = assembleProactiveNotice({
      milestone: { ...MILESTONE, summary: null },
      requirements: [
        {
          id: '40000000-0000-4000-8000-000000000010',
          title: 'Sample',
          verbatimText: 'Use this snippet:\n```js\nreturn 1;\n```',
          sourceKind: 'brief',
          pageFrom: 1,
          pageTo: 1,
          sectionLabel: null,
        },
        REQUIREMENTS[0] as MilestoneRequirement,
      ],
      checklistItems: [],
      faqEntries: [],
    });
    expect(assembly?.bullets).toHaveLength(1);
    expect(assembly?.bullets[0]?.text).toBe('One file only is accepted for submission.');
  });

  it('uses the first sentence of a published FAQ answer', () => {
    const assembly = assembleProactiveNotice({
      milestone: { ...MILESTONE, summary: null },
      requirements: [],
      checklistItems: [],
      faqEntries: [FAQ],
    });
    expect(assembly?.bullets[0]?.text).toBe('Use a component diagram.');
  });
});

describe('the stored body round-trips', () => {
  it('renders one numbered line per bullet and reads them back in order', () => {
    const assembly = assembleProactiveNotice({
      milestone: MILESTONE,
      requirements: REQUIREMENTS,
      checklistItems: CHECKLIST,
      faqEntries: [FAQ],
    });
    expect(assembly).not.toBeNull();
    if (assembly === null) return;

    const body = renderProactiveBody(MILESTONE.title, assembly.bullets);
    expect(body).toContain('You are starting Milestone 2 - Design.');
    expect(parseProactiveBullets(body)).toEqual(assembly.bullets.map((bullet) => bullet.text));
    expect(parseProactiveBullets(body)).toHaveLength(MAX_PROACTIVE_BULLETS);
  });
});
