/**
 * FAQ management: `06-DATA-MODEL.md` sections 5.5.3 and 7.4.4, `07-UI-UX-SPEC` section 5.5.
 *
 * **`PUBLISHED` is the one student-visible status (D99), and this module never decides visibility.** It
 * builds responses for whichever read the caller chose, and the reads are the gate: a student route calls
 * `listPublishedFaqEntries` (filtered in SQL) and a tutor route calls `listAllFaqEntries` (unfiltered).
 * There is deliberately no `buildFaqResponse(entries, { isTutor })`, because that would move "may this
 * student see an unpublished entry" from the query layer, where `student-visibility.ts` enforces it, into
 * a boolean at the call site.
 *
 * **Approving and publishing are separate, and neither is implied by the other.** `06` section 7.4.4 makes
 * `publication_status` the single visibility rule; `AI_GENERATED -> NEEDS_REVIEW -> APPROVED -> PUBLISHED`
 * is the chain (`06` section 3.1), and `APPROVED` is still invisible to students. So `PUBLISHED` is the
 * only status this module's writes stamp, and a withdraw clears `published_at` rather than leaving a
 * timestamp behind.
 */

import { randomUUID } from 'node:crypto';

import type { FaqEntryResponse } from '@/lib/api/types';
import type { Executor } from '@/lib/db/queries/courses';
import {
  findFaqEntry,
  insertTutorFaqEntry,
  listAllFaqEntries,
  readNextDisplayOrder,
  updateFaqEntry,
  type FaqEntryRow,
} from '@/lib/db/queries/faq';
import { listPublishedFaqEntries } from '@/lib/db/queries/student-visibility';

/** `06` section 5.6: a FAQ question is 5..500 characters and an answer 1..4000. */
export const FAQ_QUESTION_MIN_CHARS = 5;
export const FAQ_QUESTION_MAX_CHARS = 500;
export const FAQ_ANSWER_MAX_CHARS = 4000;

/**
 * The statuses a tutor write may set.
 *
 * **These are `06` section 3.1's chain, and `WITHDRAWN` is deliberately not among them** because
 * `ck_publication_status` admits only `AI_GENERATED`, `NEEDS_REVIEW`, `EDITED`, `APPROVED`, `PUBLISHED`
 * and `REJECTED`. Taking an entry out of student view is therefore **`REJECTED`**, which is also what the
 * check's vocabulary intends: a published entry that is withdrawn is one the tutor has decided against, and
 * `AI_GENERATED` is unreachable from an edit (D96, an artifact never goes back to being ungenerated).
 */
export type FaqTargetStatus = 'NEEDS_REVIEW' | 'EDITED' | 'APPROVED' | 'PUBLISHED' | 'REJECTED';

export type FaqOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly code: 'NOT_FOUND' | 'VALIDATION_FAILED' | 'INVALID_STATE_TRANSITION' | 'STALE_REVISION';
      readonly message: string;
      readonly details?: Record<string, unknown>;
    };

/**
 * One entry as the response presents it.
 *
 * `isPublished` is derived from `publicationStatus` rather than stored, because `06` section 5.5.3 lists
 * both and a derived field cannot disagree with its source. **`APPROVED` yields `isPublished: false`** --
 * the whole point of D99's two-step rule, and the assertion a test should make rather than a comment.
 */
export function faqResponseOf(row: FaqEntryRow): FaqEntryResponse {
  return {
    id: row.id,
    assignmentId: row.assignmentId,
    milestoneId: row.milestoneId,
    question: row.question,
    answer: row.answer,
    sourceKind: row.sourceKind,
    publicationStatus: row.publicationStatus as FaqEntryResponse['publicationStatus'],
    isPublished: row.publicationStatus === 'PUBLISHED',
    displayOrder: row.displayOrder,
    createdAt: row.createdAt,
    publishedAt: row.publishedAt,
    revision: row.revision,
  };
}

// ---------------------------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------------------------

/**
 * The student's FAQ (`06` section 5.5.3's FAQ half).
 *
 * The published-only filter is in the SQL, and it is the **same function the Discussions tab uses** for
 * its `officialFaq`, so the two surfaces cannot drift into showing different sets.
 */
export async function buildStudentFaq(
  ex: Executor,
  assignmentId: string,
): Promise<FaqEntryResponse[]> {
  const rows = await listPublishedFaqEntries(ex, assignmentId);
  return rows.map((row) => ({
    id: row.id,
    // `listPublishedFaqEntries` returns the fields the student surfaces need and not the assignment id,
    // which the caller already knows. `isPublished` is a fact about the read.
    assignmentId,
    milestoneId: row.milestoneId,
    question: row.question,
    answer: row.answer,
    sourceKind: 'tutor_authored',
    publicationStatus: 'PUBLISHED',
    isPublished: true,
    displayOrder: row.displayOrder,
    createdAt: '',
    publishedAt: null,
    revision: 1,
  }));
}

/** The tutor's FAQ screen: **every** entry, whatever its status. */
export async function buildTutorFaq(
  ex: Executor,
  assignmentId: string,
): Promise<FaqEntryResponse[]> {
  const rows = await listAllFaqEntries(ex, assignmentId);
  return rows.map(faqResponseOf);
}

// ---------------------------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------------------------

/** The assignment an entry belongs to, for the route's gate. `null` is `NOT_FOUND`. */
export async function resolveFaqAssignment(
  ex: Executor,
  entryId: string,
): Promise<string | null> {
  const entry = await findFaqEntry(ex, entryId);
  return entry?.assignmentId ?? null;
}

/**
 * A tutor writes a new FAQ entry by hand.
 *
 * **It starts `NEEDS_REVIEW` and never `PUBLISHED`.** A hand-written answer is still content the cohort
 * has not seen, so `06` section 3.1's chain applies to it exactly as it does to an AI candidate; the
 * separate `PUBLISHED` write is the tutor's second, deliberate act. That is C3's rule read through D99:
 * nothing becomes student-facing until a tutor approves **and** publishes it.
 */
export async function authorFaqEntry(
  ex: Executor,
  input: {
    readonly assignmentId: string;
    readonly milestoneId: string | null;
    readonly question: string;
    readonly answer: string;
    readonly now: Date;
  },
): Promise<FaqOutcome<FaqEntryResponse>> {
  const question = input.question.trim();
  const answer = input.answer.trim();

  if (question.length < FAQ_QUESTION_MIN_CHARS || question.length > FAQ_QUESTION_MAX_CHARS) {
    return {
      ok: false,
      code: 'VALIDATION_FAILED',
      message: `A FAQ question must be between ${String(FAQ_QUESTION_MIN_CHARS)} and ${String(FAQ_QUESTION_MAX_CHARS)} characters.`,
      details: { fields: ['question'] },
    };
  }
  if (answer.length === 0 || answer.length > FAQ_ANSWER_MAX_CHARS) {
    return {
      ok: false,
      code: 'VALIDATION_FAILED',
      message: `A FAQ answer must be between 1 and ${String(FAQ_ANSWER_MAX_CHARS)} characters.`,
      details: { fields: ['answer'] },
    };
  }

  const entryId = randomUUID();
  const created = await insertTutorFaqEntry(ex, {
    id: entryId,
    assignmentId: input.assignmentId,
    milestoneId: input.milestoneId,
    question,
    answer,
    displayOrder: await readNextDisplayOrder(ex, input.assignmentId),
    publicationStatus: 'NEEDS_REVIEW',
    now: input.now,
  });
  if (!created) {
    return { ok: false, code: 'INVALID_STATE_TRANSITION', message: 'That entry already exists.' };
  }

  const row = await findFaqEntry(ex, entryId);
  if (row === null) {
    return { ok: false, code: 'NOT_FOUND', message: 'The entry could not be read back.' };
  }
  return { ok: true, value: faqResponseOf(row) };
}

/**
 * A tutor edits an entry and/or moves its publication status.
 *
 * **The `revision` guard is the contract, not a nicety.** `0012` added `faq_entries.revision` and D98
 * established optimistic concurrency for tutor writes; a mismatch is `STALE_REVISION` so a second tutor's
 * edit is reported rather than silently overwriting the first. The check is inside the `update`'s WHERE
 * clause, so two concurrent edits cannot both pass a read-then-write check.
 *
 * **A published entry may be rejected, and rejecting clears the publication stamps.** `07` section 5.4
 * requires a published reply's entry to leave student view when the reply is edited, and the same
 * transition serves a tutor withdrawing an entry directly. Clearing `published_at` matters because a
 * student-facing query that checked only the timestamp would otherwise still show it; the approval stamp
 * is cleared with it, because `ck_faq_entries_approved_at` permits `approved_at` only on `APPROVED` or
 * `PUBLISHED`.
 */
export async function editFaqEntry(
  ex: Executor,
  input: {
    readonly entryId: string;
    readonly expectedRevision: number;
    readonly question: string;
    readonly answer: string;
    readonly targetStatus: FaqTargetStatus;
    readonly tutorUserId: string;
    readonly now: Date;
  },
): Promise<FaqOutcome<FaqEntryResponse>> {
  const question = input.question.trim();
  const answer = input.answer.trim();

  if (question.length < FAQ_QUESTION_MIN_CHARS || question.length > FAQ_QUESTION_MAX_CHARS) {
    return {
      ok: false,
      code: 'VALIDATION_FAILED',
      message: `A FAQ question must be between ${String(FAQ_QUESTION_MIN_CHARS)} and ${String(FAQ_QUESTION_MAX_CHARS)} characters.`,
      details: { fields: ['question'] },
    };
  }
  if (answer.length === 0 || answer.length > FAQ_ANSWER_MAX_CHARS) {
    return {
      ok: false,
      code: 'VALIDATION_FAILED',
      message: `A FAQ answer must be between 1 and ${String(FAQ_ANSWER_MAX_CHARS)} characters.`,
      details: { fields: ['answer'] },
    };
  }

  const existing = await findFaqEntry(ex, input.entryId);
  if (existing === null) {
    return { ok: false, code: 'NOT_FOUND', message: 'That FAQ entry could not be found.' };
  }
  if (existing.revision !== input.expectedRevision) {
    return {
      ok: false,
      code: 'STALE_REVISION',
      message: 'Another tutor saved this entry first. Reload it before saving.',
      details: { expected: existing.revision, received: input.expectedRevision },
    };
  }

  const updated = await updateFaqEntry(ex, {
    entryId: input.entryId,
    expectedRevision: input.expectedRevision,
    question,
    answer,
    publicationStatus: input.targetStatus,
    tutorUserId: input.tutorUserId,
    now: input.now,
  });
  if (updated === null) {
    // The WHERE clause's `revision = expected` failed between the read and the write, which is the same
    // conflict reported as the same code -- a caller cannot act differently on the two moments.
    return {
      ok: false,
      code: 'STALE_REVISION',
      message: 'Another tutor saved this entry first. Reload it before saving.',
    };
  }
  return { ok: true, value: faqResponseOf(updated) };
}
