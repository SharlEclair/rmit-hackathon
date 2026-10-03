/**
 * Student work: `student_assignments`, `student_checklist_progress`
 * (`06` sections 7.3.1-7.3.2; migration `0005_student_work.sql`).
 *
 * Both tables are identity-bearing and student-facing only: no tutor endpoint in `06` section 5
 * returns either one (`06` section 4.7.4). Analytics never reads them; the aggregate pipeline reads
 * `analytics_events`, which is why every transition below emits its event in the same transaction
 * through `analytics.ts` rather than leaving it to be reconstructed later (trap T7).
 *
 * **D48 is the load-bearing rule here.** A re-open does not create a second interval: the first
 * start-to-complete interval stands, `completed_at` is not moved, `reopen_count` increments, and no
 * elapsed time is added. `reopenChecklistItem` therefore does not list `completed_at` or
 * `elapsed_seconds` in its `SET` clause at all -- the rule is enforced by what the statement cannot
 * write, not by a comment asking the next author to be careful.
 *
 * `elapsed_seconds` is computed by Postgres from the stored `started_at` inside the same UPDATE
 * that sets `completed_at`, so `ck_student_checklist_progress_elapsed_matches` cannot be violated
 * by clock skew between two application-side timestamps.
 */

import { emitAnalyticsEvent } from './analytics';
import type { Executor } from './courses';

export interface NewStudentAssignment {
  readonly id: string;
  readonly assignmentId: string;
  readonly studentId: string;
  readonly firstOpenedAt: Date | null;
  readonly lastActivityAt: Date | null;
  /** Published, non-deleted checklist items of the current structure the student has completed. */
  readonly completedItemCount: number;
  readonly totalItemCount: number;
  /** `completedItemCount / totalItemCount`, rounded to the `numeric(5,4)` scale. */
  readonly resolutionRate: number;
}

export interface StartChecklistItemParams {
  readonly id: string;
  readonly studentAssignmentId: string;
  /** Must equal the parent `student_assignments.student_id` (`06` section 7.3.2). */
  readonly studentId: string;
  readonly assignmentId: string;
  readonly milestoneId: string;
  readonly checklistItemId: string;
  readonly anonIdSecret: string;
  readonly startedAt: Date;
}

export interface CompleteChecklistItemParams {
  readonly studentAssignmentId: string;
  readonly studentId: string;
  readonly assignmentId: string;
  readonly milestoneId: string;
  readonly checklistItemId: string;
  readonly anonIdSecret: string;
  readonly completedAt: Date;
}

export interface ReopenChecklistItemParams {
  readonly studentAssignmentId: string;
  readonly studentId: string;
  readonly assignmentId: string;
  readonly milestoneId: string;
  readonly checklistItemId: string;
  readonly anonIdSecret: string;
  readonly reopenedAt: Date;
  /**
   * The `reopen_count` this call expects to find. The guard is what makes a second seed run a
   * no-op instead of incrementing the counter again.
   */
  readonly expectedReopenCount: number;
}

/** Every item of the assignment carries the same denominator (`06` section 7.3.1). */
export async function insertStudentAssignmentIfAbsent(
  ex: Executor,
  studentAssignment: NewStudentAssignment,
): Promise<boolean> {
  const rows = await ex<{ id: string }[]>`
    insert into student_assignments (
      id, assignment_id, student_id, first_opened_at, last_activity_at,
      completed_item_count, total_item_count, resolution_rate
    )
    values (
      ${studentAssignment.id}::uuid,
      ${studentAssignment.assignmentId}::uuid,
      ${studentAssignment.studentId}::uuid,
      ${studentAssignment.firstOpenedAt?.toISOString() ?? null}::timestamptz,
      ${studentAssignment.lastActivityAt?.toISOString() ?? null}::timestamptz,
      ${studentAssignment.completedItemCount},
      ${studentAssignment.totalItemCount},
      ${studentAssignment.resolutionRate}
    )
    on conflict do nothing
    returning id
  `;
  return rows.length > 0;
}

/**
 * The first start for (student, item). Later visits do not reset it (`08` section 4.2).
 *
 * Emits `checklist_item_started` only when this call actually inserted the row, so a second run
 * cannot emit a second event for a start that already happened.
 */
export async function startChecklistItem(
  ex: Executor,
  params: StartChecklistItemParams,
): Promise<boolean> {
  const rows = await ex<{ id: string }[]>`
    insert into student_checklist_progress (
      id, student_assignment_id, student_id, checklist_item_id, state,
      started_at, last_state_changed_at
    )
    values (
      ${params.id}::uuid,
      ${params.studentAssignmentId}::uuid,
      ${params.studentId}::uuid,
      ${params.checklistItemId}::uuid,
      'in_progress',
      ${params.startedAt.toISOString()}::timestamptz,
      ${params.startedAt.toISOString()}::timestamptz
    )
    on conflict do nothing
    returning id
  `;
  if (rows.length === 0) return false;

  await emitAnalyticsEvent(ex, {
    anonIdSecret: params.anonIdSecret,
    assignmentId: params.assignmentId,
    studentId: params.studentId,
    eventType: 'checklist_item_started',
    milestoneId: params.milestoneId,
    checklistItemId: params.checklistItemId,
    durationSeconds: null,
    occurredAt: params.startedAt,
    metadata: { source: 'ui', surface: 'workspace_tab' },
    dedupeKey: `started|${params.studentId}|${params.checklistItemId}`,
  });
  return true;
}

/**
 * The completion transition. Closes the interval and emits `checklist_item_completed` with the
 * duration Postgres computed, so the event and the row can never disagree.
 *
 * The `completed_at is null` guard is the first-completion rule of D48: a second completion after
 * a re-open does not overwrite the standing interval.
 */
export async function completeChecklistItem(
  ex: Executor,
  params: CompleteChecklistItemParams,
): Promise<number | null> {
  const rows = await ex<{ elapsed_seconds: number }[]>`
    update student_checklist_progress
       set state = 'completed',
           completed_at = ${params.completedAt.toISOString()}::timestamptz,
           elapsed_seconds = round(
             extract(epoch from (${params.completedAt.toISOString()}::timestamptz - started_at))
           )::integer,
           last_state_changed_at = ${params.completedAt.toISOString()}::timestamptz
     where student_assignment_id = ${params.studentAssignmentId}::uuid
       and checklist_item_id = ${params.checklistItemId}::uuid
       and completed_at is null
    returning elapsed_seconds
  `;
  const row = rows[0];
  if (row === undefined) return null;

  await emitAnalyticsEvent(ex, {
    anonIdSecret: params.anonIdSecret,
    assignmentId: params.assignmentId,
    studentId: params.studentId,
    eventType: 'checklist_item_completed',
    milestoneId: params.milestoneId,
    checklistItemId: params.checklistItemId,
    durationSeconds: row.elapsed_seconds,
    occurredAt: params.completedAt,
    metadata: { source: 'ui', surface: 'workspace_tab' },
    dedupeKey: `completed|${params.studentId}|${params.checklistItemId}`,
  });
  return row.elapsed_seconds;
}

/**
 * The re-open transition (D48). Sets `state = 'in_progress'`, increments `reopen_count` and moves
 * `last_state_changed_at`; it does not touch `completed_at` or `elapsed_seconds`, and no
 * `checklist_item_completed` event is emitted, because no new interval exists.
 *
 * **`state` is set here and that is not cosmetic.** `06` section 7.3.2 states the rule in full:
 * "Re-opening a completed item sets `state = 'in_progress'`, increments `reopen_count`, and changes
 * `last_state_changed_at`; it does not clear `completed_at` and does not add to `elapsed_seconds`."
 * A reopen that left the row `completed` would report a finished item as finished while `07` section
 * 4.6 rule 6 requires the row to offer `Complete` again. The `ck_student_checklist_progress_in_progress`
 * CHECK is satisfied because `started_at` was set by the original start and is never cleared.
 *
 * `duration_seconds` on the `checklist_item_reopened` event is `0`: `06` section 7.6.1 says the
 * column is present on this event, and the amount of elapsed time a re-open adds is zero by D48.
 * The M4 aggregate filters on `checklist_item_completed`, so a zero here cannot dilute a mean.
 */
export async function reopenChecklistItem(
  ex: Executor,
  params: ReopenChecklistItemParams,
): Promise<boolean> {
  const rows = await ex<{ reopen_count: number }[]>`
    update student_checklist_progress
       set state = 'in_progress',
           reopen_count = reopen_count + 1,
           last_state_changed_at = ${params.reopenedAt.toISOString()}::timestamptz
     where student_assignment_id = ${params.studentAssignmentId}::uuid
       and checklist_item_id = ${params.checklistItemId}::uuid
       and completed_at is not null
       and reopen_count = ${params.expectedReopenCount}
    returning reopen_count
  `;
  if (rows.length === 0) return false;

  await emitAnalyticsEvent(ex, {
    anonIdSecret: params.anonIdSecret,
    assignmentId: params.assignmentId,
    studentId: params.studentId,
    eventType: 'checklist_item_reopened',
    milestoneId: params.milestoneId,
    checklistItemId: params.checklistItemId,
    durationSeconds: 0,
    occurredAt: params.reopenedAt,
    metadata: { source: 'ui', surface: 'workspace_tab' },
    dedupeKey: `reopened|${params.studentId}|${params.checklistItemId}|${params.expectedReopenCount}`,
  });
  return true;
}
