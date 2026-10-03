/**
 * The tutor's artifact actions: the decision, the write, and the audit row, in one place.
 *
 * **Why not in the route.** Two routes drive the same transitions -- `PATCH
 * /api/tutor/structure-artifacts/{artifactId}` (save / approve / reject with a revision precondition)
 * and `DELETE /api/tutor/structure-artifacts/{artifactId}` (reject, no precondition, because
 * transition 9 has no guard and `06` section 5.4 gives DELETE no `STALE_REVISION`) -- and a third
 * (`POST .../artifacts`) authors new rows. The ordering rules below are claims about the contract, not
 * about HTTP, and a route should be an adapter: parse, guard, call, serialise.
 *
 * **The order of the checks is load-bearing.**
 *
 *   1. the state machine first, so an illegal transition is reported as such and not as a field
 *      error (`06` section 3.2's named refusals);
 *   2. then the payload keys, so an attempted edit of `verbatimText` is `IMMUTABLE_FIELD` (409)
 *      rather than silently dropped;
 *   3. then the AI Usage Policy rule code, because an unmapped assistant-applicable code disables the
 *      Assistant for the whole assignment (trap T22) and that refusal must name the code;
 *   4. then acknowledgement of warnings, which only approval needs (`06` section 5.5.8);
 *   5. and only then the write.
 *
 * **The D53 no-op rule.** `EDITED` "is recorded when and only when the tutor actually modifies
 * content", so a `save` whose payload matches the stored row returns `ok` with the unchanged artifact
 * and writes nothing -- no status change, no revision bump, no audit row. Without this, opening a card
 * and pressing Save on an `APPROVED` artifact would clear its approval stamp and hide it from
 * students.
 *
 * **Every mutating action writes an audit row in the same transaction** (`06` section 3.5 rule 4).
 * The row carries the status transition and the names of the fields that changed -- artifact fields
 * only. `06` section 7.6.5's redaction duty is about student content, document bodies and secrets,
 * none of which passes through this module.
 */

import { randomUUID } from 'node:crypto';

import type { ValidationWarning } from '@/lib/api/types';
import type { ReviewArtifactRow, WriteOutcome } from '@/lib/db/queries/review';
import { applyArtifactTransition, rejectArtifact, findReviewArtifact } from '@/lib/db/queries/review';
import { insertAuditLog } from '@/lib/db/queries/audit';
import type { Executor } from '@/lib/db/queries/courses';
import {
  approvalAllowed,
  derivePlanningLevel,
  payloadChangesAnything,
  refusedPayloadKeys,
} from './artifacts';
import { inferReviewArtifact } from './mappers';
import { checkPolicyRuleCode } from './policy-rules';
import { resolveTransition, type ReviewAction, type StampEffect } from './transitions';

/** The table each kind is stored in, for the audit row's `target_table`. */
const TABLE_BY_KIND: Readonly<Record<ReviewArtifactRow['kind'], string>> = {
  structure: 'assignment_structures',
  requirement_node: 'requirement_nodes',
  rubric_section: 'rubric_sections',
  milestone: 'milestones',
  checklist_item: 'checklist_items',
  faq_entry: 'faq_entries',
  ai_policy_rule: 'ai_policy_rules',
};

export type ActionFailureCode =
  | 'INVALID_STATE_TRANSITION'
  | 'IMMUTABLE_FIELD'
  | 'VALIDATION_FAILED'
  | 'STALE_REVISION'
  | 'NOT_FOUND';

export type ActionOutcome =
  | { readonly ok: true; readonly artifact: ReviewArtifactRow }
  | {
      readonly ok: false;
      readonly code: ActionFailureCode;
      readonly message: string;
      readonly details?: Record<string, unknown>;
    };

export interface TransitionInput {
  readonly artifact: ReviewArtifactRow;
  readonly action: ReviewAction;
  /** The caller's revision precondition. `0` means none (transition 9). */
  readonly expectedRevision: number;
  /**
   * The fields to change. Present with `approve` too, because `06` section 5.5.8's request type
   * carries a payload beside every action: an approve that also carries edits writes the merged
   * content and the approval in one statement. The end state is the same as save-then-approve, and
   * only the end state is authoritative -- the audit row records the transition number it wrote (4 or
   * 5, both of which lead to `APPROVED`).
   */
  readonly payload: Readonly<Record<string, unknown>>;
  readonly acknowledgeWarnings?: readonly ValidationWarning['code'][];
  readonly actorUserId: string;
  readonly requestId: string;
}

/**
 * Apply one tutor transition.
 *
 * Returns the **re-read** row rather than the values it wrote: the response must show the row the
 * database now holds, including the stamps and the revision the write produced. A response built from
 * the request would be the client's intent echoed back, which is how a UI ends up disagreeing with
 * the server about the current state.
 */
export async function applyTutorTransition(
  ex: Executor,
  input: TransitionInput,
): Promise<ActionOutcome> {
  const { artifact, action } = input;

  const transition = resolveTransition(artifact.publicationStatus, action);
  if (!transition.ok) {
    return { ok: false, code: transition.code, message: transition.message };
  }

  if (action === 'reject' && Object.keys(input.payload).length > 0) {
    return {
      ok: false,
      code: 'VALIDATION_FAILED',
      message: 'A reject carries no edits. Send the change separately, or send no payload.',
      details: { fields: Object.keys(input.payload) },
    };
  }

  const refused = refusedPayloadKeys(artifact.kind, input.payload);
  if (refused.length > 0) {
    return {
      ok: false,
      code: 'IMMUTABLE_FIELD',
      message: `These fields cannot be changed on a ${artifact.kind}: ${refused.join(', ')}.`,
      details: { fields: refused },
    };
  }

  // A checklist item's planning level follows from its wording, never from the client
  // (`06` section 7.2.10 rule 2; see `artifacts.ts`'s header).
  const merged: Record<string, unknown> = { ...artifact.payload, ...definedOnly(input.payload) };
  if (artifact.kind === 'checklist_item' && typeof merged['title'] === 'string') {
    const derived = derivePlanningLevel(merged['title']);
    if (derived !== null) merged['planningLevel'] = derived;
  }

  if (artifact.kind === 'ai_policy_rule' && action !== 'reject') {
    const code = typeof merged['ruleCode'] === 'string' ? merged['ruleCode'] : '';
    const appliesTo = typeof merged['appliesTo'] === 'string' ? merged['appliesTo'] : '';
    const check = checkPolicyRuleCode(code, appliesTo);
    if (!check.ok) {
      return {
        ok: false,
        code: 'VALIDATION_FAILED',
        message: check.message ?? 'That AI Usage Policy rule code cannot be used.',
        details: { ruleCode: code, appliesTo },
      };
    }
  }

  const mergedRow: ReviewArtifactRow = { ...artifact, payload: merged };

  if (action === 'approve') {
    const warnings = inferReviewArtifact(mergedRow).validation.warnings;
    const allowed = approvalAllowed(warnings, input.acknowledgeWarnings);
    if (!allowed.ok) {
      return {
        ok: false,
        code: 'VALIDATION_FAILED',
        message: allowed.blocking.some((warning) => warning.code === 'VERBATIM_MISMATCH')
          ? 'A quoted requirement that is not a passage of the source cannot be acknowledged. Fix it or reject the artifact.'
          : 'Acknowledge every validation warning before approving.',
        details: { blocking: allowed.blocking.map((warning) => warning.code) },
      };
    }
  }

  // D53: a save that changes nothing is not an edit. `EDITED` is recorded only for real changes, so
  // this must not move an APPROVED or PUBLISHED row (transition 6/8 would clear its stamps).
  const changed = action === 'reject' ? false : payloadChangesAnything(artifact.payload, merged);
  if (action === 'save' && !changed) {
    return { ok: true, artifact };
  }

  const write = await writeFor(ex, input, merged, changed);
  if (write !== 'ok') {
    return outcomeToFailure(write, input);
  }

  await insertAuditLog(ex, {
    id: randomUUID(),
    actorUserId: input.actorUserId,
    actorRole: 'tutor',
    action:
      action === 'approve'
        ? 'artifact.approved'
        : action === 'reject'
          ? 'artifact.rejected'
          : 'artifact.edited',
    targetTable: TABLE_BY_KIND[artifact.kind],
    targetId: artifact.id,
    before: { publicationStatus: artifact.publicationStatus, revision: artifact.revision },
    after: {
      publicationStatus: transition.to,
      revision: artifact.revision + 1,
      transition: transition.transition,
      ...(changed ? { changedFields: changedFields(artifact.payload, merged) } : {}),
    },
    requestId: input.requestId,
  });

  const updated = await findReviewArtifact(ex, artifact.id);
  if (updated === null) {
    return { ok: false, code: 'NOT_FOUND', message: 'The artifact disappeared during the write.' };
  }
  return { ok: true, artifact: updated };
}

/**
 * Reject one artifact with no revision precondition (transition 9 via `DELETE`, `06` section 5.4).
 *
 * The state machine still runs: a published artifact cannot be rejected, and a rejected one is
 * terminal. Only the optimistic-concurrency check is absent, because the contract's DELETE failure
 * codes do not include `STALE_REVISION`.
 */
export async function rejectWithoutPrecondition(
  ex: Executor,
  input: {
    readonly artifact: ReviewArtifactRow;
    readonly actorUserId: string;
    readonly requestId: string;
  },
): Promise<ActionOutcome> {
  const transition = resolveTransition(input.artifact.publicationStatus, 'reject');
  if (!transition.ok) {
    return { ok: false, code: transition.code, message: transition.message };
  }

  const write = await rejectArtifact(ex, {
    artifact: input.artifact,
    expectedRevision: 0,
    actorUserId: input.actorUserId,
    effects: transition.effects,
  });
  if (write !== 'ok') {
    return outcomeToFailure(write, {
      artifact: input.artifact,
      action: 'reject',
      expectedRevision: 0,
      payload: {},
      actorUserId: input.actorUserId,
      requestId: input.requestId,
    });
  }

  await insertAuditLog(ex, {
    id: randomUUID(),
    actorUserId: input.actorUserId,
    actorRole: 'tutor',
    action: 'artifact.rejected',
    targetTable: TABLE_BY_KIND[input.artifact.kind],
    targetId: input.artifact.id,
    before: {
      publicationStatus: input.artifact.publicationStatus,
      revision: input.artifact.revision,
    },
    after: {
      publicationStatus: 'REJECTED',
      revision: input.artifact.revision + 1,
      transition: transition.transition,
    },
    requestId: input.requestId,
  });

  const updated = await findReviewArtifact(ex, input.artifact.id);
  if (updated === null) {
    return { ok: false, code: 'NOT_FOUND', message: 'The artifact disappeared during the write.' };
  }
  return { ok: true, artifact: updated };
}

async function writeFor(
  ex: Executor,
  input: TransitionInput,
  merged: Record<string, unknown>,
  changed: boolean,
): Promise<WriteOutcome> {
  const effects = effectsFor(input);
  if (input.action === 'reject') {
    return rejectArtifact(ex, {
      artifact: input.artifact,
      expectedRevision: input.expectedRevision,
      actorUserId: input.actorUserId,
      effects,
    });
  }
  return applyArtifactTransition(ex, {
    artifact: input.artifact,
    expectedRevision: input.expectedRevision,
    nextStatus: nextStatusFor(input),
    effects,
    actorUserId: input.actorUserId,
    patch: changed ? merged : {},
  });
}

function effectsFor(input: TransitionInput): StampEffect {
  const resolved = resolveTransition(input.artifact.publicationStatus, input.action);
  // `applyTutorTransition` already refused an illegal transition, so this cannot fail; the fallback
  // exists so the type is honest rather than because it is reachable.
  return resolved.ok
    ? resolved.effects
    : { setApproval: false, clearApproval: false, setPublished: false, clearPublished: false };
}

function nextStatusFor(input: TransitionInput): ReviewArtifactRow['publicationStatus'] {
  const resolved = resolveTransition(input.artifact.publicationStatus, input.action);
  return resolved.ok ? resolved.to : input.artifact.publicationStatus;
}

function outcomeToFailure(outcome: WriteOutcome, input: TransitionInput): ActionOutcome {
  switch (outcome) {
    case 'stale':
      return {
        ok: false,
        code: 'STALE_REVISION',
        message: 'Another tutor changed this item while you were editing.',
        details: { expectedRevision: input.expectedRevision, currentRevision: input.artifact.revision },
      };
    case 'missing':
      return { ok: false, code: 'NOT_FOUND', message: 'That artifact could not be found.' };
    case 'ok':
      // Unreachable: callers only pass a non-`ok` outcome here.
      return { ok: true, artifact: input.artifact };
  }
}

function definedOnly(patch: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/** The names of the payload fields whose value differs, for the audit row. */
function changedFields(
  before: Readonly<Record<string, unknown>>,
  after: Readonly<Record<string, unknown>>,
): string[] {
  return Object.keys(after).filter((key) => {
    const a = before[key];
    const b = after[key];
    if (typeof a === 'number' || typeof a === 'string') {
      if (typeof b === 'number' || typeof b === 'string') return String(a) !== String(b);
    }
    return a !== b;
  });
}
