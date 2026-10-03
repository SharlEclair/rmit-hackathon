/**
 * Stored artifact row -> `06` section 5.5.8's `ReviewArtifactResponse`.
 *
 * **Why a separate module.** `GET .../review` maps a whole bundle and `PATCH
 * /api/tutor/structure-artifacts/{artifactId}` maps one artifact; both must produce byte-identical
 * shaping, because the client replaces its cached card with the PATCH response. A second shaping path
 * would be a second definition of `truthTier`, `validation` and the provenance fallback.
 *
 * **The provenance fallback.** `06` section 5.5.8 requires `provenance.generatedAt` and makes
 * `modelId`/`promptVersion` nullable. An artifact with `origin = 'tutor'` has a null `provenance`
 * column, and inventing a model id for it would be a false provenance claim -- the one thing C3's
 * badge exists to prevent. `generatedAt` therefore falls back to the row's `created_at` and the model
 * fields stay null.
 *
 * **Validation is recomputed, never stored.** `06` section 5.5.8 computes it, and a stored warning
 * goes stale the moment a tutor edits the field it was about. The recomputation lives in
 * `src/features/review/artifacts.ts` and reuses the ingestion constraints Phase 2 built for exactly
 * this call.
 */

import type { ReviewArtifactResponse, ValidationWarning } from '@/lib/api/types';
import type { ReviewArtifactRow } from '@/lib/db/queries/review';
import { truthTierFor, validationFor, type ValidationSubject } from './artifacts';

export function inferReviewArtifact(row: ReviewArtifactRow): ReviewArtifactResponse {
  const validation = validationFor(subjectFor(row));
  const payload = payloadFor(row);

  return {
    id: row.id,
    kind: row.kind,
    publicationStatus: row.publicationStatus,
    truthTier: truthTierFor(row.kind, row.publicationStatus),
    origin: row.origin,
    provenance: {
      modelId: row.provenance?.modelId ?? null,
      promptVersion: row.provenance?.promptVersion ?? null,
      generatedAt: row.provenance?.generatedAt ?? row.createdAt,
      groundingChunkIds: [...row.groundingChunkIds],
    },
    revision: row.revision,
    payload,
    validation,
  };
}

/** The validation subject of a row, gathered from the payload it already carries. */
function subjectFor(row: ReviewArtifactRow): ValidationSubject {
  const values = row.payload;
  const siblingQuotes = row.siblingQuotes;
  const own = typeof values['verbatimText'] === 'string' ? values['verbatimText'] : null;
  const overlap =
    own !== null &&
    siblingQuotes.filter((quote) => normalize(quote) === normalize(own)).length > 1;

  return {
    kind: row.kind,
    citedChunkId: row.citedChunkId,
    citedChunkText: row.citedChunkText,
    groundingChunkIds: row.groundingChunkIds,
    verbatimText: typeof values['verbatimText'] === 'string' ? values['verbatimText'] : null,
    criteriaText: typeof values['criteriaText'] === 'string' ? values['criteriaText'] : null,
    weightPercent: typeof values['weightPercent'] === 'number' ? values['weightPercent'] : null,
    checklistTitle:
      typeof values['title'] === 'string' && row.kind === 'checklist_item' ? values['title'] : null,
    overlapsWithSibling: overlap,
  };
}

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * The `payload` union member for the row's kind.
 *
 * The stored payload is already the row's own columns; `06` section 5.5.8's payload types are those
 * columns minus the lifecycle fields. The `structure` kind has no payload type in the union, so the
 * response carries the two structural fields the review screen shows -- typed through the same
 * `ReviewArtifactPayload` union by widening to a `Record`, which is what the union's own `Partial<>`
 * in `StructureArtifactPatchRequest` already permits.
 */
function payloadFor(row: ReviewArtifactRow): ReviewArtifactResponse['payload'] {
  switch (row.kind) {
    case 'requirement_node':
      return {
        title: str(row.payload['title']),
        verbatimText: str(row.payload['verbatimText']),
        mapSummary: nullableStr(row.payload['mapSummary']),
        sourceChunkId: str(row.payload['sourceChunkId']),
        sourcePage: nullableNum(row.payload['sourcePage']),
        sourceSectionLabel: nullableStr(row.payload['sourceSectionLabel']),
        displayOrder: num(row.payload['displayOrder']),
      };
    case 'rubric_section':
      return {
        sectionLabel: str(row.payload['sectionLabel']),
        criteriaText: str(row.payload['criteriaText']),
        weightPercent: nullableNum(row.payload['weightPercent']),
        pageFrom: nullableNum(row.payload['pageFrom']),
        pageTo: nullableNum(row.payload['pageTo']),
        mapInterpretation: nullableStr(row.payload['mapInterpretation']),
        displayOrder: num(row.payload['displayOrder']),
      };
    case 'milestone':
      return {
        title: str(row.payload['title']),
        summary: nullableStr(row.payload['summary']),
        displayOrder: num(row.payload['displayOrder']),
      };
    case 'checklist_item':
      return {
        title: str(row.payload['title']),
        planningLevel: planningLevel(row.payload['planningLevel']),
        description: nullableStr(row.payload['description']),
        displayOrder: num(row.payload['displayOrder']),
      };
    case 'faq_entry':
      return {
        question: str(row.payload['question']),
        answer: str(row.payload['answer']),
        milestoneId: nullableStr(row.payload['milestoneId']),
        displayOrder: num(row.payload['displayOrder']),
      };
    case 'ai_policy_rule':
      return {
        ruleCode: str(row.payload['ruleCode']),
        ruleText: str(row.payload['ruleText']),
        effect: policyEffect(row.payload['effect']),
        appliesTo: policyAppliesTo(row.payload['appliesTo']),
        displayOrder: num(row.payload['displayOrder']),
      };
    case 'structure':
      // `ReviewArtifactResponse.kind` includes `structure`, so the payload union needs a member for
      // it; Phase 4 added `StructurePayload` (`06` section 5.5.8) rather than inventing a
      // milestone-shaped stand-in. It has no editable field -- `version` and `is_current` are the
      // pipeline's -- so the structure row is approved and published through the assignment-level
      // actions and a PATCH against it is `IMMUTABLE_FIELD`.
      return {
        version: num(row.payload['version']),
        isCurrent: row.payload['isCurrent'] === true,
      };
  }
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function nullableStr(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function num(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return Number(value);
  return 0;
}

function nullableNum(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value !== '' && !Number.isNaN(Number(value))) return Number(value);
  return null;
}

function planningLevel(value: unknown): 'understand' | 'identify' | 'plan' | 'verify' | 'review' | 'note' {
  const levels = ['understand', 'identify', 'plan', 'verify', 'review', 'note'] as const;
  return levels.find((level) => level === value) ?? 'understand';
}

function policyEffect(value: unknown): 'PROHIBIT' | 'ALLOW' | 'ESCALATE_TO_TUTOR' | 'CLARIFY' {
  const effects = ['PROHIBIT', 'ALLOW', 'ESCALATE_TO_TUTOR', 'CLARIFY'] as const;
  return effects.find((effect) => effect === value) ?? 'CLARIFY';
}

function policyAppliesTo(value: unknown): 'assistant' | 'uploads' | 'discussion' | 'all' {
  const targets = ['assistant', 'uploads', 'discussion', 'all'] as const;
  return targets.find((target) => target === value) ?? 'assistant';
}

/** Exported for the route that has to answer "did this approval carry unacknowledged warnings?". */
export function warningCodes(warnings: readonly ValidationWarning[]): ValidationWarning['code'][] {
  return warnings.map((warning) => warning.code);
}
