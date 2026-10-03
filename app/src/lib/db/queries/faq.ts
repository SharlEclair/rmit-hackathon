/**
 * FAQ management reads: `06-DATA-MODEL.md` sections 7.4.4 and 5.5.3's FAQ half, `07-UI-UX-SPEC` section 5.5.
 *
 * **The tutor's read and the student's read are different functions on purpose.** A student read is
 * `listPublishedFaqEntries` / `listVisibleFaqEntries` in `student-visibility.ts`, both of which filter
 * `publication_status = 'PUBLISHED'`; this module's list does not filter at all, because a tutor's FAQ
 * screen is the one place an `AI_GENERATED` or `APPROVED` entry must be visible. Putting both on one
 * function with an `isTutor` flag would make gate rule G1 a parameter rather than a property of the call
 * site -- the exact shape `01-STATE.md` section 5 item 4 warns about.
 *
 * **`PUBLISHED` is the only student-visible status (D99).** `APPROVED` stays invisible, so approving and
 * publishing are two distinct transitions here and neither implies the other.
 */

import type { Executor } from '@/lib/db/queries/courses';
import { isoTimestamp } from '@/lib/db/values';

/** `06` section 7.4.4's `faq_entries.source_kind`. */
export type FaqSourceKindRow = 'ai_candidate' | 'query_reply' | 'peer_answer' | 'tutor_authored';

export interface FaqEntryRow {
  readonly id: string;
  readonly assignmentId: string;
  readonly milestoneId: string | null;
  readonly question: string;
  readonly answer: string;
  readonly sourceKind: FaqSourceKindRow;
  readonly publicationStatus: string;
  readonly origin: string;
  readonly displayOrder: number;
  readonly createdAt: string;
  readonly publishedAt: string | null;
  /** The optimistic-concurrency token (`0012`, D98). */
  readonly revision: number;
}

/**
 * The select list, repeated in each read.
 *
 * **Why it is repeated rather than shared.** The `postgres` driver interpolates only tagged-template
 * parameters, so a shared string would have to be spliced in with `unsafe()`, which disables the
 * interpolation safety on the statements that carry the caller's ids. The same reading is in
 * `query-threads.ts`; three repetitions of twelve column names is cheaper than an escape hatch on every
 * read that takes an id.
 */

interface RawFaqRow {
  id: string;
  assignment_id: string;
  milestone_id: string | null;
  question: string;
  answer: string;
  source_kind: string;
  publication_status: string;
  origin: string;
  display_order: number;
  created_at: Date | string;
  published_at: Date | string | null;
  revision: number;
}

function toRow(row: RawFaqRow): FaqEntryRow {
  return {
    id: row.id,
    assignmentId: row.assignment_id,
    milestoneId: row.milestone_id,
    question: row.question,
    answer: row.answer,
    sourceKind: row.source_kind as FaqSourceKindRow,
    publicationStatus: row.publication_status,
    origin: row.origin,
    displayOrder: Number(row.display_order),
    createdAt: isoTimestamp(row.created_at) ?? '',
    publishedAt: isoTimestamp(row.published_at),
    revision: Number(row.revision),
  };
}

/**
 * **Every** entry of an assignment, in display order, whatever its publication status.
 *
 * A tutor-only read. `05` section 9.1.1's review queue and `07` section 5.5's FAQ screen both need the
 * unpublished rows -- the first to review them and the second to approve them -- so this is the one FAQ
 * read that must not filter, and its callers must be tutor routes.
 */
export async function listAllFaqEntries(
  ex: Executor,
  assignmentId: string,
): Promise<FaqEntryRow[]> {
  const rows = await ex<RawFaqRow[]>`
    select f.id,
           f.assignment_id,
           f.milestone_id,
           f.question,
           f.answer,
           f.source_kind,
           f.publication_status,
           f.origin,
           f.display_order,
           f.created_at,
           f.published_at,
           f.revision
      from faq_entries f
     where f.assignment_id = ${assignmentId}::uuid
       and f.deleted_at is null
     order by f.display_order asc, f.created_at asc
  `;
  return rows.map(toRow);
}

/**
 * One entry by id, whatever its status, for a tutor write **before** the gate runs.
 *
 * It returns the assignment id so a route can gate on the entry's own assignment rather than on an id
 * the client sent -- the `guardTutorArtifact` pattern, and the reason a client cannot pair its own
 * assignment with a foreign entry id.
 */
export async function findFaqEntry(
  ex: Executor,
  entryId: string,
): Promise<FaqEntryRow | null> {
  const rows = await ex<RawFaqRow[]>`
    select f.id,
           f.assignment_id,
           f.milestone_id,
           f.question,
           f.answer,
           f.source_kind,
           f.publication_status,
           f.origin,
           f.display_order,
           f.created_at,
           f.published_at,
           f.revision
      from faq_entries f
     where f.id = ${entryId}::uuid
       and f.deleted_at is null
     limit 1
  `;
  const row = rows[0];
  return row === undefined ? null : toRow(row);
}

/**
 * Create a tutor-authored entry.
 *
 * **A tutor-authored entry starts `NEEDS_REVIEW`, not `PUBLISHED`.** `06` section 7.4.4 makes
 * `publication_status` the single visibility rule and `06` section 3.1's machine starts every artifact at
 * `AI_GENERATED` or `NEEDS_REVIEW`; a hand-written entry is still content the cohort has not seen, so it
 * takes the same route to publication as anything else. `origin` is `tutor` and there is no `provenance`
 * blob, because C3's provenance rules are for AI-generated artifacts.
 */
export async function insertTutorFaqEntry(
  ex: Executor,
  entry: {
    readonly id: string;
    readonly assignmentId: string;
    readonly milestoneId: string | null;
    readonly question: string;
    readonly answer: string;
    readonly displayOrder: number;
    readonly publicationStatus: string;
    readonly now: Date;
  },
): Promise<boolean> {
  const rows = await ex<{ id: string }[]>`
    insert into faq_entries (
      id, assignment_id, milestone_id, question, answer, source_kind,
      display_order, publication_status, origin, grounding_chunk_ids, revision,
      created_at, updated_at
    )
    values (
      ${entry.id}::uuid,
      ${entry.assignmentId}::uuid,
      ${entry.milestoneId === null ? null : entry.milestoneId}::uuid,
      ${entry.question},
      ${entry.answer},
      'tutor_authored',
      ${entry.displayOrder},
      ${entry.publicationStatus},
      'tutor',
      '{}'::uuid[],
      1,
      ${entry.now.toISOString()}::timestamptz,
      ${entry.now.toISOString()}::timestamptz
    )
    on conflict do nothing
    returning id
  `;
  return rows.length > 0;
}

/**
 * Update an entry's text and/or publication status, guarded by `revision`.
 *
 * **The `revision` guard is what makes the 409 possible.** `0012` added the column and D98 established the
 * optimistic-concurrency contract for tutor writes; without the guard two tutors editing the same entry
 * would silently overwrite each other, which is the defect `STALE_REVISION` exists to report. The status
 * and the text move together, so a `PUBLISHED` transition stamps `approved_by`/`published_by` and a
 * withdraw **clears `published_at`** -- because a withdrawn entry must not read as ever-published to a
 * student-facing query that only checks the timestamp.
 */
export async function updateFaqEntry(
  ex: Executor,
  input: {
    readonly entryId: string;
    readonly expectedRevision: number;
    readonly question: string;
    readonly answer: string;
    readonly publicationStatus: string;
    readonly tutorUserId: string;
    readonly now: Date;
  },
): Promise<FaqEntryRow | null> {
  const publishing = input.publicationStatus === 'PUBLISHED';
  // Two independent stamps, because the schema distinguishes them and `ck_faq_entries_approval` /
  // `ck_faq_entries_published_by` enforce it: an **`APPROVED`** entry needs `approved_by_user_id` but must
  // **not** have `published_by_user_id` or `published_at`, and only a **`PUBLISHED`** entry needs those.
  // Conflating the two is what a first pass gets wrong: stamping both on `APPROVED` violates
  // `ck_faq_entries_published_by`'s dual, and stamping neither on `APPROVED` violates the approval check.
  const approving =
    input.publicationStatus === 'APPROVED' || input.publicationStatus === 'PUBLISHED';
  // The condition is computed here rather than written as a SQL comment inside the statement: a comment
  // in a tagged template is part of the text, and a `--` swallowing the following parameter would be a
  // subtle, data-dependent bug.
  const rows = await ex<RawFaqRow[]>`
    update faq_entries f
       set question = ${input.question},
           answer = ${input.answer},
           publication_status = ${input.publicationStatus},
           approved_by_user_id = ${approving ? input.tutorUserId : null}::uuid,
           approved_at = ${approving ? input.now.toISOString() : null}::timestamptz,
           published_by_user_id = ${publishing ? input.tutorUserId : null}::uuid,
           published_at = ${publishing ? input.now.toISOString() : null}::timestamptz,
           revision = revision + 1,
           updated_at = ${input.now.toISOString()}::timestamptz
     where f.id = ${input.entryId}::uuid
       and f.deleted_at is null
       and f.revision = ${input.expectedRevision}
    returning f.id,
              f.assignment_id,
              f.milestone_id,
              f.question,
              f.answer,
              f.source_kind,
              f.publication_status,
              f.origin,
              f.display_order,
              f.created_at,
              f.published_at,
              f.revision
  `;
  const row = rows[0];
  return row === undefined ? null : toRow(row);
}

/**
 * One past the highest entry's order, for a newly authored one.
 *
 * It **ignores publication status**, unlike the promotion paths' helper: a tutor-authored entry starts
 * `NEEDS_REVIEW` and `uq_faq_entries_display_order` is unique per assignment among non-deleted rows, so a
 * draft still occupies an order and two drafts must not collide.
 */
export async function readNextDisplayOrder(
  ex: Executor,
  assignmentId: string,
): Promise<number> {
  const rows = await ex<{ next: string | number }[]>`
    select coalesce(max(display_order), -1) + 1 as next
      from faq_entries
     where assignment_id = ${assignmentId}::uuid
       and deleted_at is null
  `;
  return Number(rows[0]?.next ?? 0);
}
