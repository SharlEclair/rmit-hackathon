/**
 * The grounding set's structural guarantees (`05-AI-GUARDRAILS.md` sections 5.1-5.3; D14, O10, D93).
 *
 * The claim under test is not "the code filters discussion posts out". A filter is a code path that
 * can be forgotten or reordered; what is asserted here is that **raw discussion content has no way
 * in**: no module in the assistant's grounding path imports a discussion or moderation module, the
 * one query module the pathway owns never names a discussion table, and the grounding input type has
 * exactly four published-content fields and no field for a post.
 *
 * The other half is the numbering: `renderGroundingChunks` numbers by position (D93), so authority
 * order and citation numbering are the same fact, and the test asserts both together.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  MAX_GROUNDING_ITEMS,
  buildGroundingSet,
  groundingAsSourceChunks,
  groundingTiers,
  renderGrounding,
  resolveCitedRefs,
  type GroundingChunkInput,
  type GroundingInput,
} from '@/features/assistant/context';
import type {
  VisibleChecklistItem,
  VisibleFaqEntry,
  VisibleMilestone,
} from '@/lib/db/queries/student-visibility';

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC_DIR = join(APP_DIR, 'src');

/** Every file on the assistant's grounding path. */
const GROUNDING_PATH_FILES = [
  'features/assistant/context.ts',
  'features/assistant/retrieve.ts',
  'features/assistant/answer.ts',
  'features/assistant/stream.ts',
  'features/assistant/service.ts',
  'lib/db/queries/assistant.ts',
];

function sourceOf(relativePath: string): string {
  return readFileSync(join(SRC_DIR, relativePath), 'utf8');
}

function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const pattern = /from\s+['"]([^'"]+)['"]/g;
  let match = pattern.exec(source);
  while (match) {
    if (match[1]) specifiers.push(match[1]);
    match = pattern.exec(source);
  }
  return specifiers;
}

const T1_CHUNK: GroundingChunkInput = {
  id: '10000000-0000-4000-8000-000000000001',
  sourceKind: 'brief',
  text: 'One file only is accepted for submission.',
  pageFrom: 4,
  pageTo: 4,
  sectionLabel: '3.2',
};

const FAQ: VisibleFaqEntry = {
  id: '20000000-0000-4000-8000-000000000001',
  milestoneId: '30000000-0000-4000-8000-000000000001',
  question: 'How many references are required?',
  answer: 'The brief requires at least ten peer-reviewed references.',
  displayOrder: 1,
  publishedAt: '2026-10-02T04:00:00.000Z',
};

const MILESTONE: VisibleMilestone = {
  id: '30000000-0000-4000-8000-000000000001',
  title: 'Milestone 2 - Design',
  summary: 'Design the service and justify the choices.',
  displayOrder: 1,
};

const CHECKLIST_ITEM: VisibleChecklistItem = {
  id: '40000000-0000-4000-8000-000000000001',
  milestoneId: MILESTONE.id,
  title: 'Identify the acceptance criteria',
  planningLevel: 'identify',
  description: null,
  displayOrder: 1,
};

const INPUT: GroundingInput = {
  chunks: [T1_CHUNK],
  faqEntries: [FAQ],
  milestones: [MILESTONE],
  checklistItems: [CHECKLIST_ITEM],
};

describe('T4 raw discussion content is structurally unreachable', () => {
  it.each(GROUNDING_PATH_FILES)('%s imports no discussion or moderation module', (file: string) => {
    for (const specifier of importSpecifiers(sourceOf(file))) {
      expect(specifier, `${file} imports ${specifier}`).not.toMatch(/discussion|moderation/i);
    }
  });

  it('the assistant query module never names a discussion table', () => {
    const source = sourceOf('lib/db/queries/assistant.ts');
    // T4 lives in these three tables. A query module that never names one cannot return a post, and
    // the SQL check is stronger than an import check because the SQL is where a table is chosen.
    expect(source).not.toContain('discussion_posts');
    expect(source).not.toContain('discussion_threads');
    expect(source).not.toContain('moderation_flags');
  });

  it('the grounding input type carries exactly the four published-content fields', () => {
    const source = sourceOf('features/assistant/context.ts');
    const declaration = /export interface GroundingInput \{([\s\S]*?)\n\}/.exec(source);
    expect(declaration).not.toBeNull();
    const body = declaration?.[1] ?? '';
    const fields = [...body.matchAll(/readonly\s+(\w+):/g)].map((match) => match[1]);
    expect(fields.sort()).toEqual(['checklistItems', 'chunks', 'faqEntries', 'milestones']);
  });

  it('every produced citation is a citable published kind, never T4 or T5', () => {
    const set = buildGroundingSet(INPUT);
    expect(set.refs).toHaveLength(4);
    for (const ref of set.refs) {
      expect(['T1', 'T2', 'T3']).toContain(ref.citation.truthTier);
      expect(['source_chunk', 'faq_entry', 'milestone', 'checklist_item', 'requirement_node']).toContain(
        ref.citation.kind,
      );
    }
    expect(groundingTiers(set)).not.toContain('T4');
    expect(groundingTiers(set)).not.toContain('T5');
  });
});

describe('authority order is the citation numbering (D93)', () => {
  it('orders T1, then T2, then T3, with ref = array position', () => {
    const set = buildGroundingSet(INPUT);
    expect(set.refs.map((ref) => ref.ref)).toEqual([0, 1, 2, 3]);
    expect(set.refs.map((ref) => ref.citation.truthTier)).toEqual(['T1', 'T2', 'T3', 'T3']);
    expect(set.refs.map((ref) => ref.citation.kind)).toEqual([
      'source_chunk',
      'faq_entry',
      'milestone',
      'checklist_item',
    ]);
  });

  it('renders the numbering from the frozen helper rather than re-deriving it', () => {
    const rendered = renderGrounding(buildGroundingSet(INPUT));
    expect(rendered).toContain('[#0] (page 4, "3.2")');
    expect(rendered).toContain('[#1] (no page anchor)');
  });

  it('caps the set, so a large assignment cannot inflate block C without bound', () => {
    const many: GroundingChunkInput[] = Array.from({ length: MAX_GROUNDING_ITEMS + 5 }, (_, index) => ({
      ...T1_CHUNK,
      id: `5000000${index}-0000-4000-8000-00000000000${index % 10}`,
    }));
    const set = buildGroundingSet({ chunks: many, faqEntries: [], milestones: [], checklistItems: [] });
    expect(set.refs).toHaveLength(MAX_GROUNDING_ITEMS);
  });
});

describe('the guardrail is given the same material as the model', () => {
  it('converts the grounding set into T1-T3 source chunks', () => {
    const sources = groundingAsSourceChunks(buildGroundingSet(INPUT));
    expect(sources.map((source) => source.tier)).toEqual(['T1', 'T2', 'T3', 'T3']);
    // `SourceChunk.pageFrom` is not nullable; a T2/T3 artifact has no page and 0 says so.
    expect(sources.map((source) => source.pageFrom)).toEqual([4, 0, 0, 0]);
    expect(sources[0]?.text).toBe(T1_CHUNK.text);
  });
});

describe('citation resolution (06 section 5.5.9 rule 6, D93)', () => {
  const set = buildGroundingSet(INPUT);

  it('resolves the bracketed position the model was given', () => {
    const resolved = resolveCitedRefs(set, ['0', '[#1]', '#2', '3']);
    expect(resolved.citations.map((citation) => citation.kind)).toEqual([
      'source_chunk',
      'faq_entry',
      'milestone',
      'checklist_item',
    ]);
    expect(resolved.citedChunkIds).toEqual([T1_CHUNK.id]);
    expect(resolved.faqEntryIds).toEqual([FAQ.id]);
    expect(resolved.groundingIds).toEqual([T1_CHUNK.id, MILESTONE.id, CHECKLIST_ITEM.id]);
    expect(resolved.droppedRefs).toEqual([]);
  });

  it('drops an unresolvable citation rather than inventing one', () => {
    const resolved = resolveCitedRefs(set, ['9', 'x', '']);
    expect(resolved.citations).toHaveLength(0);
    expect(resolved.droppedRefs).toEqual(['9', 'x', '']);
  });

  it('accepts a literal id that is in the set, and deduplicates a repeated citation', () => {
    const resolved = resolveCitedRefs(set, [T1_CHUNK.id, '0']);
    expect(resolved.citations).toHaveLength(1);
    expect(resolved.droppedRefs).toHaveLength(0);
  });
});
