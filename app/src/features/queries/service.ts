/**
 * The private Query thread: `06-DATA-MODEL.md` sections 5.5.12 and 7.4.1-7.4.4, `07-UI-UX-SPEC` section 5.
 *
 * **A Query is private and always attributed (D24, D50), and it is where the two anonymity rules meet.**
 * A student may be anonymous in a Discussion and never in a Query, so this module resolves a display
 * name for every message and never consults an identity. It therefore shares nothing with
 * `features/discussion/service.ts` -- not an author builder, not a viewer -- which is what keeps the
 * Discussion side's A-ID-2 isolation provable (`tests/discussion/imports.test.ts` asserts the identity
 * module has exactly one reader, and this feature is not it).
 *
 * **The state machine is small and every edge has an owner.** `open -> answered` happens when a tutor
 * replies (the reply is what answers it, not a separate action); `answered -> resolved` is the
 * **student's** action (`POST .../resolve`), because only the asker knows the answer worked;
 * `-> closed` is a tutor's archive. The guards are on the previous status, so two concurrent replies
 * collapse to one transition rather than a lost update.
 *
 * **Publishing a reply as a FAQ entry is a second, explicit tutor action (D24, O8).** `07` section 5.4:
 * "Saving an edit to a reply that has been published as a FAQ entry **withdraws** the entry from student
 * view." That rule is why `question`/`answer` are *copied* here rather than referenced live: the entry
 * owns its text, and the withdraw is a status change on the entry rather than an edit that follows the
 * message.
 */

import { randomUUID } from 'node:crypto';

import type {
  FaqEntryResponse,
  QueryListResponse,
  QueryMessageResponse,
  QueryThreadResponse,
  TutorQueryGroupListResponse,
} from '@/lib/api/types';
import type { Executor } from '@/lib/db/queries/courses';
import {
  appendQueryMessage,
  createQuery as insertQuery,
  insertFaqEntryIfAbsent,
} from '@/lib/db/queries/questions';
import {
  attachMilestoneIfPublished,
  findQuery,
  findQueryScope,
  listMilestoneTitles,
  listQueriesForStudent,
  listQueriesForTutor,
  listQueryMessages,
  setQueryStatus,
  type QueryRow,
  type QueryStatusRow,
} from '@/lib/db/queries/query-threads';

/** `06` section 5.6: a Query body is 1..4000 characters, a subject 1..200. */
export const QUERY_BODY_MAX_CHARS = 4000;
export const QUERY_SUBJECT_MAX_CHARS = 200;
/** `06` section 5.6: ten new Query threads per assignment per student per hour. */
export const QUERIES_PER_HOUR = 10;

export interface QueryViewer {
  readonly userId: string;
  readonly anonIdSecret: string;
}

export type QueryOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly code:
        | 'NOT_FOUND'
        | 'VALIDATION_FAILED'
        | 'RATE_LIMITED'
        | 'INVALID_STATE_TRANSITION'
        | 'FORBIDDEN_ROLE';
      readonly message: string;
    };

// ---------------------------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------------------------

function listItemOf(row: QueryRow): QueryListResponse['items'][number] {
  return {
    id: row.id,
    subject: row.subject,
    status: row.status,
    milestoneId: row.milestoneId,
    createdAt: row.createdAt,
    lastMessageAt: row.lastMessageAt,
    messageCount: row.messageCount,
    hasTutorReply: row.status === 'answered' || row.status === 'resolved',
  };
}

/**
 * The student's own threads (`06` section 5.5.12's `QueryListResponse`).
 *
 * `hasTutorReply` is derived from the **status** rather than counted. `open -> answered` is set by the
 * first tutor reply and never cleared, so it is the durable record; a count of tutor-role messages would
 * be a second derivation of the same fact and could disagree with the list a student already sees.
 */
export async function buildStudentQueryList(
  ex: Executor,
  assignmentId: string,
  viewer: QueryViewer,
): Promise<QueryListResponse> {
  const rows = await listQueriesForStudent(ex, assignmentId, viewer.userId);
  return { items: rows.map(listItemOf) };
}

/**
 * One thread with its messages (`06` section 5.5.12's `QueryThreadResponse`).
 *
 * **`authorDisplayName` is the tutor's or the student's real name, and that is the contract.** There is
 * no `isAnonymised` here and no identity lookup: a private Query is always attributed, which is what
 * makes it a tutor's tool rather than a discussion (D24, D50).
 */
export async function buildQueryThread(
  ex: Executor,
  queryId: string,
): Promise<QueryThreadResponse | null> {
  const query = await findQuery(ex, queryId);
  if (query === null) return null;
  const messages = await listQueryMessages(ex, queryId);
  return {
    id: query.id,
    assignmentId: query.assignmentId,
    subject: query.subject,
    milestoneId: query.milestoneId,
    status: query.status,
    createdAt: query.createdAt,
    resolvedAt: query.resolvedAt,
    messages: messages.map((message) => ({
      id: message.id,
      authorRole: message.authorRole,
      authorDisplayName: message.authorDisplayName,
      body: message.body,
      createdAt: message.createdAt,
      publishedAsFaqEntryId: message.publishedAsFaqEntryId,
    })),
  };
}

/**
 * The tutor's queue, grouped by approved Milestone (`06` section 5.5.12's `TutorQueryGroupListResponse`).
 *
 * **Grouping is `'milestone'` and the label is T3.** `06` section 5.5.12 fixes the one value because
 * topic clustering is out of scope in the MVP (`02` section 2.4), so the reserved `topic_label` columns
 * on `queries` are deliberately never populated by this read. `labelSource: 'milestone'` and
 * `truthTier: 'T3'` are literal because the label is the tutor-approved Milestone title and nothing else.
 *
 * **A thread without a milestone gets its own group rather than being dropped.** `06` section 5.5.12
 * requires the item and a tutor who cannot see an open question is worse off than one who sees it under
 * a heading they did not choose, so the group key is the empty string with an explicit label.
 */
export async function buildTutorQueryGroups(
  ex: Executor,
  assignmentId: string,
): Promise<TutorQueryGroupListResponse> {
  const [queries, titles] = await Promise.all([
    listQueriesForTutor(ex, assignmentId),
    listMilestoneTitles(ex, assignmentId),
  ]);

  const groups = new Map<string, QueryListResponse['items']>();
  for (const query of queries) {
    const key = query.milestoneId ?? '';
    const bucket = groups.get(key);
    if (bucket === undefined) groups.set(key, [listItemOf(query)]);
    else bucket.push(listItemOf(query));
  }

  return {
    grouping: 'milestone',
    items: [...groups.entries()].map(([groupKey, items]) => ({
      groupKey,
      label: groupKey === '' ? 'No milestone' : (titles.get(groupKey) ?? 'Unknown milestone'),
      labelSource: 'milestone',
      truthTier: 'T3',
      queryCount: items.length,
      openCount: items.filter((item) => item.status === 'open').length,
      queries: items,
    })),
  };
}

// ---------------------------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------------------------

/** Whether this student owns the thread. `null` is `NOT_FOUND`. */
export async function ownsQuery(
  ex: Executor,
  queryId: string,
  viewer: QueryViewer,
): Promise<boolean> {
  const rows = await ex<{ id: string }[]>`
    select id
      from queries
     where id = ${queryId}::uuid
       and student_id = ${viewer.userId}::uuid
     limit 1
  `;
  return rows.length > 0;
}

/**
 * The **student's** resolve (`POST /api/student/queries/{queryId}/resolve`).
 *
 * The owner matters: `06` section 5.4 puts `resolve` on the student's path and `07` section 5.4's control
 * is the asker's, because only they know whether the answer worked. The status must already be
 * `answered` -- resolving an unanswered question would record a conclusion no tutor contributed to.
 *
 * A thread that is not this student's is `NOT_FOUND` rather than `FORBIDDEN_ROLE`: the role is right and
 * confirming the thread exists would tell one student that another student's thread id is real
 * (`06` section 5.2 rule 3 scopes `FORBIDDEN_ROLE` to a wrong *role*, and `06` section 9.2's T-12 asserts
 * `NOT_FOUND` for the sibling case).
 */
export async function resolveOwnQuery(
  ex: Executor,
  input: { readonly queryId: string; readonly viewer: QueryViewer; readonly now: Date },
): Promise<QueryOutcome<QueryThreadResponse>> {
  const owned = await ownedQueryStatus(ex, input.queryId, input.viewer);
  if (owned === null) {
    return { ok: false, code: 'NOT_FOUND', message: 'That question could not be found.' };
  }
  if (owned === 'closed') {
    return { ok: false, code: 'INVALID_STATE_TRANSITION', message: 'This question is closed.' };
  }
  if (owned !== 'answered') {
    return {
      ok: false,
      code: 'INVALID_STATE_TRANSITION',
      message: 'A question can be resolved once a tutor has replied.',
    };
  }

  const moved = await setQueryStatus(ex, {
    queryId: input.queryId,
    status: 'resolved',
    expected: 'answered',
    resolvedAt: input.now,
  });
  if (!moved) {
    // The guard failed, which means another request moved it between the read and the write.
    return {
      ok: false,
      code: 'INVALID_STATE_TRANSITION',
      message: 'This question changed while you were resolving it. Reload and try again.',
    };
  }

  const thread = await buildQueryThread(ex, input.queryId);
  if (thread === null) {
    return { ok: false, code: 'NOT_FOUND', message: 'The question could not be read back.' };
  }
  return { ok: true, value: thread };
}

/**
 * This student's status on their own thread, or `null` when the thread is not theirs.
 *
 * The ownership filter is in the SQL and takes `viewer.userId` from the session, so a route cannot pass
 * a client-supplied student id through this function ("No endpoint accepts a student id from the client",
 * `06` section 5.2 rule 4).
 */
async function ownedQueryStatus(
  ex: Executor,
  queryId: string,
  viewer: QueryViewer,
): Promise<QueryStatusRow | null> {
  const rows = await ex<{ status: string }[]>`
    select status
      from queries
     where id = ${queryId}::uuid
       and student_id = ${viewer.userId}::uuid
     limit 1
  `;
  return (rows[0]?.status as QueryStatusRow | undefined) ?? null;
}

/** The assignment a thread belongs to, **without an ownership filter**, so a tutor route can gate. */
export async function resolveQueryAssignment(
  ex: Executor,
  queryId: string,
): Promise<string | null> {
  const scope = await findQueryScope(ex, queryId);
  return scope?.assignmentId ?? null;
}

/**
 * Open a Query, with its first message, in one transaction.
 *
 * **The subject is optional and the first message is not.** `06` section 5.5.12 types `subject` as
 * `string | null`; `07` section 5.1's composer asks for the question, and a subject is the optional
 * short label a student adds. A thread with no subject is listed under its first message's opening
 * words by the UI, which is a presentation decision this layer does not make.
 */
export async function openQuery(
  ex: Executor,
  input: {
    readonly assignmentId: string;
    readonly viewer: QueryViewer;
    readonly subject: string | null;
    readonly body: string;
    readonly milestoneId: string | null;
    readonly now: Date;
  },
): Promise<QueryOutcome<QueryThreadResponse>> {
  const body = input.body.trim();
  if (body.length === 0 || body.length > QUERY_BODY_MAX_CHARS) {
    return {
      ok: false,
      code: 'VALIDATION_FAILED',
      message: `Your question must be between 1 and ${String(QUERY_BODY_MAX_CHARS)} characters.`,
    };
  }
  const subject = input.subject?.trim() ?? null;
  if (subject !== null && (subject.length === 0 || subject.length > QUERY_SUBJECT_MAX_CHARS)) {
    return {
      ok: false,
      code: 'VALIDATION_FAILED',
      message: `A subject must be between 1 and ${String(QUERY_SUBJECT_MAX_CHARS)} characters.`,
    };
  }

  // `06` section 5.6's ten-per-hour limit. Counted on `queries.student_id`, which is a real column here
  // because a Query is identity-bearing (reading A1) -- unlike the Discussion limit, which has only an
  // identity column available.
  const recent = await ex<{ count: string | number }[]>`
    select count(*) as count
      from queries
     where assignment_id = ${input.assignmentId}::uuid
       and student_id = ${input.viewer.userId}::uuid
       and created_at >= ${new Date(input.now.getTime() - 60 * 60 * 1000).toISOString()}::timestamptz
  `;
  if (Number(recent[0]?.count ?? 0) >= QUERIES_PER_HOUR) {
    return {
      ok: false,
      code: 'RATE_LIMITED',
      message: 'You have opened a lot of questions in the last hour. Try again shortly.',
    };
  }

  const queryId = randomUUID();
  const created = await insertQuery(ex, {
    id: queryId,
    assignmentId: input.assignmentId,
    studentId: input.viewer.userId,
    milestoneId: input.milestoneId,
    requirementNodeId: null,
    subject,
    createdAt: input.now,
    anonIdSecret: input.viewer.anonIdSecret,
  });
  if (!created) {
    return { ok: false, code: 'INVALID_STATE_TRANSITION', message: 'That question already exists.' };
  }

  await appendQueryMessage(ex, {
    id: randomUUID(),
    queryId,
    assignmentId: input.assignmentId,
    authorRole: 'student',
    authorUserId: input.viewer.userId,
    body,
    createdAt: input.now,
    // The first message leaves the thread `open`: a tutor reply is what makes it `answered`.
    statusAfter: 'open',
  });

  const thread = await buildQueryThread(ex, queryId);
  if (thread === null) {
    return { ok: false, code: 'NOT_FOUND', message: 'The question could not be read back.' };
  }
  return { ok: true, value: thread };
}

/**
 * Append a student's follow-up message.
 *
 * **A `closed` thread accepts nothing** and a `resolved` one does not reopen on a message: `07` section 5
 * gives the student an explicit `Reopen` control, and letting a message silently reopen would make the
 * status a poor record of what happened. `answered` does return to `open`, because a follow-up question is
 * a new question for the tutor.
 */
export async function addStudentMessage(
  ex: Executor,
  input: {
    readonly queryId: string;
    readonly assignmentId: string;
    readonly viewer: QueryViewer;
    readonly body: string;
    readonly now: Date;
  },
): Promise<QueryOutcome<QueryMessageResponse>> {
  const body = input.body.trim();
  if (body.length === 0 || body.length > QUERY_BODY_MAX_CHARS) {
    return {
      ok: false,
      code: 'VALIDATION_FAILED',
      message: `Your message must be between 1 and ${String(QUERY_BODY_MAX_CHARS)} characters.`,
    };
  }

  const query = await findQuery(ex, input.queryId);
  if (query === null) {
    return { ok: false, code: 'NOT_FOUND', message: 'That question could not be found.' };
  }
  if (query.status === 'closed') {
    return {
      ok: false,
      code: 'INVALID_STATE_TRANSITION',
      message: 'This question is closed. Ask a new one instead.',
    };
  }

  const messageId = randomUUID();
  const statusAfter: QueryStatusRow = query.status === 'answered' ? 'open' : query.status;
  await appendQueryMessage(ex, {
    id: messageId,
    queryId: input.queryId,
    assignmentId: input.assignmentId,
    authorRole: 'student',
    authorUserId: input.viewer.userId,
    body,
    createdAt: input.now,
    statusAfter,
  });

  return {
    ok: true,
    value: {
      id: messageId,
      queryId: input.queryId,
      authorRole: 'student',
      authorDisplayName: await displayNameOf(ex, input.viewer.userId),
      body,
      createdAt: input.now.toISOString(),
      publishedAsFaqEntryId: null,
    },
  };
}

/**
 * A tutor's reply, which is also what moves the thread to `answered`.
 *
 * **The status transition and the message share one transaction**, and the status write is guarded on
 * the status it read, so two tutors replying at once produce one `answered` transition and two messages
 * rather than one lost update. `open -> answered` in the same statement is trap **T7**'s rule applied to
 * queries: the state change and its cause are written together.
 */
export async function addTutorReply(
  ex: Executor,
  input: {
    readonly queryId: string;
    readonly assignmentId: string;
    readonly tutorUserId: string;
    readonly body: string;
    readonly now: Date;
  },
): Promise<QueryOutcome<QueryMessageResponse>> {
  const body = input.body.trim();
  if (body.length === 0 || body.length > QUERY_BODY_MAX_CHARS) {
    return {
      ok: false,
      code: 'VALIDATION_FAILED',
      message: `A reply must be between 1 and ${String(QUERY_BODY_MAX_CHARS)} characters.`,
    };
  }

  const query = await findQuery(ex, input.queryId);
  if (query === null) {
    return { ok: false, code: 'NOT_FOUND', message: 'That question could not be found.' };
  }
  if (query.status === 'closed') {
    return {
      ok: false,
      code: 'INVALID_STATE_TRANSITION',
      message: 'This question is closed.',
    };
  }

  const messageId = randomUUID();
  await appendQueryMessage(ex, {
    id: messageId,
    queryId: input.queryId,
    assignmentId: input.assignmentId,
    authorRole: 'tutor',
    authorUserId: input.tutorUserId,
    body,
    createdAt: input.now,
    // A tutor reply answers the question unless it was already resolved; a resolved thread stays
    // resolved, because a tutor adding context does not un-answer the student's own conclusion.
    statusAfter: query.status === 'open' ? 'answered' : query.status,
  });

  return {
    ok: true,
    value: {
      id: messageId,
      queryId: input.queryId,
      authorRole: 'tutor',
      authorDisplayName: await displayNameOf(ex, input.tutorUserId),
      body,
      createdAt: input.now.toISOString(),
      publishedAsFaqEntryId: null,
    },
  };
}

/**
 * Publish a tutor reply as an official FAQ entry (`POST /api/tutor/queries/{queryId}/publish`).
 *
 * **This is the explicit promotion D24 and O8 require, and the answer is copied rather than linked for
 * the edit rule.** `07` section 5.4: "Publishing a reply as a FAQ entry is an explicit tutor action" and
 * "Saving an edit to a reply that has been published as a FAQ entry **withdraws** the entry from student
 * view" -- so the entry owns a copy of the text, and the withdraw is a separate status change on the
 * entry. `source_query_message_id` keeps the provenance checkable without making the entry live.
 *
 * **The question shown is the Query's own.** `06` section 5.5.12 gives the thread a `subject`, and
 * `source_kind = 'query_reply'` is what distinguishes this path from a promoted peer answer.
 */
export async function publishReplyAsFaq(
  ex: Executor,
  input: {
    readonly queryId: string;
    readonly messageId: string;
    readonly tutorUserId: string;
    readonly now: Date;
  },
): Promise<QueryOutcome<{ readonly entry: FaqEntryResponse }>> {
  const query = await findQuery(ex, input.queryId);
  if (query === null) {
    return { ok: false, code: 'NOT_FOUND', message: 'That question could not be found.' };
  }

  const messages = await listQueryMessages(ex, input.queryId);
  const message = messages.find((candidate) => candidate.id === input.messageId);
  if (message === undefined) {
    return { ok: false, code: 'NOT_FOUND', message: 'That reply could not be found.' };
  }
  if (message.authorRole !== 'tutor') {
    // `07` section 5.4: publishing is "available on a tutor reply". A student's own words becoming the
    // cohort's answer would put unapproved student text in front of everyone, which is the C3 shape of
    // failure even though the text is a question rather than AI output.
    return {
      ok: false,
      code: 'INVALID_STATE_TRANSITION',
      message: 'Only a tutor reply can be published as a FAQ entry.',
    };
  }
  if (message.publishedAsFaqEntryId !== null) {
    return {
      ok: false,
      code: 'INVALID_STATE_TRANSITION',
      message: 'That reply is already published as a FAQ entry.',
    };
  }

  const entryId = randomUUID();
  const nextOrder = await readNextDisplayOrder(ex, query.assignmentId);
  const inserted = await insertFaqEntryIfAbsent(ex, {
    id: entryId,
    assignmentId: query.assignmentId,
    milestoneId: query.milestoneId,
    question: query.subject ?? 'Question from your cohort',
    answer: message.body,
    sourceKind: 'query_reply',
    sourceQueryId: query.id,
    sourceQueryMessageId: message.id,
    publishedByUserId: input.tutorUserId,
    displayOrder: nextOrder,
    publicationStatus: 'PUBLISHED',
    // `origin` is `tutor`, not `ai`: a tutor wrote the answer, so the C3 provenance rules for an
    // AI-generated artifact do not apply and there is no `provenance` blob to record.
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

  return {
    ok: true,
    value: {
      entry: {
        id: entryId,
        assignmentId: query.assignmentId,
        milestoneId: query.milestoneId,
        question: query.subject ?? 'Question from your cohort',
        answer: message.body,
        sourceKind: 'query_reply',
        publicationStatus: 'PUBLISHED',
        isPublished: true,
        displayOrder: nextOrder,
        createdAt: input.now.toISOString(),
        publishedAt: input.now.toISOString(),
        revision: 1,
      },
    },
  };
}

/**
 * Attach a Milestone to a Query, for a student who picked one after posting.
 *
 * A draft milestone is refused (`attachMilestoneIfPublished` joins on `PUBLISHED`), because
 * `06` section 5.5.12's group labels are approved milestone titles and an unpublished one would produce
 * a group heading the tutor was never shown.
 */
export async function attachMilestone(
  ex: Executor,
  input: { readonly queryId: string; readonly assignmentId: string; readonly milestoneId: string },
): Promise<boolean> {
  return attachMilestoneIfPublished(ex, input);
}

/** The display name for a just-created message. A reply's author is always a real user. */
async function displayNameOf(ex: Executor, userId: string): Promise<string> {
  const rows = await ex<{ display_name: string }[]>`
    select display_name from users where id = ${userId}::uuid limit 1
  `;
  return rows[0]?.display_name ?? 'Unknown';
}

/** One past the highest published entry's order. */
async function readNextDisplayOrder(ex: Executor, assignmentId: string): Promise<number> {
  const rows = await ex<{ next: string | number }[]>`
    select coalesce(max(display_order), -1) + 1 as next
      from faq_entries
     where assignment_id = ${assignmentId}::uuid
       and deleted_at is null
       and publication_status = 'PUBLISHED'
  `;
  return Number(rows[0]?.next ?? 0);
}
