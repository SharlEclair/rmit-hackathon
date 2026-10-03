/**
 * The grounding set: the truth-ordered, citable material one assistant turn may answer from
 * (`05-AI-GUARDRAILS.md` sections 5.1, 5.2; D93).
 *
 * **The order is the authority order, and it is also the citation numbering.** T1 official chunks
 * first, then T2 published policy and FAQ, then T3 approved structure. `renderGroundingChunks`
 * numbers an array by position (`[#0]`, `[#1]`, ...), so building the array in authority order is
 * what makes "the lowest-numbered citation is the most authoritative" true without a second rule.
 * The numbering is **not** re-derived here: `src/lib/llm/prompt.ts` owns it (D93), and this module
 * only keeps the array position and the citation side by side.
 *
 * **T4 and T5 are structurally unreachable, not filtered.** This module's inputs are three
 * published-content shapes and one chunk shape. There is no discussion input, no moderation input,
 * and no import path from here to a discussion module: a raw discussion post has no way in, which
 * is the stronger form of `D14`/`O10`'s "T4 is never cited as the basis of an authoritative
 * statement". `tests/assistant/grounding.test.ts` asserts that structure by reading this file's
 * imports rather than trusting the comment.
 *
 * **Policy rules are read but are not citable.** `06` section 5.5.9's `AssistantCitation.kind` has
 * five members and none of them is a `ai_policy_rules` row, so the published policy is rendered as
 * block B's own text (see `answer.ts`) and never becomes a `[#N]` handle. A model that cited the
 * policy as a source would be citing something the contract cannot carry.
 *
 * Pure: no I/O, no clock. Every input is already-published content or a retrieved chunk.
 */

import type { AssistantCitation, TruthTierApi } from '@/lib/api/types';
import { renderGroundingChunks, type GroundingChunk } from '@/lib/llm/prompt';

import type { VisibleChecklistItem, VisibleFaqEntry, VisibleMilestone } from '@/lib/db/queries/student-visibility';

/**
 * The largest number of citable artifacts one grounding block may carry.
 *
 * `04` section 5.5 wants block C stable and bounded; a block that grows with the number of
 * published checklist items is both a prompt-cache and a cost problem. 24 is the same order as the
 * Analyst's own grounding cap and comfortably covers a demo assignment.
 */
export const MAX_GROUNDING_ITEMS = 24;

/** One retrieved or published T1 chunk, in the shape both the search and the stable order produce. */
export interface GroundingChunkInput {
  readonly id: string;
  readonly sourceKind: string;
  readonly text: string;
  readonly pageFrom: number | null;
  readonly pageTo: number | null;
  readonly sectionLabel: string | null;
}

export interface GroundingInput {
  /** T1. Already ordered by the query that produced it (`listT1Chunks`, or the search fallback). */
  readonly chunks: readonly GroundingChunkInput[];
  /** T2, published. */
  readonly faqEntries: readonly VisibleFaqEntry[];
  /** T3, published. */
  readonly milestones: readonly VisibleMilestone[];
  /** T3, published. */
  readonly checklistItems: readonly VisibleChecklistItem[];
}

/** One numbered artifact: the position the model is given, and the citation it resolves to. */
export interface GroundingRef {
  /** The `[#N]` index `renderGroundingChunks` assigns, i.e. the position in `GroundingSet.chunks`. */
  readonly ref: number;
  readonly citation: AssistantCitation;
  /** The text the post-check's `POST_TECH` check compares a generated term against. */
  readonly text: string;
}

export interface GroundingSet {
  readonly chunks: GroundingChunk[];
  readonly refs: readonly GroundingRef[];
}

/** The label prefix per `assignment_sources.kind` (`06` section 7.2.2). */
const SOURCE_LABELS: Readonly<Record<string, string>> = {
  brief: 'Brief',
  rubric: 'Official rubric',
  ai_policy: 'AI policy',
  marking_guide: 'Marking guide',
  supplementary: 'Supplementary',
};

/** `Brief p.4, section 3.2` (`06` section 5.5.9's own example label). */
export function sourceLabel(
  sourceKind: string,
  pageFrom: number | null,
  sectionLabel: string | null,
): string {
  const prefix = SOURCE_LABELS[sourceKind] ?? 'Document';
  const page = pageFrom === null ? '' : ` p.${pageFrom}`;
  const section = sectionLabel === null || sectionLabel === '' ? '' : `, section ${sectionLabel}`;
  return `${prefix}${page}${section}`;
}

/** `#page=<n>` (`D43`), or null when the artifact has no page location. */
export function deepLinkFor(pageFrom: number | null): string | null {
  return pageFrom === null ? null : `#page=${pageFrom}`;
}

/**
 * Assemble the grounding set in authority order.
 *
 * A source chunk, a FAQ entry, a milestone and a checklist item each contribute exactly one
 * numbered artifact. Nothing is added that is not citable, because an uncitable `[#N]` is an
 * invitation to cite something the transcript cannot render.
 */
export function buildGroundingSet(input: GroundingInput): GroundingSet {
  const chunks: GroundingChunk[] = [];
  const refs: GroundingRef[] = [];

  const push = (chunk: GroundingChunk, citation: AssistantCitation, text: string): void => {
    const ref = chunks.length;
    if (ref >= MAX_GROUNDING_ITEMS) return;
    chunks.push(chunk);
    refs.push({ ref, citation, text });
  };

  for (const chunk of input.chunks) {
    push(
      {
        id: chunk.id,
        pageFrom: chunk.pageFrom,
        pageTo: chunk.pageTo,
        sectionLabel: chunk.sectionLabel,
        text: chunk.text,
      },
      {
        kind: 'source_chunk',
        id: chunk.id,
        label: sourceLabel(chunk.sourceKind, chunk.pageFrom, chunk.sectionLabel),
        truthTier: 'T1',
        deepLink: deepLinkFor(chunk.pageFrom),
      },
      chunk.text,
    );
  }

  for (const entry of input.faqEntries) {
    push(
      { id: entry.id, pageFrom: null, pageTo: null, sectionLabel: null, text: entry.answer },
      {
        kind: 'faq_entry',
        id: entry.id,
        label: `Official FAQ, "${entry.question}"`,
        truthTier: 'T2',
        deepLink: null,
      },
      `${entry.question}\n${entry.answer}`,
    );
  }

  for (const milestone of input.milestones) {
    push(
      {
        id: milestone.id,
        pageFrom: null,
        pageTo: null,
        sectionLabel: null,
        text: milestone.summary ?? milestone.title,
      },
      {
        kind: 'milestone',
        id: milestone.id,
        label: `Milestone: ${milestone.title}`,
        truthTier: 'T3',
        deepLink: null,
      },
      `${milestone.title}${milestone.summary === null ? '' : ` - ${milestone.summary}`}`,
    );
  }

  for (const item of input.checklistItems) {
    push(
      {
        id: item.id,
        pageFrom: null,
        pageTo: null,
        sectionLabel: null,
        text: `${item.title}${item.description === null ? '' : ` - ${item.description}`}`,
      },
      {
        kind: 'checklist_item',
        id: item.id,
        label: `Checklist: ${item.title}`,
        truthTier: 'T3',
        deepLink: null,
      },
      `${item.title}${item.description === null ? '' : ` - ${item.description}`}`,
    );
  }

  return { chunks, refs };
}

/** Block C, rendered by the frozen helper so the numbering cannot drift (D93). */
export function renderGrounding(set: GroundingSet): string {
  return renderGroundingChunks(set.chunks);
}

/** The `SourceChunk[]` the guardrail's L1 consumes (`05` section 5.1: tiers T1-T3 only). */
export function groundingAsSourceChunks(
  set: GroundingSet,
): Array<{ chunkId: string; documentId: string; tier: 'T1' | 'T2' | 'T3'; pageFrom: number; text: string }> {
  return set.refs.map((ref) => ({
    chunkId: ref.citation.id,
    documentId: ref.citation.id,
    tier: asGroundingTier(ref.citation.truthTier),
    // `SourceChunk.pageFrom` is not nullable and L1 reads only `text` (`groundedInSources`), but a
    // T2/T3 artifact genuinely has no page. 0 is the "no page anchor" marker here rather than an
    // invented page number.
    pageFrom: pageFromOf(ref.citation.deepLink),
    text: ref.text,
  }));
}

function asGroundingTier(tier: TruthTierApi): 'T1' | 'T2' | 'T3' {
  return tier === 'T1' ? 'T1' : tier === 'T2' ? 'T2' : 'T3';
}

function pageFromOf(deepLink: string | null): number {
  if (deepLink === null) return 0;
  const match = /^#page=(\d+)$/.exec(deepLink);
  return match === null ? 0 : Number(match[1]);
}

export interface ResolvedCitations {
  /** In the order the model cited them, unresolvable refs dropped (`06` section 5.5.9 rule 6). */
  readonly citations: AssistantCitation[];
  /** `source_chunk` ids only: this is what `runPostCheck` compares against the retrieved set. */
  readonly citedChunkIds: string[];
  /** Cited artifacts recorded in `assistant_messages.grounding_chunk_ids` (see `queries/assistant.ts`). */
  readonly groundingIds: string[];
  /** Cited FAQ entries, recorded in `cited_faq_entry_ids`. */
  readonly faqEntryIds: string[];
  /** Refs the model returned that are not in this turn's set. Reported, never invented around. */
  readonly droppedRefs: string[];
}

/**
 * Resolve the model's cited references against the grounding set **by index**.
 *
 * A model echoes the position it was given, not a UUID (D93, `schema.ts`'s own reasoning), so the
 * accepted forms are `3`, `#3` and `[#3]`. A literal id that is present in the set is also
 * accepted, because refusing it would drop a citation the model got right for the wrong reason.
 * Anything else is dropped: an invented citation is worse than a missing one, and `POST_UNSOURCED`
 * in `runPostCheck` is the layer that decides what a citation-free answer means.
 */
export function resolveCitedRefs(set: GroundingSet, refs: readonly string[]): ResolvedCitations {
  const citations: AssistantCitation[] = [];
  const citedChunkIds: string[] = [];
  const groundingIds: string[] = [];
  const faqEntryIds: string[] = [];
  const droppedRefs: string[] = [];
  const seen = new Set<string>();

  for (const raw of refs) {
    const ref = resolveOne(set, raw);
    if (ref === null) {
      droppedRefs.push(raw);
      continue;
    }
    if (seen.has(ref.citation.id)) continue;
    seen.add(ref.citation.id);
    citations.push(ref.citation);

    if (ref.citation.kind === 'source_chunk') citedChunkIds.push(ref.citation.id);
    if (ref.citation.kind === 'faq_entry') faqEntryIds.push(ref.citation.id);
    else groundingIds.push(ref.citation.id);
  }

  return { citations, citedChunkIds, groundingIds, faqEntryIds, droppedRefs };
}

function resolveOne(set: GroundingSet, raw: string): GroundingRef | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;

  const positional = /^\[?#?(\d+)\]?$/.exec(trimmed);
  if (positional !== null) {
    const index = Number(positional[1]);
    return set.refs.find((candidate) => candidate.ref === index) ?? null;
  }

  return set.refs.find((candidate) => candidate.citation.id === trimmed) ?? null;
}

/** Every truth tier this turn's grounding set covers, for `assistant_messages.cited_tiers` (R4). */
export function groundingTiers(set: GroundingSet): TruthTierApi[] {
  const tiers = new Set<TruthTierApi>();
  for (const ref of set.refs) tiers.add(ref.citation.truthTier);
  return [...tiers];
}

/**
 * A stored citation id, resolved back to the citation a reader saw.
 *
 * Used by the transcript read and by the proactive notice's second visit, where the only thing that
 * survives is the id arrays on `assistant_messages` (`06` section 7.3.4). The label is rebuilt from
 * provenance -- the source kind, its page range and its own section heading -- and never from a
 * model's assertion (`AssistantCitation.label`'s own contract).
 */
export function citationForArtifact(artifact: {
  readonly id: string;
  readonly kind: AssistantCitation['kind'];
  readonly sourceKind: string | null;
  readonly title: string | null;
  readonly pageFrom: number | null;
  readonly sectionLabel: string | null;
}): AssistantCitation {
  switch (artifact.kind) {
    case 'source_chunk':
      return {
        kind: 'source_chunk',
        id: artifact.id,
        label: sourceLabel(artifact.sourceKind ?? '', artifact.pageFrom, artifact.sectionLabel),
        truthTier: 'T1',
        deepLink: deepLinkFor(artifact.pageFrom),
      };
    case 'requirement_node':
      return {
        kind: 'requirement_node',
        id: artifact.id,
        label: sourceLabel(artifact.sourceKind ?? '', artifact.pageFrom, artifact.sectionLabel),
        truthTier: 'T1',
        deepLink: deepLinkFor(artifact.pageFrom),
      };
    case 'faq_entry':
      return {
        kind: 'faq_entry',
        id: artifact.id,
        label: `Official FAQ, "${artifact.title ?? ''}"`,
        truthTier: 'T2',
        deepLink: null,
      };
    case 'milestone':
      return {
        kind: 'milestone',
        id: artifact.id,
        label: `Milestone: ${artifact.title ?? ''}`,
        truthTier: 'T3',
        deepLink: null,
      };
    case 'checklist_item':
      return {
        kind: 'checklist_item',
        id: artifact.id,
        label: `Checklist: ${artifact.title ?? ''}`,
        truthTier: 'T3',
        deepLink: null,
      };
  }
}
