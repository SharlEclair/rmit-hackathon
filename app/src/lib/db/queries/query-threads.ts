/**
 * Private Query reads: `06-DATA-MODEL.md` sections 7.4.1 and 7.4.2 (`queries`, `query_messages`).
 *
 * **A Query is always attributed, and that is why this module may join `users`.** `06` section 7.4's
 * preamble and D50: "Query threads are private and **always attributed**: a student may be anonymous in
 * a Discussion thread, never in a private Query." `05-ISSUES.md` reading A1 classifies `queries` as
 * identity-bearing for exactly this reason, which is what lets a tutor see who is asking.
 *
 * **The contrast with `discussions.ts` is the point.** There, a join to `users` for the author would be
 * the C4 defect; here it is the contract. The two modules therefore share no author-resolution helper,
 * and `tests/discussion/imports.test.ts` asserts the discussion side cannot reach an identity module.
 *
 * **`queries` has no `deleted_at`** (trap **T33**): a thread is closed by its `status`, not removed. Only
 * `query_messages` is soft-deletable, and a moderator does that -- never the author, because `06` section
 * 7.4.2 makes a sent message body immutable.
 */

import type { Executor } from '@/lib/db/queries/courses';
import { isoTimestamp } from '@/lib/db/values';

/** `06` section 7.4.1 and `07` section 5.1. */
export type QueryStatusRow = 'open' | 'answered' | 'resolved' | 'closed';

export interface QueryRow {
  readonly id: string;
  readonly assignmentId: string;
  readonly studentId: string;
  /** The asking student's display name. A Query is never anonymous (D24, D50). */
  readonly studentDisplayName: string;
  readonly subject: string | null;
  readonly status: QueryStatusRow;
  readonly milestoneId: string | null;
  readonly messageCount: number;
  readonly lastMessageAt: string | null;
  readonly resolvedAt: string | null;
  readonly createdAt: string;
}

export interface QueryMessageRow {
  readonly id: string;
  readonly queryId: string;
  readonly authorRole: 'student' | 'tutor';
  readonly authorDisplayName: string;
  readonly body: string;
  readonly createdAt: string;
  /** Set when this reply became an official FAQ entry (D24). */
  readonly publishedAsFaqEntryId: string | null;
}

/**
 * The select list, repeated in each read.
 *
 * **Why it is repeated rather than shared through a constant or `unsafe()`.** The `postgres` driver
 * interpolates only tagged-template parameters, so a shared string would have to be spliced in with its
 * `unsafe()` escape hatch -- which disables the interpolation safety on the very statement that carries
 * the caller's ids. Two repetitions of eleven column names is the cheaper cost, and the two reads are
 * meant to diverge anyway (the student's is scoped, the tutor's is not).
 */

interface RawQueryRow {
  id: string;
  assignment_id: string;
  student_id: string;
  student_display_name: string;
  subject: string | null;
  status: string;
  milestone_id: string | null;
  message_count: string | number;
  last_message_at: Date | string | null;
  resolved_at: Date | string | null;
  created_at: Date | string;
}

function toQueryRow(row: RawQueryRow): QueryRow {
  return {
    id: row.id,
    assignmentId: row.assignment_id,
    studentId: row.student_id,
    studentDisplayName: row.student_display_name,
    subject: row.subject,
    status: row.status as QueryStatusRow,
    milestoneId: row.milestone_id,
    messageCount: Number(row.message_count),
    lastMessageAt: isoTimestamp(row.last_message_at),
    resolvedAt: isoTimestamp(row.resolved_at),
    createdAt: isoTimestamp(row.created_at) ?? '',
  };
}

/**
 * The student's own threads in one assignment, newest activity first.
 *
 * **Filtered by `student_id = <the caller>` in the SQL** (`06` section 5.2 rule 4): "No endpoint accepts
 * a student id from the client." The id is a parameter of this function rather than of a route, so a
 * route cannot pass a client-supplied one without the call site being visible.
 */
export async function listQueriesForStudent(
  ex: Executor,
  assignmentId: string,
  studentId: string,
): Promise<QueryRow[]> {
  const rows = await ex<RawQueryRow[]>`
    select q.id,
           q.assignment_id,
           q.student_id,
           u.display_name as student_display_name,
           q.subject,
           q.status,
           q.milestone_id,
           q.message_count,
           q.last_message_at,
           q.resolved_at,
           q.created_at
      from queries q
      join users u on u.id = q.student_id
     where q.assignment_id = ${assignmentId}::uuid
       and q.student_id = ${studentId}::uuid
     order by q.last_message_at desc nulls last, q.created_at desc
  `;
  return rows.map(toQueryRow);
}

/** One thread, addressable by its own id. Returns `null` for a missing thread. */
export async function findQuery(ex: Executor, queryId: string): Promise<QueryRow | null> {
  const rows = await ex<RawQueryRow[]>`
    select q.id,
           q.assignment_id,
           q.student_id,
           u.display_name as student_display_name,
           q.subject,
           q.status,
           q.milestone_id,
           q.message_count,
           q.last_message_at,
           q.resolved_at,
           q.created_at
      from queries q
      join users u on u.id = q.student_id
     where q.id = ${queryId}::uuid
     limit 1
  `;
  const row = rows[0];
  return row === undefined ? null : toQueryRow(row);
}

/**
 * A thread's messages, oldest first, with the author's display name.
 *
 * The `left join` on `query_messages.author_user_id` resolves both roles with one join: a student
 * message's author is the asking student and a tutor message's is a tutor, and `06` section 7.4.2 stores
 * whichever user wrote it. A soft-deleted message is excluded (`deleted_at`), which a moderator sets.
 *
 * `publishedAsFaqEntryId` is read from `faq_entries.source_query_message_id`, so the thread shows which
 * reply became the public answer without a second query per message.
 */
export async function listQueryMessages(
  ex: Executor,
  queryId: string,
): Promise<QueryMessageRow[]> {
  const rows = await ex<
    {
      id: string;
      query_id: string;
      author_role: string;
      author_display_name: string | null;
      body: string;
      created_at: Date | string;
      faq_entry_id: string | null;
    }[]
  >`
    select m.id,
           m.query_id,
           m.author_role,
           u.display_name as author_display_name,
           m.body,
           m.created_at,
           (
             select f.id from faq_entries f
              where f.source_query_message_id = m.id
                and f.deleted_at is null
              limit 1
           ) as faq_entry_id
      from query_messages m
      left join users u on u.id = m.author_user_id
     where m.query_id = ${queryId}::uuid
       and m.deleted_at is null
     order by m.created_at asc
  `;
  return rows.map((row) => ({
    id: row.id,
    queryId: row.query_id,
    authorRole: row.author_role as 'student' | 'tutor',
    // A message with no author row cannot exist (`author_user_id` is NOT NULL), so the fallback is
    // unreachable and exists to keep the response's type honest rather than to handle a real case.
    authorDisplayName: row.author_display_name ?? 'Unknown',
    body: row.body,
    createdAt: isoTimestamp(row.created_at) ?? '',
    publishedAsFaqEntryId: row.faq_entry_id,
  }));
}

/**
 * The tutor's queue: every thread in an assignment, grouped by **approved Milestone**.
 *
 * `06` section 5.5.12 fixes the grouping at one value -- `'milestone'` -- because topic clustering is out
 * of scope in the MVP (`02` section 2.4), so the reserved `topic_label` columns stay unpopulated and this
 * read never touches them. A thread with no milestone is grouped under a single explicit "no milestone"
 * key rather than dropped: `06` section 5.5.12 requires the item, and a query a tutor cannot see is worse
 * than one they can see without a heading.
 */
export async function listQueriesForTutor(
  ex: Executor,
  assignmentId: string,
): Promise<QueryRow[]> {
  const rows = await ex<RawQueryRow[]>`
    select q.id,
           q.assignment_id,
           q.student_id,
           u.display_name as student_display_name,
           q.subject,
           q.status,
           q.milestone_id,
           q.message_count,
           q.last_message_at,
           q.resolved_at,
           q.created_at
      from queries q
      join users u on u.id = q.student_id
     where q.assignment_id = ${assignmentId}::uuid
     order by q.milestone_id asc nulls last, q.last_message_at desc nulls last, q.created_at desc
  `;
  return rows.map(toQueryRow);
}

/** The approved Milestone titles for one assignment, for the tutor groups' T3 labels. */
export async function listMilestoneTitles(
  ex: Executor,
  assignmentId: string,
): Promise<Map<string, string>> {
  const rows = await ex<{ id: string; title: string }[]>`
    select id, title
      from milestones
     where assignment_id = ${assignmentId}::uuid
       and publication_status = 'PUBLISHED'
       and deleted_at is null
     order by display_order asc
  `;
  return new Map(rows.map((row) => [row.id, row.title]));
}

/** Whether a Query's thread belongs to this student, for the ownership check. */
export async function queryBelongsToStudent(
  ex: Executor,
  queryId: string,
  studentId: string,
): Promise<string | null> {
  const rows = await ex<{ assignment_id: string }[]>`
    select assignment_id
      from queries
     where id = ${queryId}::uuid
       and student_id = ${studentId}::uuid
     limit 1
  `;
  return rows[0]?.assignment_id ?? null;
}

/**
 * The assignment and student a Query belongs to, **without an ownership filter**, so a route can run the
 * tutor gate against the right assignment. It returns only the two ids and no content.
 */
export async function findQueryScope(
  ex: Executor,
  queryId: string,
): Promise<{ assignmentId: string; studentId: string } | null> {
  const rows = await ex<{ assignment_id: string; student_id: string }[]>`
    select assignment_id, student_id
      from queries
     where id = ${queryId}::uuid
     limit 1
  `;
  const row = rows[0];
  return row === undefined
    ? null
    : { assignmentId: row.assignment_id, studentId: row.student_id };
}

/**
 * Move a Query's status, guarded by the status it expected.
 *
 * `06` section 3.2's sibling machine for Queries is small and lives in the service; this is only the
 * write. The `expected` guard is what makes two concurrent replies collapse to one transition instead of
 * a lost update, and it is the same optimistic shape Phase 4 uses for artifacts (`STALE_REVISION`).
 */
export async function setQueryStatus(
  ex: Executor,
  input: {
    readonly queryId: string;
    readonly status: QueryStatusRow;
    readonly expected: QueryStatusRow;
    /** Required by `ck_queries_resolved_at` when the status is `resolved`. */
    readonly resolvedAt: Date | null;
  },
): Promise<boolean> {
  const rows = await ex<{ id: string }[]>`
    update queries
       set status = ${input.status},
           resolved_at = ${input.resolvedAt === null ? null : input.resolvedAt.toISOString()}::timestamptz
     where id = ${input.queryId}::uuid
       and status = ${input.expected}
    returning id
  `;
  return rows.length > 0;
}

/**
 * Attach a milestone to a Query, for a student who picked one when posting.
 *
 * A separate write from `createQuery` because that function's insert already carries the milestone: this
 * exists for the reply path, where `07` section 4.4 lets a student attach context later. It refuses a
 * milestone that is not published, because `06` section 5.5.12's grouping labels come from approved
 * milestones and a draft one would produce an unlabelled group.
 */
export async function attachMilestoneIfPublished(
  ex: Executor,
  input: { readonly queryId: string; readonly milestoneId: string; readonly assignmentId: string },
): Promise<boolean> {
  const rows = await ex<{ id: string }[]>`
    update queries q
       set milestone_id = ${input.milestoneId}::uuid
     where q.id = ${input.queryId}::uuid
       and exists (
         select 1 from milestones m
          where m.id = ${input.milestoneId}::uuid
            and m.assignment_id = ${input.assignmentId}::uuid
            and m.publication_status = 'PUBLISHED'
            and m.deleted_at is null
       )
    returning q.id
  `;
  return rows.length > 0;
}
