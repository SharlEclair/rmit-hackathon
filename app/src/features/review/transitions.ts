/**
 * The approval state machine (`06` section 3.2; D22, D53).
 *
 * **Why this is one module with no database in it.** D22 makes the approval boundary a state machine
 * rather than a convention, and C3/I2 are the constraints the product is judged on. A rule that
 * lives in each route handler is a rule that can be forgotten in one of them; a rule that lives here
 * is testable without a request, a session or a database, and every route asks this module instead
 * of deciding for itself.
 *
 * **The ten transitions of `06` section 3.2, and who may perform each.**
 *
 * ```text
 *  1  -                     -> AI_GENERATED   system  (the Analyst writes an artifact)
 *  2  AI_GENERATED          -> NEEDS_REVIEW   system  (the ingestion run finishes)
 *  3  NEEDS_REVIEW          -> EDITED         tutor   (a PATCH that changes content)
 *  4  NEEDS_REVIEW          -> APPROVED       tutor   (approve without editing -- D53)
 *  5  EDITED                -> APPROVED       tutor
 *  6  APPROVED              -> EDITED         tutor   (a PATCH after approval)
 *  7  APPROVED              -> PUBLISHED      tutor   (publish, bulk)
 *  8  PUBLISHED             -> EDITED         tutor   (a PATCH after publish)
 *  9  AI_GENERATED/NEEDS_REVIEW/EDITED/APPROVED -> REJECTED   tutor
 * 10  REJECTED              -> (nothing)      --      `REJECTED` is terminal for that row
 * ```
 *
 * Transitions 1 and 2 are the ingestion pipeline's and live in `src/lib/db/queries/structure.ts`
 * (`promoteStructureToNeedsReview`), not here: this module is the **tutor's** half of the machine.
 *
 * **Everything else is refused with `INVALID_STATE_TRANSITION`.** The two the specification calls
 * out by name are worth restating because they are the ones an implementation is tempted to allow:
 *
 *   - `AI_GENERATED -> APPROVED` is not a transition. `06` section 3.2: "the tutor must see it in
 *     the review queue first". A `save` on an `AI_GENERATED` row is refused for the same reason:
 *     the row is not in the review queue yet, so a tutor cannot be editing it.
 *   - nothing reaches `PUBLISHED` except from `APPROVED`. `PUBLISHED` is the only student-visible
 *     status (`06` section 3.1, gate rule G1) and publish subsumes approval, so the approval stamps
 *     are still required on the published row (the `ck_*_approval` CHECKs).
 *
 * **Readings this module had to take, recorded rather than implied.**
 *
 * 1. **A repeated `save` on an `EDITED` row stays `EDITED`.** Table row 3 names
 *    `NEEDS_REVIEW -> EDITED`; a second edit of an `EDITED` artifact is the same transition to the
 *    same state, and refusing it would make the second save of an editing session fail. No row of
 *    the table is contradicted: no *other* transition is being permitted.
 * 2. **A `save` that changes nothing is a no-op, and it is the caller's job to detect it.** D53 says
 *    `EDITED` "is recorded when and only when the tutor actually modifies content", so a PATCH whose
 *    payload equals the stored row must not move status or bump the revision. The comparison is not
 *    made here -- this module has no access to the stored row -- so the query layer decides and calls
 *    `resolveTransition` only for a real change. A PATCH against an `APPROVED` row that changes
 *    nothing therefore does **not** clear the approval stamp.
 * 3. **Leaving `APPROVED` or `PUBLISHED` clears the approval stamp, and clearing is mandatory for
 *    `approved_at`.** The `ck_*_approved_at` CHECK is `approved_at is null or publication_status in
 *    ('APPROVED','PUBLISHED')`, so a row that keeps `approved_at` while moving to `EDITED` or
 *    `REJECTED` violates the schema rather than merely misreporting. `approved_by_user_id` is cleared
 *    with it so the pair never disagrees.
 * 4. **Leaving `PUBLISHED` also clears `published_at`.** No CHECK forces this (the constraint is
 *    one-way), so it is a deliberate reading: a row that says `EDITED` while carrying a
 *    `published_at` claims in its own columns to be published. The audit row that every mutating
 *    tutor action writes (`06` section 3.5 rule 4) preserves the fact that it was published, which is
 *    where that history belongs.
 * 5. **`REJECTED` is terminal, so `REJECTED -> REJECTED` is refused.** Transition 10 re-adds content
 *    as a **new row**; there is no un-reject, and `06` section 3.7 keeps the row as evidence.
 */

import type { PublicationStatus } from '@/lib/db/queries/structure';

export type { PublicationStatus };

/** The seven artifact kinds of `06` section 5.5.8's `ReviewArtifactResponse.kind`. */
export type ArtifactKind =
  | 'structure'
  | 'requirement_node'
  | 'rubric_section'
  | 'milestone'
  | 'checklist_item'
  | 'faq_entry'
  | 'ai_policy_rule';

/** The tutor actions the review surface can take on one artifact, plus the assignment-level publish. */
export type ReviewAction = 'save' | 'approve' | 'reject' | 'publish';

/**
 * What a transition does to the three stamp columns.
 *
 * Exported because the query layer must set exactly these and nothing more: a writer that recomputes
 * "does this status need an approval stamp?" from the status alone gets transition 6 wrong, which is
 * the one transition that *removes* a stamp rather than adding one.
 */
export interface StampEffect {
  /** Set `approved_by_user_id` and `approved_at` to the acting tutor and now. */
  readonly setApproval: boolean;
  /** Null `approved_by_user_id` and `approved_at`. Mandatory when leaving APPROVED/PUBLISHED. */
  readonly clearApproval: boolean;
  /** Set `published_at` to now. */
  readonly setPublished: boolean;
  /** Null `published_at`. */
  readonly clearPublished: boolean;
}

export interface PermittedTransition {
  readonly ok: true;
  /** The transition number in `06` section 3.2, so an audit row and a test can cite it. */
  readonly transition: number;
  readonly from: PublicationStatus;
  readonly to: PublicationStatus;
  readonly effects: StampEffect;
}

export interface RefusedTransition {
  readonly ok: false;
  readonly code: 'INVALID_STATE_TRANSITION';
  readonly from: PublicationStatus;
  readonly action: ReviewAction;
  /** A sentence safe to show a tutor, naming the attempted transition (`11` WP-06's acceptance). */
  readonly message: string;
}

export type TransitionResult = PermittedTransition | RefusedTransition;

const NO_EFFECT: StampEffect = {
  setApproval: false,
  clearApproval: false,
  setPublished: false,
  clearPublished: false,
};

const APPROVE_EFFECT: StampEffect = { ...NO_EFFECT, setApproval: true };

/**
 * Every permitted transition, in the order `06` section 3.2 lists it.
 *
 * A flat table rather than a switch: a test can enumerate it, and a reviewer can diff it against the
 * specification row by row. `PUBLISHED -> EDITED` is the only entry that clears `published_at`.
 */
const TABLE: readonly PermittedTransition[] = [
  {
    ok: true,
    transition: 3,
    from: 'NEEDS_REVIEW',
    to: 'EDITED',
    effects: NO_EFFECT,
  },
  {
    ok: true,
    transition: 3,
    from: 'EDITED',
    to: 'EDITED',
    effects: NO_EFFECT,
  },
  {
    ok: true,
    transition: 4,
    from: 'NEEDS_REVIEW',
    to: 'APPROVED',
    effects: APPROVE_EFFECT,
  },
  {
    ok: true,
    transition: 5,
    from: 'EDITED',
    to: 'APPROVED',
    effects: APPROVE_EFFECT,
  },
  {
    ok: true,
    transition: 6,
    from: 'APPROVED',
    to: 'EDITED',
    effects: { ...NO_EFFECT, clearApproval: true },
  },
  {
    ok: true,
    transition: 8,
    from: 'PUBLISHED',
    to: 'EDITED',
    effects: { ...NO_EFFECT, clearApproval: true, clearPublished: true },
  },
  {
    ok: true,
    transition: 9,
    from: 'AI_GENERATED',
    to: 'REJECTED',
    effects: NO_EFFECT,
  },
  {
    ok: true,
    transition: 9,
    from: 'NEEDS_REVIEW',
    to: 'REJECTED',
    effects: NO_EFFECT,
  },
  {
    ok: true,
    transition: 9,
    from: 'EDITED',
    to: 'REJECTED',
    effects: NO_EFFECT,
  },
  {
    ok: true,
    transition: 9,
    from: 'APPROVED',
    to: 'REJECTED',
    effects: { ...NO_EFFECT, clearApproval: true },
  },
] as const;

/**
 * `publish` is not in `TABLE`, because its "from" is a set rather than a single status and the action
 * applies to many rows at once. Transition 7 is `APPROVED -> PUBLISHED` and nothing else.
 */
function publishTransition(from: PublicationStatus): PermittedTransition | RefusedTransition {
  if (from !== 'APPROVED') {
    return refuse(from, 'publish', 'Only an approved artifact can be published.');
  }
  return {
    ok: true,
    transition: 7,
    from,
    to: 'PUBLISHED',
    effects: { ...NO_EFFECT, setPublished: true },
  };
}

function refuse(
  from: PublicationStatus,
  action: ReviewAction,
  reason: string,
): RefusedTransition {
  return {
    ok: false,
    code: 'INVALID_STATE_TRANSITION',
    from,
    action,
    message: `Cannot ${action} an artifact in ${from}: ${reason}`,
  };
}

/**
 * The one public decision function. Never throws: an illegal transition is a value, so a caller
 * cannot accidentally treat an exception as a pass.
 */
export function resolveTransition(
  from: PublicationStatus,
  action: ReviewAction,
): TransitionResult {
  if (action === 'publish') return publishTransition(from);

  const permitted = TABLE.find((row) => row.from === from && actionMatches(row, action));
  if (permitted !== undefined) return permitted;

  return refuse(from, action, explainRefusal(from, action));
}

/** Why a transition is refused, in the tutor's words. Kept apart from the decision itself. */
function explainRefusal(from: PublicationStatus, action: ReviewAction): string {
  if (from === 'AI_GENERATED') {
    return 'it has not reached the review queue yet.';
  }
  if (from === 'REJECTED') {
    return 'it has been rejected. Add a new artifact instead.';
  }
  if (from === 'PUBLISHED' && action === 'reject') {
    // Transition 9 lists PUBLISHED nowhere, and transition 8 is the withdrawal path: an edit takes
    // the artifact out of student-visible reads until it is re-approved. Deleting it instead would
    // throw away the published state the audit trail exists to record.
    return 'a published artifact cannot be rejected. Edit it, which withdraws it from students until it is re-approved.';
  }
  // The only remaining case is an already-approved artifact asked to be approved again. Asking the
  // database for the same state would write a second audit row and a second revision bump for no
  // change, which is why this is a refusal rather than a no-op.
  return 'it is already approved.';
}

/**
 * Does the table row implement this action?
 *
 * The table stores `from`/`to` and not the action, because `06` section 3.2's own action column is
 * "any editable-field PATCH" / "Approve" / "Reject". The mapping is by target: the only two targets a
 * tutor action can produce from the table are `APPROVED` (approve), `EDITED` (save) and `REJECTED`
 * (reject). `publish` is handled above.
 */
function actionMatches(row: PermittedTransition, action: ReviewAction): boolean {
  switch (action) {
    case 'save':
      return row.to === 'EDITED';
    case 'approve':
      return row.to === 'APPROVED';
    case 'reject':
      return row.to === 'REJECTED';
    case 'publish':
      return false;
  }
}

/** Every permitted transition, for tests and for the review screen's own explanation. */
export function permittedTransitions(): readonly PermittedTransition[] {
  return TABLE;
}

/**
 * The **single** student-visibility rule: `PUBLISHED` and nothing else.
 *
 * `06` section 3.1 marks `APPROVED` student-invisible and section 3.4 (gate rule G1) requires
 * `PUBLISHED`; D21 says only the `APPROVED -> PUBLISHED` transition is student-visible. Handoff issue
 * **I-21** records the tension this settles: an earlier gate text treated `APPROVED` as the threshold.
 * There is exactly one threshold, it is this one, and a second rule must not appear anywhere (D99).
 *
 * This function is a convenience for a UI label. The **enforcement** is the SQL predicate in
 * `src/lib/db/queries/student-visibility.ts`, because T3 requires the gate to be in the query layer --
 * a view-layer filter returns an empty shell, and G1 requires `NOT_FOUND` instead.
 */
export function isStudentVisible(status: PublicationStatus): boolean {
  return status === 'PUBLISHED';
}

/** The statuses `POST .../approve` (all) may act on, per `06` section 5.4. */
export const APPROVABLE_STATUSES: readonly PublicationStatus[] = ['NEEDS_REVIEW', 'EDITED'];

/** The status that publish requires, per transition 7. */
export const PUBLISHABLE_STATUS: PublicationStatus = 'APPROVED';
