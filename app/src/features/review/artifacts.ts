/**
 * The review surface's pure layer: what is editable, what is not, what a validation warning means,
 * and what counts as a change (`06` section 5.5.8, 7.2.5-7.2.11, 7.4.4).
 *
 * **Why the validation is recomputed rather than stored.** `06` section 5.5.8 computes
 * `ReviewArtifactResponse.validation` at read time, and Phase 2 built
 * `src/features/ingest/prompt-constraints.ts` for exactly this: its header says "Phase 4's review
 * route recomputes the same warnings at read time with these functions, because `06` section 5.5.8
 * computes `ReviewArtifactResponse.validation` rather than storing it". A stored warning would go
 * stale the moment a tutor edits the field it was about -- the warning is a function of the text.
 *
 * **Why the immutability is here and not in a route.** `IMMUTABLE_FIELD` (409) is in
 * `PATCH /api/tutor/structure-artifacts/{artifactId}`'s failure list (`06` section 5.4). The two
 * genuinely immutable artifact fields are the ones that carry T1 authority:
 * `requirement_nodes.verbatim_text` and `rubric_sections.criteria_text` (`06` sections 7.2.5, 7.2.6,
 * both marked "immutable after insert"). A paraphrase of the brief presented as the brief is C2's
 * failure mode, so the protection is a rejection, not a UI hint: the field is absent from the
 * editable set, and a payload that carries it is refused with the field named.
 *
 * **Why `planningLevel` is derived and not accepted.** `06` section 7.2.10 rule 2 restricts a
 * Checklist item's wording to six planning verbs and rejects implementation imperatives. The level
 * therefore follows from the title; a client that sends a level disagreeing with its own title would
 * otherwise be able to store an item whose wording says "Implement..." while its level says
 * "understand". That is the D20 failure the constraint exists to catch, so the title wins and the
 * level is recomputed on every save.
 */

import type {
  AiPolicyRulePayload,
  ChecklistItemPayload,
  FaqEntryPayload,
  MilestonePayload,
  RequirementNodePayload,
  ReviewArtifactKind,
  RubricSectionPayload,
  TruthTierApi,
  ValidationWarning,
} from '@/lib/api/types';
import type { PublicationStatus } from '@/lib/db/queries/structure';
import {
  UNGROUNDED_ARTIFACT,
  checkChecklistItem,
  isVerbatimSubstring,
  weightAppearsInText,
} from '@/features/ingest/prompt-constraints';

/**
 * `06` section 5.5.8's union contains an `artifact` kind per table plus `structure`. The wire field
 * is `kind`, so the local name matches the API rather than the table.
 */
export type ArtifactKind = ReviewArtifactKind;

/**
 * The field names a PATCH payload may carry per kind, and the ones it may not.
 *
 * The immutable entries are the T1 verbatim fields (`06` sections 7.2.5, 7.2.6). `structure` has no
 * editable field at all: its `version`, `is_current` and `publication_status` are the pipeline's and
 * the state machine's, so every field of it is immutable from the review surface's point of view.
 */
export const EDITABLE_FIELDS: Readonly<Record<ArtifactKind, readonly string[]>> = {
  structure: [],
  requirement_node: [
    'title',
    'mapSummary',
    'sourcePage',
    'sourceSectionLabel',
    'displayOrder',
  ],
  rubric_section: ['sectionLabel', 'weightPercent', 'pageFrom', 'pageTo', 'mapInterpretation', 'displayOrder'],
  milestone: ['title', 'summary', 'displayOrder'],
  checklist_item: ['title', 'description', 'displayOrder'],
  faq_entry: ['question', 'answer', 'milestoneId', 'displayOrder'],
  ai_policy_rule: ['ruleCode', 'ruleText', 'effect', 'appliesTo', 'displayOrder'],
};

export const IMMUTABLE_FIELDS: Readonly<Record<ArtifactKind, readonly string[]>> = {
  structure: [],
  // `sourceChunkId` is the citation itself: changing it would re-point the quote at another passage.
  requirement_node: ['verbatimText', 'sourceChunkId'],
  // `sourceChunkId` and `criteriaText` are the T1 pair of `06` section 7.2.6.
  rubric_section: ['criteriaText', 'sourceChunkId'],
  milestone: [],
  checklist_item: ['milestoneId', 'planningLevel'],
  faq_entry: ['sourceKind'],
  ai_policy_rule: ['sourceChunkId'],
};

/**
 * The payload keys present that the kind may not change.
 *
 * A key that is neither editable nor immutable (a typo, or a field of another kind) is also
 * refused, and reported the same way -- `IMMUTABLE_FIELD` with the key named. Silently ignoring an
 * unknown key would let a client believe a write happened.
 */
export function refusedPayloadKeys(kind: ArtifactKind, payload: Record<string, unknown>): string[] {
  const unknown = Object.keys(payload).filter(
    (key) => !EDITABLE_FIELDS[kind].includes(key) && !IMMUTABLE_FIELDS[kind].includes(key),
  );
  const immutable = Object.keys(payload).filter((key) => IMMUTABLE_FIELDS[kind].includes(key));
  return [...new Set([...unknown, ...immutable])];
}

/** True when a patch would actually change stored content (D53: `EDITED` only on a real change). */
export function payloadChangesAnything(
  current: Readonly<Record<string, unknown>>,
  payload: Readonly<Record<string, unknown>>,
): boolean {
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) continue;
    if (!sameValue(current[key], value)) return true;
  }
  return false;
}

function sameValue(stored: unknown, sent: unknown): boolean {
  if (stored === sent) return true;
  // A numeric column can arrive as a string (`numeric(5,2)` is returned as `"25.00"`) while a client
  // sends a number -- and a browser form sends `"25"` for the same field. Treating those as a change
  // would move an `APPROVED` artifact to `EDITED` (transition 6), clear its approval stamp and hide
  // it from students, on a save that changed nothing. Only a pair where *both* sides are number-like
  // is compared numerically; a genuine type difference still reaches the write path, where the
  // narrowing helpers refuse it rather than coercing it.
  const a = asFiniteNumber(stored);
  const b = asFiniteNumber(sent);
  if (a !== null && b !== null) return a === b;
  return false;
}

/** A finite number for a number or a numeric string; `null` for everything else. */
function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return null;
}

/**
 * `06` section 2.2's computed tier.
 *
 * The specification gives `requirement_nodes` and `rubric_sections` **two** tiers each (T1 for the
 * verbatim field, T5 for the interpretation field), while `ReviewArtifactResponse.truthTier` is one
 * value per artifact. The reading taken here -- recorded because there is no way to be sure which
 * the spec intends -- is that the artifact reports the tier of the field it is *for*: a requirement
 * node is the verbatim anchor (T1) and the Map summary is an interpretation carried inside it and
 * labelled per field by the UI. Everything else follows section 2.2 verbatim.
 */
export function truthTierFor(kind: ArtifactKind, status: PublicationStatus): TruthTierApi {
  const approved = status === 'APPROVED' || status === 'PUBLISHED';
  switch (kind) {
    case 'requirement_node':
    case 'rubric_section':
      return 'T1';
    case 'milestone':
    case 'checklist_item':
      return approved ? 'T3' : 'T5';
    case 'faq_entry':
    case 'ai_policy_rule':
      return approved ? 'T2' : 'T5';
    case 'structure':
      // The container of the AI proposal; section 2.2 does not list it and D18 makes the Map T5 even
      // after approval.
      return 'T5';
  }
}

/** What the validation pass needs. All of it is already on the row or on the chunk it cites. */
export interface ValidationSubject {
  readonly kind: ArtifactKind;
  /** The cited chunk's verbatim text, or `null` when the artifact cites no chunk at all. */
  readonly citedChunkText: string | null;
  readonly citedChunkId: string | null;
  readonly groundingChunkIds: readonly string[];
  readonly verbatimText?: string | null;
  readonly criteriaText?: string | null;
  readonly weightPercent?: number | null;
  readonly checklistTitle?: string | null;
  /** The quote used by another requirement node in the same structure, for the overlap check. */
  readonly overlapsWithSibling?: boolean;
}

/**
 * `06` section 5.5.8's `validation` object, computed.
 *
 * `VERBATIM_MISMATCH` is the one warning `06` section 5.5.8 makes non-acknowledgable; it is also the
 * only one the ingestion pipeline drops rather than carries, so a row that has it today came from a
 * tutor edit. The check runs on every read for exactly that reason: the stored text is the thing
 * being checked.
 */
export function validationFor(subject: ValidationSubject): {
  ok: boolean;
  warnings: ValidationWarning[];
} {
  const warnings: ValidationWarning[] = [];

  if (subject.verbatimText != null) {
    if (subject.citedChunkText === null || !isVerbatimSubstring(subject.verbatimText, subject.citedChunkText)) {
      warnings.push({
        code: 'VERBATIM_MISMATCH',
        message: 'The quoted requirement is not a passage of the source chunk it cites.',
        ...sourceRefFor(),
      });
    }
  }

  if (subject.criteriaText != null) {
    if (subject.citedChunkText === null || !isVerbatimSubstring(subject.criteriaText, subject.citedChunkText)) {
      warnings.push({
        code: 'VERBATIM_MISMATCH',
        message: 'The marking criterion is not a passage of the source chunk it cites.',
        ...sourceRefFor(),
      });
    }
    if (
      subject.weightPercent != null &&
      (subject.citedChunkText === null || !weightAppearsInText(subject.weightPercent, subject.citedChunkText))
    ) {
      warnings.push({
        code: 'WEIGHT_NOT_FOUND',
        message: `The weighting ${String(subject.weightPercent)} does not appear in the cited criterion text.`,
        ...sourceRefFor(),
      });
    }
  }

  if (subject.checklistTitle != null) {
    for (const warning of checkChecklistItem(subject.checklistTitle).warnings) {
      warnings.push({ code: warning.code, message: warning.message });
    }
  }

  if (subject.overlapsWithSibling === true) {
    warnings.push({
      code: 'OVERLAPPING_REQUIREMENT',
      message: 'Another requirement node quotes the same passage.',
    });
  }

  // `GROUNDING_CHUNK_IDS` is `not null default '{}'` on every artifact table, so "cites nothing" is
  // an empty array rather than a null -- and an artifact with no citation cannot be traced to the
  // documents (C2).
  if (subject.groundingChunkIds.length === 0) {
    warnings.push({ code: UNGROUNDED_ARTIFACT.code, message: UNGROUNDED_ARTIFACT.message });
  }

  return { ok: warnings.length === 0, warnings };
}

function sourceRefFor(): {
  sourceRef?: { sourceId: string; pageFrom: number; pageTo: number };
} {
  // The warning's `sourceRef` names the source row and its page range. This module holds only the
  // chunk text, and the field is optional in `06` section 5.5.8 (`sourceRef?`), so it is omitted
  // rather than filled with a guess. A route that has the source and chunk rows in hand may add it.
  return {};
}

/**
 * Warnings a tutor may acknowledge. Everything except `VERBATIM_MISMATCH` (`06` section 5.5.8: "A
 * `VERBATIM_MISMATCH` cannot be acknowledged: it must be fixed or the node rejected").
 */
export function isAcknowledgable(code: ValidationWarning['code']): boolean {
  return code !== 'VERBATIM_MISMATCH';
}

/**
 * May this artifact be approved, given its warnings and what the caller acknowledged?
 *
 * `06` section 3.2 transition 4's guard is "Provenance intact; validation warnings absent or
 * acknowledged" and `07` section 7.3 rule 4 makes acknowledging each warning the condition. A
 * non-acknowledgable warning blocks regardless of what the caller sends.
 */
export function approvalAllowed(
  warnings: readonly ValidationWarning[],
  acknowledged: readonly ValidationWarning['code'][] | undefined,
): { ok: true } | { ok: false; blocking: ValidationWarning[] } {
  const set = new Set(acknowledged ?? []);
  const blocking = warnings.filter((warning) => !isAcknowledgable(warning.code) || !set.has(warning.code));
  return blocking.length === 0 ? { ok: true } : { ok: false, blocking };
}

/** The payload field default a tutor-authored artifact of each kind starts from. */
export const TUTOR_AUTHORABLE_KINDS: readonly ArtifactKind[] = [
  'milestone',
  'checklist_item',
  'faq_entry',
  'ai_policy_rule',
];

/**
 * The `planning_level` an edited Checklist item's wording implies (`06` section 7.2.10 rule 2).
 *
 * A title whose first word is not one of the six verbs derives `null`; the caller keeps the stored
 * level and surfaces the `CHECKLIST_VERB_MISMATCH` warning rather than storing a level the wording
 * does not support.
 */
export function derivePlanningLevel(title: string): ChecklistItemPayload['planningLevel'] | null {
  return checkChecklistItem(title).planningLevel;
}

/** Type guards so the query layer can narrow a payload without casting. */
export function isRequirementNodePayload(payload: unknown): payload is RequirementNodePayload {
  return typeof payload === 'object' && payload !== null && 'verbatimText' in payload;
}

export function isRubricSectionPayload(payload: unknown): payload is RubricSectionPayload {
  return typeof payload === 'object' && payload !== null && 'criteriaText' in payload;
}

export function isMilestonePayload(payload: unknown): payload is MilestonePayload {
  return typeof payload === 'object' && payload !== null && 'summary' in payload;
}

export function isChecklistItemPayload(payload: unknown): payload is ChecklistItemPayload {
  return typeof payload === 'object' && payload !== null && 'planningLevel' in payload;
}

export function isFaqEntryPayload(payload: unknown): payload is FaqEntryPayload {
  return typeof payload === 'object' && payload !== null && 'question' in payload;
}

export function isAiPolicyRulePayload(payload: unknown): payload is AiPolicyRulePayload {
  return typeof payload === 'object' && payload !== null && 'ruleCode' in payload;
}
