/**
 * The proactive milestone notice (O2, `07-UI-UX-SPEC.md` section 4.7.1, `06` section 7.3.5).
 *
 * **Assembled, never generated.** This module makes no provider call and has no client parameter,
 * which is the structural form of O2 and `07` section 4.7.1 rule 4: the message is built from
 * published content, so it cannot bypass tutor approval (C3/I2). A live-generated notice would be
 * AI output reaching a student with no approval step.
 *
 * **At most 3 bullets, and fewer is correct.** `07` section 4.7.1 rule 3 forbids padding: when
 * approved content cannot support three bullets, the notice is shorter. When it cannot support one,
 * `assembleProactiveNotice` returns `null` and the route serves `null` rather than an empty shell.
 *
 * **Verbatim quotes only.** A requirement bullet is the published requirement's own
 * `verbatim_text`, clipped with a visible ellipsis at a word boundary; a checklist bullet is the
 * published item's title; a FAQ bullet is the first sentence of the published answer. Nothing here
 * paraphrases a requirement (C2), adds advice, or reorders a document.
 *
 * **Why the bullet order puts every non-FAQ citation first.** `06` section 7.3.4 gives an assistant
 * message two id arrays -- `grounding_chunk_ids` and `cited_faq_entry_ids` -- and no ordered
 * citation column. Ordering the bullets as [requirements and structure..., then FAQ...] means the
 * two arrays concatenated in that order reproduce the bullet order exactly, so a transcript read can
 * pair each stored bullet line with the citation it was delivered with. An interleaved order could
 * not be reconstructed, and a notice that rendered the wrong source against a bullet would be worse
 * than one with no source at all.
 *
 * Pure: no I/O, no clock, no model.
 */

import type { AssistantCitation, TruthTierApi } from '@/lib/api/types';
import type { MilestoneRequirement } from '@/lib/db/queries/assistant';
import type {
  VisibleChecklistItem,
  VisibleFaqEntry,
  VisibleMilestone,
} from '@/lib/db/queries/student-visibility';
import { sourceLabel, deepLinkFor } from './context';

/** `07` section 4.7.1 rule 2. */
export const MAX_PROACTIVE_BULLETS = 3;

/** How much of a verbatim requirement one bullet quotes before it is clipped with an ellipsis. */
export const PROACTIVE_BULLET_MAX_CHARS = 240;

export interface ProactiveBullet {
  readonly text: string;
  readonly citation: AssistantCitation;
}

export interface ProactiveAssemblyInput {
  readonly milestone: VisibleMilestone;
  /** Published requirements linked to this milestone (`milestone_requirement_links`). */
  readonly requirements: readonly MilestoneRequirement[];
  /** Published Checklist items of this milestone. */
  readonly checklistItems: readonly VisibleChecklistItem[];
  /** Published FAQ entries whose `milestone_id` is this milestone. */
  readonly faqEntries: readonly VisibleFaqEntry[];
}

export interface ProactiveAssembly {
  readonly body: string;
  readonly bullets: readonly ProactiveBullet[];
  /** Cited `requirement_node` / `checklist_item` / `milestone` ids, in bullet order. */
  readonly groundingIds: readonly string[];
  /** Cited `faq_entry` ids, after every grounding id in bullet order. */
  readonly faqEntryIds: readonly string[];
  readonly citedTiers: readonly TruthTierApi[];
}

/**
 * `07` section 4.7.1 rule 3: no bullet carries code or a solution step.
 *
 * A fenced block in a *brief* is still a code sample rather than something to "consider", so it is
 * skipped rather than trimmed: a trimmed code sample is a worse artefact than a shorter list. This
 * is deliberately a small check on the source text, not a re-implementation of the post-check,
 * which guards generated prose and is not in this path.
 */
function carriesCode(text: string): boolean {
  return text.includes('```') || text.includes('~~~');
}

/** Clip a verbatim quote at a word boundary, with an ellipsis that says it was clipped. */
export function clipQuote(text: string, max: number = PROACTIVE_BULLET_MAX_CHARS): string {
  const single = text.replace(/\s+/g, ' ').trim();
  if (single.length <= max) return single;
  const clipped = single.slice(0, max);
  const lastSpace = clipped.lastIndexOf(' ');
  return `${clipped.slice(0, lastSpace > 40 ? lastSpace : max).trimEnd()}...`;
}

/** The first sentence of a published FAQ answer, for a bullet that stays a statement. */
export function firstSentence(text: string, max: number = PROACTIVE_BULLET_MAX_CHARS): string {
  const single = text.replace(/\s+/g, ' ').trim();
  const match = /^[^.!?]*[.!?]/.exec(single);
  return clipQuote(match === null ? single : match[0], max);
}

/**
 * Build the notice's bullets and its citable ids, or `null` when nothing can be cited.
 *
 * Every branch quotes published content and cites it. There is no fallback advice string anywhere in
 * this function, because a fallback is how a "coach" invents content a tutor never approved.
 */
export function assembleProactiveNotice(input: ProactiveAssemblyInput): ProactiveAssembly | null {
  const bullets: ProactiveBullet[] = [];
  const groundingIds: string[] = [];
  const faqEntryIds: string[] = [];
  const tiers = new Set<TruthTierApi>();

  const push = (bullet: ProactiveBullet, isFaq: boolean): void => {
    if (bullets.length >= MAX_PROACTIVE_BULLETS) return;
    bullets.push(bullet);
    if (isFaq) faqEntryIds.push(bullet.citation.id);
    else groundingIds.push(bullet.citation.id);
    tiers.add(bullet.citation.truthTier);
  };

  for (const requirement of input.requirements) {
    if (bullets.length >= MAX_PROACTIVE_BULLETS) break;
    const text = clipQuote(requirement.verbatimText);
    if (text === '' || carriesCode(text)) continue;
    push(
      {
        text,
        citation: {
          kind: 'requirement_node',
          id: requirement.id,
          label: sourceLabel(requirement.sourceKind, requirement.pageFrom, requirement.sectionLabel),
          truthTier: 'T1',
          deepLink: deepLinkFor(requirement.pageFrom),
        },
      },
      false,
    );
  }

  for (const item of input.checklistItems) {
    if (bullets.length >= MAX_PROACTIVE_BULLETS) break;
    if (item.title.trim() === '' || carriesCode(item.title)) continue;
    push(
      {
        text: clipQuote(item.title),
        citation: {
          kind: 'checklist_item',
          id: item.id,
          label: `Checklist: ${item.title}`,
          truthTier: 'T3',
          deepLink: null,
        },
      },
      false,
    );
  }

  if (bullets.length < MAX_PROACTIVE_BULLETS && input.milestone.summary !== null) {
    const text = clipQuote(input.milestone.summary);
    if (text !== '' && !carriesCode(text)) {
      push(
        {
          text,
          citation: {
            kind: 'milestone',
            id: input.milestone.id,
            label: `Milestone: ${input.milestone.title}`,
            truthTier: 'T3',
            deepLink: null,
          },
        },
        false,
      );
    }
  }

  for (const entry of input.faqEntries) {
    if (bullets.length >= MAX_PROACTIVE_BULLETS) break;
    const text = firstSentence(entry.answer);
    if (text === '') continue;
    push(
      {
        text,
        citation: {
          kind: 'faq_entry',
          id: entry.id,
          label: `Official FAQ, "${entry.question}"`,
          truthTier: 'T2',
          deepLink: null,
        },
      },
      true,
    );
  }

  if (bullets.length === 0) return null;

  return {
    body: renderProactiveBody(input.milestone.title, bullets),
    bullets,
    groundingIds,
    faqEntryIds,
    citedTiers: [...tiers],
  };
}

/**
 * The notice's stored body (`06` section 7.3.5: at most 3 bullets).
 *
 * The header names the Milestone so the context is unambiguous (`07` section 4.7.1 rule 6), and the
 * numbering is what `parseProactiveBullets` reads back on a later visit.
 */
export function renderProactiveBody(milestoneTitle: string, bullets: readonly ProactiveBullet[]): string {
  const lines = bullets.map((bullet, index) => `${index + 1}. ${bullet.text}`);
  return [
    `You are starting ${milestoneTitle}. Before you begin, here are ${bullets.length} things the`,
    'assignment specifically requires you to consider:',
    '',
    ...lines,
  ].join('\n');
}

/** The bullet texts of a stored body, so a second visit shows the message that was delivered. */
export function parseProactiveBullets(body: string): string[] {
  const texts: string[] = [];
  for (const line of body.split('\n')) {
    const match = /^\s*\d+\.\s+(.*\S)\s*$/.exec(line);
    if (match !== null && match[1] !== undefined) texts.push(match[1]);
  }
  return texts;
}
