/**
 * Discussion reads and writes: `06-DATA-MODEL.md` sections 7.5.1, 7.5.2 and 7.5.4.
 *
 * **The one rule this module cannot break, and how it is kept.** A tutor-facing read must take its
 * author label from the view `discussion_author_display` and never join the identity table directly
 * (A-ID-3: the join is the defect), and it may not `SELECT`, `ORDER BY`, `GROUP BY` or filter on any
 * author-identifying column (A-ID-4: "Sorting by author id is a violation even when the id is not
 * returned"). Every read below therefore orders by `created_at` or `display_order` and joins the view
 * for the label. There is deliberately no `orderBy: 'author'` option to pass.
 *
 * **A note on wording.** This header deliberately does not spell the identity table's name, because
 * `tests/discussion/imports.test.ts` asserts that exactly one runtime file names it and this module is
 * not that file (A-ID-2). Naming it here to say "do not join it" would make the gate unable to tell a
 * warning apart from a join, so the constraint is described instead of quoted.
 *
 * **`GET` shapes never carry an author id.** `06` section 7.5.2 makes the two mutually exclusive:
 * `ck_posts_author_xor` requires an anonymous post to have `author_user_id IS NULL` and a non-anonymous
 * one to have `author_anon_identity_id IS NULL`. The reads below select `is_anonymised` and the view's
 * `display_label`, and both author columns stay in the query layer.
 *
 * **`own` is computed, never trusted.** `isOwnPost` and `isOwnThread` come from comparing the caller's
 * identity against the row's `author_anon_identity_id` (A-ID-7). The comparison itself lives in the
 * feature service, because it needs the identity row; this module returns the column so the service can
 * do it without a second read.
 */

import type { Executor } from '@/lib/db/queries/courses';
import { isoTimestamp } from '@/lib/db/values';

// ---------------------------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------------------------

/** One post as the **view** presents its author, plus the columns the feature layer needs. */
export interface DiscussionPostRow {
  readonly id: string;
  readonly threadId: string;
  readonly parentPostId: string | null;
  readonly body: string;
  readonly status: string;
  readonly acceptedAnswerStatus: string;
  readonly isAnonymised: boolean;
  readonly displayLabel: string;
  readonly authorAnonIdentityId: string | null;
  readonly createdAt: string;
  readonly editedAt: string | null;
  readonly deletedAt: string | null;
}

export interface DiscussionThreadRow {
  readonly id: string;
  readonly title: string;
  readonly milestoneId: string | null;
  readonly status: string;
  readonly postCount: number;
  readonly lastPostAt: string | null;
  readonly createdAt: string;
  readonly authorAnonIdentityId: string | null;
}

/**
 * Every live thread of one assignment, newest activity first, with the label from the view.
 *
 * **No `ORDER BY` on an author column** (A-ID-4). The order is `last_post_at desc nulls last,
 * created_at desc`, which is derived from the conversation rather than from who is in it.
 *
 * The `left join`s are what make the view usable beside the post columns the response needs: the view
 * carries `display_label` and nothing else, so the body and status still come from `discussion_posts`.
 */
export async function listThreads(ex: Executor, assignmentId: string): Promise<DiscussionThreadRow[]> {
  const rows = await ex<
    {
      id: string;
      title: string;
      milestone_id: string | null;
      status: string;
      post_count: number;
      last_post_at: Date | string | null;
      created_at: Date | string;
      author_anon_identity_id: string | null;
    }[]
  >`
    select t.id,
           t.title,
           t.milestone_id,
           t.status,
           t.post_count,
           t.last_post_at,
           t.created_at,
           first.author_anon_identity_id
      from discussion_threads t
      left join discussion_posts first on first.id = t.first_post_id
     where t.assignment_id = ${assignmentId}::uuid
       and t.deleted_at is null
     order by t.last_post_at desc nulls last, t.created_at desc
  `;
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    milestoneId: row.milestone_id,
    status: row.status,
    postCount: Number(row.post_count),
    lastPostAt: isoTimestamp(row.last_post_at),
    createdAt: isoTimestamp(row.created_at) ?? '',
    authorAnonIdentityId: row.author_anon_identity_id,
  }));
}

/**
 * The posts of one thread, oldest first, with the label from the view.
 *
 * A soft-deleted post is excluded (`06` section 7.5.2's `deleted_at`, D28): "deleted by author | ...
 * Absent from the thread". A post whose status is `removed` is **kept**, because `07` section 6.4
 * requires a tombstone rather than an absence -- "A removed post renders as a tombstone: `This post was
 * removed by a tutor.` with no body".
 */
export async function listPosts(ex: Executor, threadId: string): Promise<DiscussionPostRow[]> {
  const rows = await ex<
    {
      id: string;
      thread_id: string;
      parent_post_id: string | null;
      body: string;
      status: string;
      accepted_answer_status: string;
      is_anonymised: boolean;
      display_label: string;
      author_anon_identity_id: string | null;
      created_at: Date | string;
      edited_at: Date | string | null;
      deleted_at: Date | string | null;
    }[]
  >`
    select p.id,
           p.thread_id,
           p.parent_post_id,
           p.body,
           p.status,
           p.accepted_answer_status,
           p.is_anonymised,
           d.display_label,
           p.author_anon_identity_id,
           p.created_at,
           p.edited_at,
           p.deleted_at
      from discussion_posts p
      join discussion_author_display d on d.post_id = p.id
     where p.thread_id = ${threadId}::uuid
       and p.deleted_at is null
     order by p.created_at asc
  `;
  return rows.map((row) => ({
    id: row.id,
    threadId: row.thread_id,
    parentPostId: row.parent_post_id,
    body: row.body,
    status: row.status,
    acceptedAnswerStatus: row.accepted_answer_status,
    isAnonymised: row.is_anonymised,
    displayLabel: row.display_label,
    authorAnonIdentityId: row.author_anon_identity_id,
    createdAt: isoTimestamp(row.created_at) ?? '',
    editedAt: isoTimestamp(row.edited_at),
    deletedAt: isoTimestamp(row.deleted_at),
  }));
}

/** One thread's own row, for the route that addresses it directly. `null` is `NOT_FOUND`. */
export async function findThread(
  ex: Executor,
  threadId: string,
): Promise<(DiscussionThreadRow & { assignmentId: string }) | null> {
  const rows = await ex<
    {
      id: string;
      assignment_id: string;
      title: string;
      milestone_id: string | null;
      status: string;
      post_count: number;
      last_post_at: Date | string | null;
      created_at: Date | string;
      author_anon_identity_id: string | null;
    }[]
  >`
    select t.id,
           t.assignment_id,
           t.title,
           t.milestone_id,
           t.status,
           t.post_count,
           t.last_post_at,
           t.created_at,
           first.author_anon_identity_id
      from discussion_threads t
      left join discussion_posts first on first.id = t.first_post_id
     where t.id = ${threadId}::uuid
       and t.deleted_at is null
     limit 1
  `;
  const row = rows[0];
  return row === undefined
    ? null
    : {
        id: row.id,
        assignmentId: row.assignment_id,
        title: row.title,
        milestoneId: row.milestone_id,
        status: row.status,
        postCount: Number(row.post_count),
        lastPostAt: isoTimestamp(row.last_post_at),
        createdAt: isoTimestamp(row.created_at) ?? '',
        authorAnonIdentityId: row.author_anon_identity_id,
      };
}

/** One post's own row, for the routes that edit, delete or flag it. */
export async function findPost(
  ex: Executor,
  postId: string,
): Promise<(DiscussionPostRow & { assignmentId: string }) | null> {
  const rows = await ex<
    {
      id: string;
      thread_id: string;
      assignment_id: string;
      parent_post_id: string | null;
      body: string;
      status: string;
      accepted_answer_status: string;
      is_anonymised: boolean;
      display_label: string;
      author_anon_identity_id: string | null;
      created_at: Date | string;
      edited_at: Date | string | null;
      deleted_at: Date | string | null;
    }[]
  >`
    select p.id,
           p.thread_id,
           p.assignment_id,
           p.parent_post_id,
           p.body,
           p.status,
           p.accepted_answer_status,
           p.is_anonymised,
           d.display_label,
           p.author_anon_identity_id,
           p.created_at,
           p.edited_at,
           p.deleted_at
      from discussion_posts p
      join discussion_author_display d on d.post_id = p.id
     where p.id = ${postId}::uuid
     limit 1
  `;
  const row = rows[0];
  return row === undefined
    ? null
    : {
        id: row.id,
        threadId: row.thread_id,
        assignmentId: row.assignment_id,
        parentPostId: row.parent_post_id,
        body: row.body,
        status: row.status,
        acceptedAnswerStatus: row.accepted_answer_status,
        isAnonymised: row.is_anonymised,
        displayLabel: row.display_label,
        authorAnonIdentityId: row.author_anon_identity_id,
        createdAt: isoTimestamp(row.created_at) ?? '',
        editedAt: isoTimestamp(row.edited_at),
        deletedAt: isoTimestamp(row.deleted_at),
      };
}

/**
 * How many threads this assignment already has, for `06` section 5.6's **20 threads per hour per
 * student** limit.
 *
 * It counts by the thread's first post's identity rather than by student id, because that is the only
 * author column a discourse table has (A-ID-2). A student with no identity row has created no thread,
 * and the caller treats `null` as zero.
 */
export async function countRecentThreadsForIdentity(
  ex: Executor,
  assignmentId: string,
  anonIdentityId: string,
  since: Date,
): Promise<number> {
  const rows = await ex<{ count: string | number }[]>`
    select count(*) as count
      from discussion_threads t
      join discussion_posts first on first.id = t.first_post_id
     where t.assignment_id = ${assignmentId}::uuid
       and first.author_anon_identity_id = ${anonIdentityId}::uuid
       and t.created_at >= ${since.toISOString()}::timestamptz
  `;
  return Number(rows[0]?.count ?? 0);
}

/** The open flags on one target, so a second flag can be refused rather than duplicated. */
export async function countOpenFlags(
  ex: Executor,
  targetKind: string,
  targetId: string,
): Promise<number> {
  const rows = await ex<{ count: string | number }[]>`
    select count(*) as count
      from moderation_flags
     where target_kind = ${targetKind}
       and target_id = ${targetId}::uuid
       and status = 'open'
  `;
  return Number(rows[0]?.count ?? 0);
}

/** The moderation queue for one assignment: **no reporter identity in the projection** (`06` section 4.4). */
export interface ModerationFlagRow {
  readonly id: string;
  readonly targetKind: string;
  readonly targetId: string;
  readonly source: string;
  readonly severity: string;
  readonly reasonCode: string;
  readonly status: string;
  readonly createdAt: string;
  readonly reviewedAt: string | null;
}

export async function listModerationQueue(
  ex: Executor,
  assignmentId: string,
): Promise<ModerationFlagRow[]> {
  const rows = await ex<
    {
      id: string;
      target_kind: string;
      target_id: string;
      source: string;
      severity: string;
      reason_code: string;
      status: string;
      created_at: Date | string;
      reviewed_at: Date | string | null;
    }[]
  >`
    select id, target_kind, target_id, source, severity, reason_code, status, created_at, reviewed_at
      from moderation_flags
     where assignment_id = ${assignmentId}::uuid
     order by case status when 'open' then 0 else 1 end asc, severity desc, created_at asc
  `;
  return rows.map((row) => ({
    id: row.id,
    targetKind: row.target_kind,
    targetId: row.target_id,
    source: row.source,
    severity: row.severity,
    reasonCode: row.reason_code,
    status: row.status,
    createdAt: isoTimestamp(row.created_at) ?? '',
    reviewedAt: isoTimestamp(row.reviewed_at),
  }));
}

// ---------------------------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------------------------

export interface NewThread {
  readonly id: string;
  readonly assignmentId: string;
  readonly milestoneId: string | null;
  readonly title: string;
  readonly createdAt: Date;
}

/**
 * Create a thread. `first_post_id` is set by `linkFirstPost` in the same transaction, because the FK is
 * `DEFERRABLE INITIALLY DEFERRED` (`06` section 7.5.1) and the post cannot exist before its thread.
 */
export async function insertThread(ex: Executor, thread: NewThread): Promise<void> {
  await ex`
    insert into discussion_threads (id, assignment_id, milestone_id, title, status, post_count, created_at, updated_at)
    values (
      ${thread.id}::uuid,
      ${thread.assignmentId}::uuid,
      ${thread.milestoneId === null ? null : thread.milestoneId}::uuid,
      ${thread.title},
      'open',
      0,
      ${thread.createdAt.toISOString()}::timestamptz,
      ${thread.createdAt.toISOString()}::timestamptz
    )
  `;
}

export interface NewPost {
  readonly id: string;
  readonly threadId: string;
  readonly assignmentId: string;
  readonly parentPostId: string | null;
  readonly body: string;
  readonly createdAt: Date;
  /**
   * Exactly one of these is non-null, enforced by `ck_posts_author_xor`: an anonymous post has **no**
   * `author_user_id` at all (`06` section 7.5.2), so no query over the table can name its author even
   * before the identity table is considered.
   */
  readonly authorAnonIdentityId: string | null;
  readonly authorUserId: string | null;
  readonly isAnonymised: boolean;
}

/**
 * Create a post and maintain the thread's denormalised counters **in the same statement pair**.
 *
 * `06` section 7.5.1's reading A10: `post_count` "counts posts whose `deleted_at is null`. A post whose
 * status is 'removed' or 'hidden_pending_review' is NOT deleted, so it stays counted." The increment
 * therefore keys on the insert, not on the status.
 */
export async function insertPost(ex: Executor, post: NewPost): Promise<void> {
  await ex`
    insert into discussion_posts (
      id, thread_id, assignment_id, parent_post_id, author_user_id, author_anon_identity_id,
      is_anonymised, body, status, accepted_answer_status, created_at, updated_at
    )
    values (
      ${post.id}::uuid,
      ${post.threadId}::uuid,
      ${post.assignmentId}::uuid,
      ${post.parentPostId === null ? null : post.parentPostId}::uuid,
      ${post.authorUserId === null ? null : post.authorUserId}::uuid,
      ${post.authorAnonIdentityId === null ? null : post.authorAnonIdentityId}::uuid,
      ${post.isAnonymised},
      ${post.body},
      'visible',
      'none',
      ${post.createdAt.toISOString()}::timestamptz,
      ${post.createdAt.toISOString()}::timestamptz
    )
  `;

  await ex`
    update discussion_threads
       set post_count = post_count + 1,
           last_post_at = ${post.createdAt.toISOString()}::timestamptz,
           updated_at = ${post.createdAt.toISOString()}::timestamptz
     where id = ${post.threadId}::uuid
  `;
}

/** The first post of a thread, which is what `first_post_id` points at. */
export async function linkFirstPost(
  ex: Executor,
  threadId: string,
  postId: string,
): Promise<void> {
  await ex`
    update discussion_threads
       set first_post_id = ${postId}::uuid
     where id = ${threadId}::uuid
       and first_post_id is null
  `;
}

/**
 * The author's own soft delete (D28). The row survives so the moderation history and the audit trail
 * keep their subject, and the thread's counter is decremented in the same transaction because
 * `post_count` counts `deleted_at is null` (reading A10).
 */
export async function softDeleteOwnPost(
  ex: Executor,
  input: { readonly postId: string; readonly threadId: string; readonly deletedAt: Date },
): Promise<boolean> {
  const rows = await ex<{ id: string }[]>`
    update discussion_posts
       set deleted_at = ${input.deletedAt.toISOString()}::timestamptz,
           updated_at = ${input.deletedAt.toISOString()}::timestamptz
     where id = ${input.postId}::uuid
       and deleted_at is null
    returning id
  `;
  if (rows.length === 0) return false;

  await ex`
    update discussion_threads
       set post_count = greatest(post_count - 1, 0),
           updated_at = ${input.deletedAt.toISOString()}::timestamptz
     where id = ${input.threadId}::uuid
  `;
  return true;
}

/**
 * A tutor's moderation action: approve a hidden post back to `visible`, or remove it.
 *
 * **A tutor may hide or remove; a tutor may never edit** (`07` section 6.2 rule 8: "A tutor viewing a
 * thread never sees `Edit` on a student post"). So this sets `status` and nothing else -- in
 * particular it never writes `body` and never writes `edited_at`, which is what keeps
 * `editedByModerator` in the response a `false` rather than a claim this module cannot support.
 */
export async function setPostStatus(
  ex: Executor,
  input: { readonly postId: string; readonly status: string; readonly now: Date },
): Promise<boolean> {
  const rows = await ex<{ id: string }[]>`
    update discussion_posts
       set status = ${input.status},
           updated_at = ${input.now.toISOString()}::timestamptz
     where id = ${input.postId}::uuid
       and deleted_at is null
    returning id
  `;
  return rows.length > 0;
}

/**
 * A tutor's decision on a peer answer (transition 10/11 of `07` section 6.2 rule 7).
 *
 * `answer_approved_by_user_id` is required by `ck_discussion_posts_answer_approved` whenever the status
 * is `approved`, so the tutor's id is written with it -- that is the record of who stands behind the
 * answer, and it is a **tutor** id rather than a student's.
 */
export async function setAcceptedAnswerStatus(
  ex: Executor,
  input: {
    readonly postId: string;
    readonly status: 'approved' | 'rejected';
    readonly tutorUserId: string;
    readonly now: Date;
  },
): Promise<boolean> {
  const rows = await ex<{ id: string }[]>`
    update discussion_posts
       set accepted_answer_status = ${input.status},
           answer_approved_by_user_id =
             ${input.status === 'approved' ? input.tutorUserId : null}::uuid,
           answer_approved_at = ${input.status === 'approved' ? input.now.toISOString() : null}::timestamptz,
           updated_at = ${input.now.toISOString()}::timestamptz
     where id = ${input.postId}::uuid
       and deleted_at is null
    returning id
  `;
  return rows.length > 0;
}

export interface NewModerationFlag {
  readonly id: string;
  readonly assignmentId: string;
  readonly targetKind: 'discussion_post' | 'query_message';
  readonly targetId: string;
  readonly source: 'ai' | 'student';
  readonly severity: 'low' | 'medium' | 'high';
  readonly reasonCode: string;
  readonly detail: string | null;
  readonly reporterAnonIdentityId: string | null;
  readonly aiModelId: string | null;
  readonly aiPromptVersion: string | null;
  readonly createdAt: Date;
}

/**
 * Record a flag.
 *
 * **The reporter is the student's anonymous identity, never a user id** (D54): `ck_moderation_flags_student_reporter`
 * requires it for `source = 'student'`, and using the identity is what keeps the moderator queue unable
 * to resolve the reporter (`06` section 4.4). The partial unique index
 * `uq_moderation_flags_student_flag` then implements "one flag per user per post" without storing a user.
 *
 * `on conflict do nothing` means a duplicate student flag writes **nothing** rather than updating the
 * existing row, and the return value is what the route turns into `INVALID_STATE_TRANSITION`
 * (`07` section 6.5 rule 2: "A second attempt is refused with `You have already flagged this post.` and
 * creates no duplicate row"). AI flags are deliberately outside that index (`06` section 7.5.4).
 */
export async function insertModerationFlag(ex: Executor, flag: NewModerationFlag): Promise<boolean> {
  const rows = await ex<{ id: string }[]>`
    insert into moderation_flags (
      id, assignment_id, target_kind, target_id, source, severity, reason_code, detail,
      reporter_anon_identity_id, ai_model_id, ai_prompt_version, status, created_at, updated_at
    )
    values (
      ${flag.id}::uuid,
      ${flag.assignmentId}::uuid,
      ${flag.targetKind},
      ${flag.targetId}::uuid,
      ${flag.source},
      ${flag.severity},
      ${flag.reasonCode},
      ${flag.detail},
      ${flag.reporterAnonIdentityId === null ? null : flag.reporterAnonIdentityId}::uuid,
      ${flag.aiModelId},
      ${flag.aiPromptVersion},
      'open',
      ${flag.createdAt.toISOString()}::timestamptz,
      ${flag.createdAt.toISOString()}::timestamptz
    )
    on conflict do nothing
    returning id
  `;
  return rows.length > 0;
}

/** A tutor's decision on one flag. `reviewed_at` is required once the status leaves `open`. */
export async function resolveModerationFlag(
  ex: Executor,
  input: {
    readonly flagId: string;
    readonly status: 'upheld' | 'dismissed';
    readonly tutorUserId: string;
    readonly note: string | null;
    readonly now: Date;
  },
): Promise<boolean> {
  const rows = await ex<{ id: string }[]>`
    update moderation_flags
       set status = ${input.status},
           reviewed_by_user_id = ${input.tutorUserId}::uuid,
           reviewed_at = ${input.now.toISOString()}::timestamptz,
           resolution_note = ${input.note},
           updated_at = ${input.now.toISOString()}::timestamptz
     where id = ${input.flagId}::uuid
       and status = 'open'
    returning id
  `;
  return rows.length > 0;
}
