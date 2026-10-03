/**
 * Queries and FAQ: `queries`, `query_messages`, `faq_entries`
 * (`06` sections 7.4.1, 7.4.2, 7.4.4; migration `0006_queries_faq.sql`).
 *
 * `faq_entries` lives here because `06` section 7.4 groups it with the private Query thread: the
 * FAQ entry is the promoted, shared form of a tutor reply, and `source_query_id` /
 * `source_query_message_id` are the record of that promotion. Nothing in this module promotes
 * automatically (D29, O8): the caller decides that an entry is published, and the FK is what makes
 * the provenance of a promoted answer checkable.
 *
 * `queries` is classified **identity-bearing** (reading A1, D50): a private Query is always
 * attributed and is never anonymous. That is why this module may store `student_id` while
 * `analytics.ts` may not -- the aggregate surface reads the queue through `count(*)` grouped by
 * milestone (`06` section 4.7.2 step 2), never through this module.
 *
 * A thread's creation emits `query_created` in the same transaction (trap T7). `query_messages` is
 * deliberately text-only: 7.4.3 states that a private thread has no attachments and no read
 * receipts, and there is no table, column or endpoint for them.
 */

import { emitAnalyticsEvent } from './analytics';
import type { Executor } from './courses';
import type { Origin, Provenance, PublicationStamp } from './structure';

/** `queries.status` (`06` section 7.4.1). */
export type QueryStatus = 'open' | 'answered' | 'resolved' | 'closed';

/** `query_messages.author_role` (`06` section 7.4.2). */
export type QueryAuthorRole = 'student' | 'tutor';

/** `faq_entries.source_kind` (`06` section 7.4.4). */
export type FaqSourceKind = 'ai_candidate' | 'query_reply' | 'peer_answer' | 'tutor_authored';

export interface NewQuery {
  readonly id: string;
  readonly assignmentId: string;
  readonly studentId: string;
  /** The anchor used for question-volume aggregation (`06` section 7.4.1, D49). */
  readonly milestoneId: string | null;
  readonly requirementNodeId: string | null;
  /** The thread title. A tutor-directed question, so never assistant content. */
  readonly subject: string;
  readonly createdAt: Date;
  /** The HMAC key, used only to derive the `query_created` event's `subject_ref`. */
  readonly anonIdSecret: string;
}

export interface NewQueryMessage {
  readonly id: string;
  readonly queryId: string;
  readonly assignmentId: string;
  readonly authorRole: QueryAuthorRole;
  readonly authorUserId: string;
  readonly body: string;
  readonly createdAt: Date;
  /** The status the thread takes once this message exists. */
  readonly statusAfter: QueryStatus;
}

export interface NewFaqEntry {
  readonly id: string;
  readonly assignmentId: string;
  readonly milestoneId: string | null;
  readonly question: string;
  readonly answer: string;
  readonly sourceKind: FaqSourceKind;
  readonly sourceQueryId: string | null;
  readonly sourceQueryMessageId: string | null;
  readonly publishedByUserId: string;
  readonly displayOrder: number;
  readonly publicationStatus: PublicationStamp['publicationStatus'];
  readonly origin: Origin;
  readonly provenance: Provenance | null;
  readonly groundingChunkIds: readonly string[];
  readonly approvedByUserId: string | null;
  readonly approvedAt: string | null;
  readonly publishedAt: string | null;
}

/**
 * Create the private thread and emit `query_created`.
 *
 * The event is emitted here rather than by the analytics module, because this call is the point of
 * the event (trap T7). It is emitted only when the insert actually happened, so a re-run of the
 * seed does not double-count question volume.
 */
export async function createQuery(ex: Executor, query: NewQuery): Promise<boolean> {
  const rows = await ex<{ id: string }[]>`
    insert into queries (
      id, assignment_id, student_id, milestone_id, requirement_node_id, subject,
      status, message_count, last_message_at
    )
    values (
      ${query.id}::uuid,
      ${query.assignmentId}::uuid,
      ${query.studentId}::uuid,
      ${query.milestoneId}::uuid,
      ${query.requirementNodeId}::uuid,
      ${query.subject},
      'open',
      0,
      ${query.createdAt.toISOString()}::timestamptz
    )
    on conflict do nothing
    returning id
  `;
  if (rows.length === 0) return false;

  await emitAnalyticsEvent(ex, {
    anonIdSecret: query.anonIdSecret,
    assignmentId: query.assignmentId,
    studentId: query.studentId,
    eventType: 'query_created',
    milestoneId: query.milestoneId,
    occurredAt: query.createdAt,
    metadata: { source: 'ui', surface: 'workspace_tab' },
    dedupeKey: `query_created|${query.id}`,
  });
  return true;
}

/**
 * Append one message and keep `queries.message_count` and `last_message_at` consistent with it.
 *
 * The counter update is guarded by the insert, so a re-run neither appends a duplicate message nor
 * inflates the count. `updated_at` is maintained by the `set_updated_at()` trigger.
 */
export async function appendQueryMessage(
  ex: Executor,
  message: NewQueryMessage,
): Promise<boolean> {
  const rows = await ex<{ id: string }[]>`
    insert into query_messages (
      id, query_id, assignment_id, author_role, author_user_id, body, created_at
    )
    values (
      ${message.id}::uuid,
      ${message.queryId}::uuid,
      ${message.assignmentId}::uuid,
      ${message.authorRole},
      ${message.authorUserId}::uuid,
      ${message.body},
      ${message.createdAt.toISOString()}::timestamptz
    )
    on conflict do nothing
    returning id
  `;
  if (rows.length === 0) return false;

  await ex`
    update queries
       set message_count = message_count + 1,
           last_message_at = ${message.createdAt.toISOString()}::timestamptz,
           status = ${message.statusAfter}
     where id = ${message.queryId}::uuid
  `;
  return true;
}

/**
 * Insert one FAQ entry.
 *
 * A published row needs `published_by_user_id` as well as the approval stamp
 * (`ck_faq_entries_published_by`, `ck_faq_entries_approval`), which is why the writer takes the
 * publisher separately from the approver: in the MVP they are both the tutor, but the schema
 * distinguishes "approved" from "released to the cohort".
 */
export async function insertFaqEntryIfAbsent(
  ex: Executor,
  entry: NewFaqEntry,
): Promise<boolean> {
  const rows = await ex<{ id: string }[]>`
    insert into faq_entries (
      id, assignment_id, milestone_id, question, answer, source_kind,
      source_query_id, source_query_message_id, published_by_user_id, display_order,
      publication_status, origin, provenance, grounding_chunk_ids,
      approved_by_user_id, approved_at, published_at
    )
    values (
      ${entry.id}::uuid,
      ${entry.assignmentId}::uuid,
      ${entry.milestoneId}::uuid,
      ${entry.question},
      ${entry.answer},
      ${entry.sourceKind},
      ${entry.sourceQueryId}::uuid,
      ${entry.sourceQueryMessageId}::uuid,
      ${entry.publishedByUserId}::uuid,
      ${entry.displayOrder},
      ${entry.publicationStatus},
      ${entry.origin},
      ${entry.provenance === null || entry.origin !== 'ai' ? null : JSON.stringify(entry.provenance)}::jsonb,
      ${entry.groundingChunkIds}::uuid[],
      ${entry.approvedByUserId}::uuid,
      ${entry.approvedAt}::timestamptz,
      ${entry.publishedAt}::timestamptz
    )
    on conflict do nothing
    returning id
  `;
  return rows.length > 0;
}
