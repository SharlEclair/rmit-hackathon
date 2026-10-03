/**
 * `analytics_events` (`06` section 7.6.1; migration `0008_metrics_audit.sql`).
 *
 * This module exists because of **trap T7: analytics cannot be backfilled.** The event is written
 * at the point of the event, by the feature that owns it, inside the same transaction as the state
 * change. `students.ts` and `questions.ts` call `emitAnalyticsEvent` from the function that
 * performs the transition, so a transition and its event cannot be separated by a crash, a retry,
 * or a later batch job. Nothing in this repository scans history and reconstructs events.
 *
 * **Identity is replaced at write time, never stored.** The caller passes the student id because
 * the emitter is the only place identity is available; this module derives `subject_ref` from it
 * and never places the id, the email or the display name in a column or in `metadata`. The
 * prohibited-column list in `06` sections 4.7.3 and 7.6.1 is absolute (A-ID-6), and the
 * `analytics_events` table in this migration chain has no identity column to write to.
 *
 * **Reading the `subject_ref` formula.** `06` sections 4.7.1 and 7.6.1 state
 * `lower(hex(HMAC_SHA256(secret, msg)[0:16]))` and the `CHECK` requires exactly 32 hex
 * characters. Slicing the *hex string* to 16 characters would produce 16, so `[0:16]` is read as
 * the first 16 **bytes of the digest**, hex-encoded to 32 lower-case hex characters. That is the
 * only reading under which the stated length and the `CHECK` agree.
 */

import { createHmac } from 'node:crypto';

import type { Executor } from './courses';

/** The `event_type` union of `06` section 7.6.1. It is closed: no value may be added here. */
export type AnalyticsEventType =
  | 'session_started'
  | 'checklist_item_started'
  | 'checklist_item_completed'
  | 'checklist_item_reopened'
  | 'query_created'
  | 'query_resolved'
  | 'discussion_post_created'
  | 'assistant_message_sent'
  | 'assistant_request_refused'
  | 'faq_viewed'
  | 'brief_viewed'
  | 'map_node_opened';

/**
 * The `metadata` key allowlist of `06` section 7.6.1. A CHECK cannot enforce a JSON key
 * allowlist, so the type is the enforcement point (test T-15 is the runtime one).
 */
export interface AnalyticsEventMetadata {
  readonly source?: 'ui' | 'api';
  readonly surface?: 'workspace_tab' | 'assistant' | 'discussion';
  readonly verdict?: string;
  readonly reasonCode?: string;
}

/** Domain separation prefix for the analytics pseudonym (`06` section 4.7.1). */
const SUBJECT_REF_PREFIX = 'aa:ana:v1|';

/** Bytes of the HMAC digest that survive into `subject_ref` (16 bytes -> 32 hex characters). */
const SUBJECT_REF_BYTES = 16;

/**
 * The 32-hex-character analytics pseudonym for one (student, assignment) pair.
 *
 * One-way with no reverse mapping, and domain-separated from the discussion pseudonym
 * (`aa:anon:v1|`), so a refusal count and a discussion post can never be correlated by value
 * (`06` sections 4.2 and 4.7.1).
 */
export function deriveSubjectRef(
  anonIdSecret: string,
  studentId: string,
  assignmentId: string,
): string {
  const message = `${SUBJECT_REF_PREFIX}${studentId.toLowerCase()}|${assignmentId.toLowerCase()}`;
  return createHmac('sha256', anonIdSecret)
    .update(message, 'utf8')
    .digest()
    .subarray(0, SUBJECT_REF_BYTES)
    .toString('hex');
}

export interface NewAnalyticsEvent {
  /** The HMAC key from `getConfig().anonIdSecret`. Never stored, never logged. */
  readonly anonIdSecret: string;
  readonly assignmentId: string;
  /** Available at the emitting call site and consumed here; it never reaches a column. */
  readonly studentId: string;
  readonly eventType: AnalyticsEventType;
  readonly milestoneId?: string | null;
  readonly checklistItemId?: string | null;
  readonly durationSeconds?: number | null;
  readonly occurredAt: Date;
  readonly metadata?: AnalyticsEventMetadata;
}

/**
 * The deterministic primary key for one seeded event.
 *
 * Derived from the event's own coordinates rather than from the current time, so re-running the
 * seed addresses the same row and `on conflict do nothing` makes the second run a no-op. A
 * production emitter must pass a `dedupeKey` that is unique per occurrence; this parameter is how
 * a caller supplies that without the module inventing one.
 */
export interface EmitAnalyticsEventParams extends NewAnalyticsEvent {
  readonly dedupeKey: string;
}

function eventId(dedupeKey: string): string {
  const digest = createHmac('sha256', 'aa:analytics-event:v1').update(dedupeKey, 'utf8').digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  const sixth = bytes[6] ?? 0;
  const eighth = bytes[8] ?? 0;
  bytes[6] = (sixth & 0x0f) | 0x40;
  bytes[8] = (eighth & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function emitAnalyticsEvent(
  ex: Executor,
  params: EmitAnalyticsEventParams,
): Promise<boolean> {
  const subjectRef = deriveSubjectRef(params.anonIdSecret, params.studentId, params.assignmentId);
  const rows = await ex<{ id: string }[]>`
    insert into analytics_events (
      id, assignment_id, subject_ref, event_type, milestone_id, checklist_item_id,
      duration_seconds, occurred_at, metadata
    )
    values (
      ${eventId(params.dedupeKey)}::uuid,
      ${params.assignmentId}::uuid,
      ${subjectRef},
      ${params.eventType},
      ${params.milestoneId ?? null}::uuid,
      ${params.checklistItemId ?? null}::uuid,
      ${params.durationSeconds ?? null},
      ${params.occurredAt.toISOString()}::timestamptz,
      ${JSON.stringify(params.metadata ?? {})}::jsonb
    )
    on conflict do nothing
    returning id
  `;
  return rows.length > 0;
}

/**
 * Rows whose `subject_ref` does not match `^[0-9a-f]{32}$`.
 *
 * The schema CHECK makes this impossible; the query exists so a verification run can show the
 * count is 0 rather than assert it.
 */
export async function countMalformedSubjectRefs(ex: Executor): Promise<number> {
  const rows = await ex<{ total: number }[]>`
    select count(*)::int as total
    from analytics_events
    where subject_ref !~ '^[0-9a-f]{32}$'
  `;
  const first = rows[0];
  return first === undefined ? 0 : first.total;
}

/** Distinct contributing students, which is the only shape `subject_ref` may be aggregated in. */
export async function countDistinctSubjects(ex: Executor, assignmentId: string): Promise<number> {
  const rows = await ex<{ total: number }[]>`
    select count(distinct subject_ref)::int as total
    from analytics_events
    where assignment_id = ${assignmentId}::uuid
  `;
  const first = rows[0];
  return first === undefined ? 0 : first.total;
}
