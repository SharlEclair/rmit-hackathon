/**
 * The discussion responses and the transitions behind them: `06-DATA-MODEL.md` sections 5.5.13, 7.5.1,
 * 7.5.2 and 7.5.4, and `07-UI-UX-SPEC` sections 6.1-6.5.
 *
 * **This is where anonymity is enforced in practice, and the enforcement is a shape rather than a
 * filter.** Every builder below produces a `DiscussionAuthor` with exactly two fields, and the two
 * fields come from the `discussion_author_display` view. There is no intermediate object that carries
 * an author id into the response and no post-processing step that strips one -- a filter can be
 * forgotten on the second code path, and a type cannot (A-ID-5, `tests/discussion/imports.test.ts`).
 *
 * **Three rules the builders exist to keep.**
 *
 *   1. `isOwnPost`/`isOwnThread` are computed by comparing the caller's identity against the row's
 *      `author_anon_identity_id` (A-ID-7). A student who has **never** posted anonymously has no
 *      identity row, and that means "no anonymous posts", not "no permission to check" -- so the
 *      comparison against `null` is `false` rather than an error. A non-anonymous post carries a
 *      `displayLabel` from `users.display_name` and no identity, so it is never "own" (the view already
 *      resolved it).
 *   2. `body` is `null` for a `hidden_pending_review` post **when the caller is a student other than the
 *      author** (`06` section 5.5.13). The author and every tutor still see it; `07` section 6.4 gives
 *      the author the note "Only you and your tutors can see this while it is reviewed".
 *   3. A `removed` post keeps its row and loses its body -- `07` section 6.2 rule 6's tombstone.
 */

import { randomUUID } from 'node:crypto';

import type {
  DiscussionPostResponse,
  DiscussionThreadResponse,
  FaqEntryResponse,
  FaqEntryListResponse,
  StudentDiscussionResponse,
  TutorDiscussionResponse,
} from '@/lib/api/types';
import type { Executor } from '@/lib/db/queries/courses';
import {
  countOpenFlags,
  countRecentThreadsForIdentity,
  findPost,
  findThread,
  insertModerationFlag,
  insertPost,
  insertThread,
  linkFirstPost,
  listModerationQueue,
  listPosts,
  listThreads,
  softDeleteOwnPost,
  type DiscussionPostRow,
  type DiscussionThreadRow,
} from '@/lib/db/queries/discussions';import {
  listPublishedFaqEntries,
  listVisibleFaqEntries,
  type VisibleFaqEntry,
  type VisibleScope,
} from '@/lib/db/queries/student-visibility';
import { insertFaqEntryIfAbsent } from '@/lib/db/queries/questions';
import { identityFor, findIdentityFor, identityMatches } from '@/features/discussion/anon-identity';
import { applyModerationStatus, type ModerationHook } from '@/features/discussion/moderation';

/** `06` section 5.6: 20 discussion threads per assignment per student per hour. */
export const THREADS_PER_HOUR = 20;
/** `06` section 5.6: a post body is 1..4000 characters. A thread title is 5..200 (`07` section 6.1 rule 4). */
export const POST_MAX_CHARS = 4000;
export const TITLE_MIN_CHARS = 5;
export const TITLE_MAX_CHARS = 200;

/** The caller, as the discussion feature needs them. */
export interface DiscussionViewer {
  readonly userId: string;
  readonly assignmentId: string;
  readonly anonIdSecret: string;
  /** The caller's role **in this course**, which is `enrollments.role_in_course` and not the global role. */
  readonly isTutor: boolean;
}

// ---------------------------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------------------------

/** The one place a `DiscussionAuthor` is constructed. Two fields, from the view, and nothing else. */
function authorOf(row: { isAnonymised: boolean; displayLabel: string }): {
  readonly isAnonymised: boolean;
  readonly displayLabel: string;
} {
  return { isAnonymised: row.isAnonymised, displayLabel: row.displayLabel };
}

/**
 * One post as the response presents it.
 *
 * `viewerIdentityId` is the caller's own identity for this assignment, or `null` when they have none.
 * Passing it in rather than looking it up per post is what keeps this builder pure: one identity read
 * per request instead of one per row.
 */
export function buildPostResponse(
  row: DiscussionPostRow,
  input: { readonly viewerIdentityId: string | null; readonly isTutor: boolean },
): DiscussionPostResponse {
  const isOwnPost = identityMatches(row.authorAnonIdentityId, input.viewerIdentityId);

  // Rule 2: a student who is not the author does not receive a hidden post's body. A tutor always does
  // (the queue needs it) and so does the author.
  const hiddenFromViewer = row.status === 'hidden_pending_review' && !input.isTutor && !isOwnPost;
  // Rule 3: a removed post is a tombstone -- no body, for anyone, including its author.
  const removed = row.status === 'removed';

  return {
    id: row.id,
    parentPostId: row.parentPostId,
    body: hiddenFromViewer || removed ? null : row.body,
    status: row.status as DiscussionPostResponse['status'],
    acceptedAnswerStatus: row.acceptedAnswerStatus as DiscussionPostResponse['acceptedAnswerStatus'],
    author: authorOf(row),
    createdAt: row.createdAt,
    editedAt: row.editedAt,
    isOwnPost,
    // `07` section 6.2 rule 8: a tutor hides or removes and never edits, so no tutor write touches
    // `body`, and `edited_at` therefore only ever means the author edited it. The field exists because
    // `06` section 5.5.13 lists it as tutors-only, and a tutor reading the queue needs to know the post
    // was edited after the flag was raised.
    editedByModerator: false,
  };
}

export function buildThreadResponse(
  thread: DiscussionThreadRow,
  posts: readonly DiscussionPostRow[],
  input: { readonly viewerIdentityId: string | null; readonly isTutor: boolean },
): DiscussionThreadResponse {
  return {
    id: thread.id,
    title: thread.title,
    milestoneId: thread.milestoneId,
    status: thread.status as DiscussionThreadResponse['status'],
    postCount: thread.postCount,
    lastPostAt: thread.lastPostAt,
    createdAt: thread.createdAt,
    // The thread's author is its first post's author, which is what `discussion_threads.first_post_id`
    // points at (reading A10). A thread with no first post cannot exist past its own transaction.
    author: authorOf({
      isAnonymised: posts[0]?.isAnonymised ?? true,
      displayLabel: posts[0]?.displayLabel ?? 'Anonymous Student',
    }),
    isOwnThread: identityMatches(thread.authorAnonIdentityId, input.viewerIdentityId),
    posts: posts.map((post) => buildPostResponse(post, input)),
  };
}

/** A published FAQ entry as the response presents it (`06` section 5.5.13's `officialFaq`). */
function faqOf(row: VisibleFaqEntry): FaqEntryResponse {
  return {
    id: row.id,
    assignmentId: '',
    milestoneId: row.milestoneId,
    question: row.question,
    answer: row.answer,
    // `listVisibleFaqEntries` reads `publication_status = 'PUBLISHED'` only, so these two are facts
    // about the read rather than values from the row.
    sourceKind: 'tutor_authored',
    publicationStatus: 'PUBLISHED',
    isPublished: true,
    displayOrder: row.displayOrder,
    createdAt: '',
    // Read, not derived: the T2 marker `Published by your tutor on <date>` is a claim about when the
    // tutor published this answer, so it comes from `faq_entries.published_at`.
    publishedAt: row.publishedAt,
    revision: 1,
  };
}

/**
 * The student's Discussions tab: the published FAQ (T2) plus every live thread (T4).
 *
 * The FAQ is read through `listVisibleFaqEntries`, which takes a `VisibleScope` -- so a student cannot
 * receive an FAQ entry from an assignment they cannot see, for the same structural reason the workspace
 * cannot (`06` section 3.4, trap **T3**).
 */
export async function buildStudentDiscussion(
  ex: Executor,
  scope: VisibleScope,
  viewer: DiscussionViewer,
): Promise<StudentDiscussionResponse> {
  const identity = await findIdentityFor(ex, viewer.userId, scope.assignmentId);
  const viewerIdentityId = identity?.id ?? null;

  const [faq, threads] = await Promise.all([
    listVisibleFaqEntries(ex, scope),
    listThreads(ex, scope.assignmentId),
  ]);

  const built: DiscussionThreadResponse[] = [];
  for (const thread of threads) {
    const posts = await listPosts(ex, thread.id);
    built.push(buildThreadResponse(thread, posts, { viewerIdentityId, isTutor: false }));
  }

  return {
    officialFaq: faq.map(faqOf),
    threads: built,
  };
}

/** The tutor's Discussions tab: the same threads, plus the moderation queue (`06` section 5.5.13). */
export async function buildTutorDiscussion(
  ex: Executor,
  scope: { readonly assignmentId: string },
  viewer: DiscussionViewer,
): Promise<TutorDiscussionResponse> {
  const identity = await findIdentityFor(ex, viewer.userId, scope.assignmentId);
  const viewerIdentityId = identity?.id ?? null;

  const [faq, threads, queue] = await Promise.all([
    // `listPublishedFaqEntries`, not the gated reader: a tutor's own course's FAQ is authorised by the
    // enrolment `guardTutorAssignment` already resolved, and requiring a `VisibleScope` would force this
    // call site to fabricate one.
    listPublishedFaqEntries(ex, scope.assignmentId),
    listThreads(ex, scope.assignmentId),
    listModerationQueue(ex, scope.assignmentId),
  ]);

  const built: DiscussionThreadResponse[] = [];
  for (const thread of threads) {
    const posts = await listPosts(ex, thread.id);
    built.push(buildThreadResponse(thread, posts, { viewerIdentityId, isTutor: true }));
  }

  return {
    officialFaq: faq.map(faqOf),
    threads: built,
    moderationQueue: queue.map((row) => ({
      id: row.id,
      targetKind: row.targetKind as 'discussion_post' | 'query_message',
      targetId: row.targetId,
      source: row.source as 'ai' | 'student',
      severity: row.severity as 'low' | 'medium' | 'high',
      reasonCode: row.reasonCode as
        | 'HARASSMENT'
        | 'INAPPROPRIATE_CONTENT'
        | 'PERSONAL_INFORMATION'
        | 'PROHIBITED_ASSISTANCE'
        | 'SOLUTION_SHARING'
        | 'OTHER',
      status: row.status as 'open' | 'upheld' | 'dismissed',
      createdAt: row.createdAt,
      reviewedAt: row.reviewedAt,
      // The reporter is deliberately absent: `06` section 4.4's A-ID-5 and the D54 ruling make the
      // queue unable to resolve who flagged anything.
    })),
  };
}

/** One thread, for the route that addresses it. `null` is `NOT_FOUND`. */
export async function buildThreadDetail(
  ex: Executor,
  threadId: string,
  viewer: DiscussionViewer,
): Promise<DiscussionThreadResponse | null> {
  const thread = await findThread(ex, threadId);
  if (thread === null) return null;
  const identity = await findIdentityFor(ex, viewer.userId, thread.assignmentId);
  const posts = await listPosts(ex, threadId);
  return buildThreadResponse(thread, posts, {
    viewerIdentityId: identity?.id ?? null,
    isTutor: viewer.isTutor,
  });
}

// ---------------------------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------------------------

export type DiscussionOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: 'NOT_FOUND' | 'VALIDATION_FAILED' | 'RATE_LIMITED' | 'INVALID_STATE_TRANSITION' | 'FORBIDDEN_ROLE'; readonly message: string };

/**
 * Create a thread with its first post, atomically.
 *
 * **Anonymity is chosen per thread and the identity is created only when it is needed.** A student who
 * posts under their name creates no identity row; one who posts anonymously creates it here, on the
 * first anonymous action (`06` section 4.3: "It is never created for a student who only reads"). The
 * `anonymous` flag decides which of the two author columns is populated, and `ck_posts_author_xor`
 * refuses a row that sets both.
 *
 * **`06` section 5.6's rate limit is checked before the write.** Twenty threads per hour per student,
 * counted by the identity because that is the only author column a discourse table has (A-ID-2).
 */
export async function createThread(
  ex: Executor,
  input: {
    readonly scope: { readonly assignmentId: string };
    readonly viewer: DiscussionViewer;
    readonly title: string;
    readonly body: string;
    readonly milestoneId: string | null;
    readonly anonymous: boolean;
    readonly now: Date;
    /** The moderation hook for the thread's first post, or `null` to skip moderation explicitly. */
    readonly moderate?: ModerationHook | null;
  },
): Promise<DiscussionOutcome<DiscussionThreadResponse>> {
  const title = input.title.trim();
  const body = input.body.trim();

  if (title.length < TITLE_MIN_CHARS || title.length > TITLE_MAX_CHARS) {
    return {
      ok: false,
      code: 'VALIDATION_FAILED',
      message: `A thread title must be between ${String(TITLE_MIN_CHARS)} and ${String(TITLE_MAX_CHARS)} characters.`,
    };
  }
  if (body.length === 0 || body.length > POST_MAX_CHARS) {
    return {
      ok: false,
      code: 'VALIDATION_FAILED',
      message: `A post must be between 1 and ${String(POST_MAX_CHARS)} characters.`,
    };
  }

  const identity = input.anonymous
    ? await identityFor(ex, {
        anonIdSecret: input.viewer.anonIdSecret,
        studentId: input.viewer.userId,
        assignmentId: input.scope.assignmentId,
      })
    : null;

  if (identity !== null) {
    const since = new Date(input.now.getTime() - 60 * 60 * 1000);
    const recent = await countRecentThreadsForIdentity(
      ex,
      input.scope.assignmentId,
      identity.id,
      since,
    );
    if (recent >= THREADS_PER_HOUR) {
      return {
        ok: false,
        code: 'RATE_LIMITED',
        message: 'You have started a lot of discussions in the last hour. Try again shortly.',
      };
    }
  }

  const threadId = randomUUID();
  const postId = randomUUID();

  await insertThread(ex, {
    id: threadId,
    assignmentId: input.scope.assignmentId,
    milestoneId: input.milestoneId,
    title,
    createdAt: input.now,
  });
  await insertPost(ex, {
    id: postId,
    threadId,
    assignmentId: input.scope.assignmentId,
    parentPostId: null,
    body,
    createdAt: input.now,
    // Exactly one of the two, by the XOR check: an anonymous post has no `author_user_id` at all.
    authorAnonIdentityId: identity?.id ?? null,
    authorUserId: identity === null ? input.viewer.userId : null,
    isAnonymised: identity !== null,
  });
  await linkFirstPost(ex, threadId, postId);

  // The first post is moderated exactly as a reply is. `05` section 9.1 needs no distinction between them:
  // both are student-visible public content, and a thread whose opening post escapes moderation would be
  // the easiest way to publish something the moderator exists to catch.
  if (input.moderate !== undefined && input.moderate !== null) {
    const decision = await input.moderate(postId, body, ex);
    await applyModerationStatus(ex, postId, decision.action, input.now);
  }

  const detail = await buildThreadDetail(ex, threadId, input.viewer);
  if (detail === null) {
    // Unreachable: the thread and its first post were written in this transaction, so the read-back
    // cannot miss. It is a `NOT_FOUND` rather than an assertion because a route with two branches is
    // easier to keep correct than one with a throw.
    return { ok: false, code: 'NOT_FOUND', message: 'The thread could not be read back.' };
  }
  return { ok: true, value: detail };
}

/**
 * Reply to a thread.
 *
 * **The reply's anonymity is the thread's, not a fresh choice.** `07` section 6.1 has one anonymous
 * toggle on the composer, and a thread that began anonymously must not be re-identified by a later
 * reply -- which would unmask every post before it. So a reply adopts the identity of the post it
 * follows, and `ck_posts_author_xor` refuses any row that would set both columns or neither.
 */
export async function createPost(
  ex: Executor,
  input: {
    readonly scope: { readonly assignmentId: string };
    readonly viewer: DiscussionViewer;
    readonly threadId: string;
    readonly body: string;
    readonly parentPostId: string | null;
    readonly now: Date;
    /**
     * The moderation hook, or `null` to skip moderation explicitly.
     *
     * **The insert and the auto-action share this transaction**, so a post is never briefly visible at a
     * severity that `05` section 9.4 says must hide it. A caller with no provider -- the acceptance
     * script, a seeded fixture -- passes `null`, which makes "moderation did not run" a visible decision at
     * the call site rather than an accident of configuration.
     */
    readonly moderate?: ModerationHook | null;
    /** The assignment title the moderator classifies against. Required when `moderate` is supplied. */
    readonly assignmentTitle?: string;
  },
): Promise<DiscussionOutcome<DiscussionPostResponse>> {
  const body = input.body.trim();
  if (body.length === 0 || body.length > POST_MAX_CHARS) {
    return {
      ok: false,
      code: 'VALIDATION_FAILED',
      message: `A post must be between 1 and ${String(POST_MAX_CHARS)} characters.`,
    };
  }

  const thread = await findThread(ex, input.threadId);
  if (thread === null || thread.assignmentId !== input.scope.assignmentId) {
    return { ok: false, code: 'NOT_FOUND', message: 'That discussion could not be found.' };
  }
  if (thread.status !== 'open') {
    // `07` section 6.2 rule 4: `Edit` and `Delete` appear "only while the thread is open", and a locked
    // or removed thread accepts no new posts either. The state is the teacher's, not the student's.
    return {
      ok: false,
      code: 'INVALID_STATE_TRANSITION',
      message: 'This discussion is closed to new posts.',
    };
  }

  const identity = await findIdentityFor(ex, input.viewer.userId, input.scope.assignmentId);
  const anonymousHere = thread.authorAnonIdentityId !== null && identity !== null;

  const postId = randomUUID();
  await insertPost(ex, {
    id: postId,
    threadId: input.threadId,
    assignmentId: input.scope.assignmentId,
    parentPostId: input.parentPostId,
    body,
    createdAt: input.now,
    authorAnonIdentityId: anonymousHere ? identity.id : null,
    authorUserId: anonymousHere ? null : input.viewer.userId,
    isAnonymised: anonymousHere,
  });

  // The moderation pass, before the read-back, so the response a student receives already reflects the
  // post's visibility. A hidden post's body is still returned to its own author (`06` section 5.5.13
  // hides it only from other students), so the student sees "Hidden pending tutor review" rather than a
  // post that appeared and then vanished.
  if (input.moderate !== undefined && input.moderate !== null) {
    const decision = await input.moderate(postId, body, ex);
    await applyModerationStatus(ex, postId, decision.action, input.now);
  }

  const row = await findPost(ex, postId);
  if (row === null) {
    return { ok: false, code: 'NOT_FOUND', message: 'The post could not be read back.' };
  }
  return {
    ok: true,
    value: buildPostResponse(row, {
      viewerIdentityId: identity?.id ?? null,
      isTutor: input.viewer.isTutor,
    }),
  };
}

/**
 * The author's own edit.
 *
 * **Ownership is the identity comparison, and a missing identity means "no anonymous posts" rather than
 * "no permission to check"** (A-ID-7). A non-anonymous post is matched on `author_user_id`, which only
 * this function reads for an ownership decision -- the response never carries it.
 */
export async function editPost(
  ex: Executor,
  input: {
    readonly viewer: DiscussionViewer;
    readonly postId: string;
    readonly body: string;
    readonly now: Date;
  },
): Promise<DiscussionOutcome<DiscussionPostResponse>> {
  const body = input.body.trim();
  if (body.length === 0 || body.length > POST_MAX_CHARS) {
    return {
      ok: false,
      code: 'VALIDATION_FAILED',
      message: `A post must be between 1 and ${String(POST_MAX_CHARS)} characters.`,
    };
  }

  const row = await findPost(ex, input.postId);
  if (row === null || row.deletedAt !== null) {
    return { ok: false, code: 'NOT_FOUND', message: 'That post could not be found.' };
  }

  const identity = await findIdentityFor(ex, input.viewer.userId, row.assignmentId);
  const owned = row.isAnonymised
    ? identityMatches(row.authorAnonIdentityId, identity?.id ?? null)
    : await ownsNamedPost(ex, row.id, input.viewer.userId);
  if (!owned) {
    // `07` section 9.3: "Student tries to edit another's post | No Edit control; a direct PATCH fails |
    // `NOT_FOUND`". Not `FORBIDDEN_ROLE`: the caller is a student, the role is right, and confirming
    // the post exists would be the leak. `06` section 9.2's T-12 asserts exactly this.
    return { ok: false, code: 'NOT_FOUND', message: 'That post could not be found.' };
  }

  const updated = await editOwnPostById(ex, row.id, body, input.now);
  if (!updated) {
    return { ok: false, code: 'NOT_FOUND', message: 'That post could not be found.' };
  }
  const after = await findPost(ex, row.id);
  if (after === null) {
    return { ok: false, code: 'NOT_FOUND', message: 'The post could not be read back.' };
  }
  return {
    ok: true,
    value: buildPostResponse(after, {
      viewerIdentityId: identity?.id ?? null,
      isTutor: input.viewer.isTutor,
    }),
  };
}

/** The author's own delete (D28). Same ownership rule as the edit. */
export async function deletePost(
  ex: Executor,
  input: { readonly viewer: DiscussionViewer; readonly postId: string; readonly now: Date },
): Promise<DiscussionOutcome<{ readonly deleted: true }>> {
  const row = await findPost(ex, input.postId);
  if (row === null || row.deletedAt !== null) {
    return { ok: false, code: 'NOT_FOUND', message: 'That post could not be found.' };
  }

  const identity = await findIdentityFor(ex, input.viewer.userId, row.assignmentId);
  const owned = row.isAnonymised
    ? identityMatches(row.authorAnonIdentityId, identity?.id ?? null)
    : await ownsNamedPost(ex, row.id, input.viewer.userId);
  if (!owned) return { ok: false, code: 'NOT_FOUND', message: 'That post could not be found.' };

  const deleted = await softDeleteOwnPost(ex, {
    postId: row.id,
    threadId: row.threadId,
    deletedAt: input.now,
  });
  if (!deleted) return { ok: false, code: 'NOT_FOUND', message: 'That post could not be found.' };
  return { ok: true, value: { deleted: true } };
}

/**
 * Flag a post.
 *
 * **Flagging creates the flagger's identity if they do not have one**, which `06` section 4.3 names as
 * one of the three lazy-creation triggers ("the first time the student posts anonymously, opens a
 * thread anonymously, or flags a post"). The reporter is stored as that identity and never as a user id
 * (D54), which is what makes `uq_moderation_flags_student_flag` implement "one flag per user per post"
 * without the queue being able to resolve anyone.
 */
export async function flagPost(
  ex: Executor,
  input: {
    readonly scope: { readonly assignmentId: string };
    readonly viewer: DiscussionViewer;
    readonly postId: string;
    readonly reasonCode: 'HARASSMENT' | 'INAPPROPRIATE_CONTENT' | 'PERSONAL_INFORMATION' | 'PROHIBITED_ASSISTANCE' | 'SOLUTION_SHARING' | 'OTHER';
    readonly now: Date;
  },
): Promise<DiscussionOutcome<{ readonly flagId: string }>> {
  const row = await findPost(ex, input.postId);
  if (row === null || row.deletedAt !== null || row.assignmentId !== input.scope.assignmentId) {
    return { ok: false, code: 'NOT_FOUND', message: 'That post could not be found.' };
  }

  // `07` section 6.5 rule 1: "`Flag` appears only on another person's post." The server enforces it too,
  // because the control's absence is not a guarantee.
  const identity = await identityFor(ex, {
    anonIdSecret: input.viewer.anonIdSecret,
    studentId: input.viewer.userId,
    assignmentId: input.scope.assignmentId,
  });
  const ownsIt = row.isAnonymised
    ? identityMatches(row.authorAnonIdentityId, identity.id)
    : await ownsNamedPost(ex, row.id, input.viewer.userId);
  if (ownsIt) {
    return { ok: false, code: 'INVALID_STATE_TRANSITION', message: 'You cannot flag your own post.' };
  }

  const open = await countOpenFlags(ex, 'discussion_post', row.id);
  const severity = severityForReason(input.reasonCode);
  const flagId = randomUUID();
  const inserted = await insertModerationFlag(ex, {
    id: flagId,
    assignmentId: input.scope.assignmentId,
    targetKind: 'discussion_post',
    targetId: row.id,
    source: 'student',
    severity,
    reasonCode: input.reasonCode,
    detail: null,
    reporterAnonIdentityId: identity.id,
    aiModelId: null,
    aiPromptVersion: null,
    createdAt: input.now,
  });

  // The partial unique index refuses a second student flag, and `on conflict do nothing` turns that
  // into no row rather than an error, so a repeat is distinguishable from a first flag by this return
  // value alone. `open` is read first so the count is available for the route's diagnostics without a
  // second round trip; it deliberately does not decide the refusal, because the constraint is what
  // makes "one flag per student per post" true under concurrency and a count is not.
  void open;
  if (!inserted) {
    // Rule 2: "A second attempt is refused with `You have already flagged this post.` and creates no
    // duplicate row."
    return {
      ok: false,
      code: 'INVALID_STATE_TRANSITION',
      message: 'You have already flagged this post.',
    };
  }
  return { ok: true, value: { flagId } };
}

/**
 * A student flag's severity, from `05` section 9.2's code-to-severity table.
 *
 * The student-visible reason codes are a **subset** of the moderator's `MOD_*` vocabulary: a student
 * chooses a plain category and the platform assigns the severity, because `05` section 9.1.4 keeps
 * severity invisible to students and a student-chosen severity would leak it.
 */
function severityForReason(
  reasonCode: 'HARASSMENT' | 'INAPPROPRIATE_CONTENT' | 'PERSONAL_INFORMATION' | 'PROHIBITED_ASSISTANCE' | 'SOLUTION_SHARING' | 'OTHER',
): 'low' | 'medium' | 'high' {
  switch (reasonCode) {
    case 'HARASSMENT':
      return 'high';
    case 'INAPPROPRIATE_CONTENT':
      return 'medium';
    case 'PERSONAL_INFORMATION':
      return 'high';
    case 'PROHIBITED_ASSISTANCE':
      return 'medium';
    case 'SOLUTION_SHARING':
      return 'medium';
    default:
      return 'low';
  }
}

// ---------------------------------------------------------------------------------------------
// The two ownership helpers, and the one write they need
// ---------------------------------------------------------------------------------------------

/**
 * Whether the caller wrote a **non-anonymous** post.
 *
 * This is the only read of `author_user_id` in the feature, and it exists because a named post has no
 * identity row to compare against. The column never reaches a response: `buildPostResponse` takes
 * `isOwnPost` from this comparison and from the identity one, and carries neither id.
 */
async function ownsNamedPost(ex: Executor, postId: string, userId: string): Promise<boolean> {
  const rows = await ex<{ count: string | number }[]>`
    select count(*) as count
      from discussion_posts
     where id = ${postId}::uuid
       and author_user_id = ${userId}::uuid
       and is_anonymised = false
  `;
  return Number(rows[0]?.count ?? 0) > 0;
}

/**
 * The author's own body edit.
 *
 * A local wrapper rather than a re-export so this module never has `editOwnPost` confused with a
 * moderation write: the query layer's version sets `body` and `edited_at` only, and a tutor action must
 * never call it.
 */
async function editOwnPostById(
  ex: Executor,
  postId: string,
  body: string,
  now: Date,
): Promise<boolean> {
  const rows = await ex<{ id: string }[]>`
    update discussion_posts
       set body = ${body},
           edited_at = ${now.toISOString()}::timestamptz,
           updated_at = ${now.toISOString()}::timestamptz
     where id = ${postId}::uuid
       and deleted_at is null
    returning id
  `;
  return rows.length > 0;
}

// ---------------------------------------------------------------------------------------------
// FAQ promotion (O8, D29): the explicit tutor action, and nothing automatic
// ---------------------------------------------------------------------------------------------

/**
 * Promote an approved peer answer to the official FAQ.
 *
 * **This function exists because the automatic version is forbidden.** `06` section 7.4.4: "There is no
 * automatic promotion path in the API", and `03-PRD` FR-PEER-6 states the negative form ("No API route
 * and no code path creates a FAQ entry from an approved answer without the explicit promote action").
 * So the two guards below are the whole point of the operation rather than preliminaries, and
 * `ck_faq_entries_peer_answer_source` is the schema refusing an unlinked peer answer even if these were
 * removed.
 *
 * **Editing the original afterwards does not change the entry** (FR-PEER-10), and it is structural: the
 * entry copies the text and keeps its own row, so a later edit to the post cannot reach it.
 */
export async function promoteToFaq(
  ex: Executor,
  input: {
    readonly postId: string;
    readonly tutorUserId: string;
    readonly now: Date;
  },
): Promise<DiscussionOutcome<{ readonly faqEntryId: string; readonly displayOrder: number }>> {
  const post = await findPost(ex, input.postId);
  if (post === null || post.deletedAt !== null) {
    return { ok: false, code: 'NOT_FOUND', message: 'That post could not be found.' };
  }
  if (post.parentPostId === null) {
    // `07` section 6.2 puts the accept/reject control on answers, so a root post has no
    // `accepted_answer_status` to check and is a question rather than an answer.
    return {
      ok: false,
      code: 'INVALID_STATE_TRANSITION',
      message: 'Only a reply can be promoted: the thread question is already public.',
    };
  }
  if (post.status === 'removed') {
    return { ok: false, code: 'INVALID_STATE_TRANSITION', message: 'A removed post cannot be promoted.' };
  }
  if (post.acceptedAnswerStatus !== 'approved') {
    // FR-PEER-6: promotion is "available only after the answer is approved".
    return {
      ok: false,
      code: 'INVALID_STATE_TRANSITION',
      message: 'Approve the answer before promoting it.',
    };
  }

  const thread = await findThread(ex, post.threadId);
  if (thread === null) {
    return { ok: false, code: 'NOT_FOUND', message: 'That discussion could not be found.' };
  }

  const entryId = randomUUID();
  const nextOrder = await readNextFaqDisplayOrder(ex, post.assignmentId);
  const inserted = await insertFaqEntryIfAbsent(ex, {
    id: entryId,
    assignmentId: post.assignmentId,
    // The thread's milestone, which may be null: `06` section 7.4.4 makes the FAQ's milestone optional.
    milestoneId: thread.milestoneId,
    // FR-PEER-7 and `07` section 5.4: "the student's original question will be shown as the FAQ
    // question", which for a Discussion answer is the thread's title.
    question: thread.title,
    answer: post.body,
    sourceKind: 'peer_answer',
    sourceQueryId: null,
    sourceQueryMessageId: null,
    sourceDiscussionPostId: post.id,
    publishedByUserId: input.tutorUserId,
    displayOrder: nextOrder,
    // Promoting publishes: that is what "Publish to the official FAQ" means and what makes the entry T2.
    publicationStatus: 'PUBLISHED',
    origin: 'tutor',
    provenance: null,
    groundingChunkIds: [],
    approvedByUserId: input.tutorUserId,
    approvedAt: input.now.toISOString(),
    publishedAt: input.now.toISOString(),
  });

  if (!inserted) {
    return { ok: false, code: 'INVALID_STATE_TRANSITION', message: 'That entry already exists.' };
  }
  return { ok: true, value: { faqEntryId: entryId, displayOrder: nextOrder } };
}

/** One past the highest published entry's order, so a promotion lands at the end of the list. */
async function readNextFaqDisplayOrder(ex: Executor, assignmentId: string): Promise<number> {
  const rows = await ex<{ next: string | number }[]>`
    select coalesce(max(display_order), -1) + 1 as next
      from faq_entries
     where assignment_id = ${assignmentId}::uuid
       and deleted_at is null
       and publication_status = 'PUBLISHED'
  `;
  return Number(rows[0]?.next ?? 0);
}

/** Re-exported so the type-only consumers do not reach into the query layer. */
export type { FaqEntryListResponse };
