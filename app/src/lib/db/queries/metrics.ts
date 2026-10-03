/**
 * The aggregate read model: `milestone_metrics` and `assignment_metrics`
 * (`06-DATA-MODEL.md` sections 4.7.2 and 7.6.4; `08-ANALYTICS-SPEC.md` sections 4.3 and 5).
 *
 * ## M4 is a mean of per-student means, and the doc's own sample query gets this wrong
 *
 * `08` section 4.3 defines metric **M4** twice over, in prose and in formula:
 *
 * ```text
 * perStudentMean(s, m) = mean( elapsedTime(i, s) for i in items(m) completed by s )
 * milestoneMeanTime(m) = mean( perStudentMean(s, m) for s in qualified students of m )
 * ```
 *
 * The reason is stated in the same section: "A milestone with many items would otherwise let one
 * student's 20 items outweigh another student's 2." `08` section 9's test **A15** pins it -- "Student X
 * completes 20 items, 19 others complete 1 each -> Milestone mean is the mean of per-student means".
 *
 * **But `06` section 4.7.2's illustrative build query writes `round(avg(e.duration_seconds) filter (where
 * e.event_type = 'checklist_item_completed'))`** -- a flat mean over item events, which is the confounded
 * figure `08` section 4.3 rejects, and which A15 would fail. The query is a sketch of the *identity
 * surface* ("The SELECT list is the entire identity surface analytics has", and it is the shape that cannot
 * select a student); it is not the M4 definition. So this module computes the two-stage mean, and the
 * difference is exactly the case where one student completed many more items than their peers: the flat
 * mean drifts toward the heavy student's own average, the two-stage mean does not.
 *
 * This is recorded rather than silently chosen because the two formulas agree on most real data and
 * disagree precisely where the metric matters.
 *
 * ## The second stage is computed in the database, and that is deliberate
 *
 * `08` section 6 bullet 4: "No metric may be computed per student, even as an intermediate that is later
 * aggregated, **except** `perStudentMean(s, m)`, which is the first stage of `milestoneMeanTime`." So the
 * per-student mean is permitted as an intermediate and only as an intermediate: it is the inner `group by
 * subject_ref` below, it is never selected, returned, logged or sent, and the outer query reduces it to a
 * single `avg` before anything leaves SQL. A per-student row must not cross into TypeScript even as a
 * local, because a value that exists in application memory is a value that can be logged or serialised.
 *
 * ## The k-anonymity floor is a `having`, so a small bucket is *absent* rather than suppressed
 *
 * `06` section 4.7.2 item 4: "The `having` clause means a bucket with fewer than five contributors
 * produces **no row** rather than a suppressed row. Absence is uniform, so a reader cannot distinguish
 * '0 students' from '4 students'." `ck_milestone_metrics_contributor_count` (`>= 5`) refuses a row
 * otherwise, so the floor is a database constraint as well as a query predicate.
 */

import type { Executor } from '@/lib/db/queries/courses';
import { isoTimestamp } from '@/lib/db/values';

/** `08` section 5.1 and D32: the k-anonymity floor. */
export const K_ANONYMITY_FLOOR = 5;
/**
 * `08` section 4.3: "`milestoneMedianTime` is available when `contributingStudents >= 8`."
 *
 * A **higher** floor than the k-anonymity floor, because a median over five values is close to disclosing
 * them: with five contributors the middle value is one student's own figure.
 */
export const MEDIAN_FLOOR = 8;

/** One milestone's row, with the exact SQL reading annotated at the field. */
export interface MilestoneMetricRow {
  readonly milestoneId: string;
  readonly milestoneTitle: string;
  readonly displayOrder: number;
  /** `count(distinct subject_ref)` -- the only place a contributor identity is touched. */
  readonly contributorCount: number;
  readonly startedCount: number;
  readonly completedCount: number;
  readonly completionRate: number;
  /**
   * **M4, the two-stage mean.** Second stage of `milestoneMeanTime(m)`; see the module header for why it
   * is not a flat `avg(duration_seconds)`.
   */
  readonly averageElapsedSeconds: number | null;
  /** `median_elapsed_seconds`, read back from the stored row -- see `readMilestoneMetrics`. */
  readonly medianElapsedSeconds: number | null;
  readonly discussionPostCount: number;
  readonly assistantTurnCount: number;
  readonly questionCount: number;
  readonly difficultyScore: number | null;
}

/** One milestone's `milestone_metrics` row, as stored. */
interface RawMilestoneMetricRow {
  milestone_id: string;
  milestone_title: string;
  display_order: number;
  contributor_count: number;
  started_count: number;
  completed_count: number;
  completion_rate: string | number;
  average_elapsed_seconds: number | null;
  median_elapsed_seconds: string | number | null;
  discussion_post_count: number;
  assistant_turn_count: number;
  question_count: number;
  difficulty_score: string | number | null;
}

function toMilestoneRow(row: RawMilestoneMetricRow): MilestoneMetricRow {
  return {
    milestoneId: row.milestone_id,
    milestoneTitle: row.milestone_title,
    displayOrder: row.display_order,
    contributorCount: Number(row.contributor_count),
    startedCount: Number(row.started_count),
    completedCount: Number(row.completed_count),
    completionRate: Number(row.completion_rate),
    averageElapsedSeconds:
      row.average_elapsed_seconds === null ? null : Number(row.average_elapsed_seconds),
    // `numeric` arrives as a string from the driver, and `null` must survive as `null` rather than
    // becoming `0` -- `Number(null)` is `0`, which would report a computed median of zero seconds.
    medianElapsedSeconds:
      row.median_elapsed_seconds === null ? null : Number(row.median_elapsed_seconds),
    discussionPostCount: Number(row.discussion_post_count),
    assistantTurnCount: Number(row.assistant_turn_count),
    questionCount: Number(row.question_count),
    difficultyScore: row.difficulty_score === null ? null : Number(row.difficulty_score),
  };
}

/**
 * Rebuild one assignment's `milestone_metrics` for a window, then read the rows back in display order.
 *
 * **Why the rebuild and the read are two statements rather than one `RETURNING`.** The stored row is the
 * read model the tutor's screen and Phase 7's demo both depend on, so the insert is the point of the work
 * and the response is a read of what was persisted. A single statement that returned its own input would
 * make the two indistinguishable, and the very defect a read model exists to catch -- a stored value that
 * differs from the computed one -- would be invisible.
 *
 * The `on conflict (milestone_id, window_start, window_end) do update` matches
 * `uq_milestone_metrics_window`, so a second run for the same window refreshes rather than duplicates.
 */
export async function refreshMilestoneMetrics(
  ex: Executor,
  input: {
    readonly assignmentId: string;
    readonly windowStart: Date;
    readonly windowEnd: Date;
    readonly now: Date;
  },
): Promise<MilestoneMetricRow[]> {
  // Stage 1: per-student means. **The inner query's `subject_ref` group is the only per-student
  // intermediate the spec permits** (`08` section 6 bullet 4), and it must never be selected outward.
  await ex`
    with per_student as (
      select
        e.milestone_id,
        e.subject_ref,
        avg(e.duration_seconds) as student_mean_seconds
      from analytics_events e
      where e.assignment_id = ${input.assignmentId}::uuid
        and e.milestone_id is not null
        and e.event_type = 'checklist_item_completed'
        and e.duration_seconds is not null
        and e.occurred_at >= ${input.windowStart.toISOString()}::timestamptz
        and e.occurred_at <  ${input.windowEnd.toISOString()}::timestamptz
      group by e.milestone_id, e.subject_ref
    ),
    milestone_rollup as (
      select
        e.milestone_id,
        count(distinct e.subject_ref)                                     as contributor_count,
        count(*) filter (where e.event_type = 'checklist_item_started')   as started_count,
        count(*) filter (where e.event_type = 'checklist_item_completed') as completed_count,
        count(*) filter (where e.event_type = 'discussion_post_created')  as discussion_post_count,
        count(*) filter (where e.event_type = 'assistant_message_sent')   as assistant_turn_count,
        round(
          count(*) filter (where e.event_type = 'checklist_item_completed')::numeric
          / nullif(count(*) filter (where e.event_type = 'checklist_item_started'), 0),
          4
        )                                                                 as completion_rate
      from analytics_events e
      where e.assignment_id = ${input.assignmentId}::uuid
        and e.milestone_id is not null
        and e.occurred_at >= ${input.windowStart.toISOString()}::timestamptz
        and e.occurred_at <  ${input.windowEnd.toISOString()}::timestamptz
      group by e.milestone_id
      having count(distinct e.subject_ref) >= ${K_ANONYMITY_FLOOR}
    )
    insert into milestone_metrics (
      assignment_id, milestone_id, window_start, window_end,
      contributor_count, started_count, completed_count, completion_rate,
      average_elapsed_seconds, median_elapsed_seconds,
      discussion_post_count, assistant_turn_count, question_count, difficulty_score, computed_at
    )
    select
      ${input.assignmentId}::uuid,
      r.milestone_id,
      ${input.windowStart.toISOString()}::timestamptz,
      ${input.windowEnd.toISOString()}::timestamptz,
      r.contributor_count,
      r.started_count,
      r.completed_count,
      coalesce(r.completion_rate, 0),
      (select round(avg(ps.student_mean_seconds))
         from per_student ps
        where ps.milestone_id = r.milestone_id)                          as average_elapsed_seconds,
      case
        when r.contributor_count >= ${MEDIAN_FLOOR} then
          (select percentile_cont(0.5) within group (order by ps.student_mean_seconds)
             from per_student ps
            where ps.milestone_id = r.milestone_id)
        else null
      end                                                               as median_elapsed_seconds,
      r.discussion_post_count,
      r.assistant_turn_count,
      coalesce((
        select count(*)
          from queries q
         where q.assignment_id = ${input.assignmentId}::uuid
           and q.milestone_id = r.milestone_id
           and q.created_at >= ${input.windowStart.toISOString()}::timestamptz
           and q.created_at <  ${input.windowEnd.toISOString()}::timestamptz
      ), 0)
      + coalesce((
        select count(*)
          from moderation_flags f
         where f.assignment_id = ${input.assignmentId}::uuid
           and f.target_kind = 'discussion_post'
           and f.created_at >= ${input.windowStart.toISOString()}::timestamptz
           and f.created_at <  ${input.windowEnd.toISOString()}::timestamptz
           and exists (
             select 1
               from discussion_posts p
               join discussion_threads t on t.id = p.thread_id
              where p.id = f.target_id
                and t.milestone_id = r.milestone_id
           )
      ), 0),
      null,
      ${input.now.toISOString()}::timestamptz
    from milestone_rollup r
    on conflict (milestone_id, window_start, window_end) do update
      set contributor_count      = excluded.contributor_count,
          started_count          = excluded.started_count,
          completed_count        = excluded.completed_count,
          completion_rate        = excluded.completion_rate,
          average_elapsed_seconds = excluded.average_elapsed_seconds,
          median_elapsed_seconds = excluded.median_elapsed_seconds,
          discussion_post_count  = excluded.discussion_post_count,
          assistant_turn_count   = excluded.assistant_turn_count,
          question_count         = excluded.question_count,
          difficulty_score       = excluded.difficulty_score,
          computed_at            = excluded.computed_at,
          updated_at             = excluded.computed_at
  `;

  return readMilestoneMetrics(ex, input.assignmentId, input.windowStart, input.windowEnd);
}

/** The stored rows for one window, in milestone display order. */
export async function readMilestoneMetrics(
  ex: Executor,
  assignmentId: string,
  windowStart: Date,
  windowEnd: Date,
): Promise<MilestoneMetricRow[]> {
  const rows = await ex<RawMilestoneMetricRow[]>`
    select m.milestone_id,
           ms.title as milestone_title,
           ms.display_order,
           m.contributor_count,
           m.started_count,
           m.completed_count,
           m.completion_rate,
           m.average_elapsed_seconds,
           m.median_elapsed_seconds,
           m.discussion_post_count,
           m.assistant_turn_count,
           m.question_count,
           m.difficulty_score
      from milestone_metrics m
      join milestones ms on ms.id = m.milestone_id
     where m.assignment_id = ${assignmentId}::uuid
       and m.window_start = ${windowStart.toISOString()}::timestamptz
       and m.window_end = ${windowEnd.toISOString()}::timestamptz
       and ms.deleted_at is null
     order by ms.display_order asc, ms.id asc
  `;
  return rows.map(toMilestoneRow);
}

/**
 * Refresh `assignment_metrics` for one window: the headline figures.
 *
 * **`active_count` is floored at the same k-anonymity rule as a milestone bucket** (C5, D32): the
 * response types it `number | null` and `null` means "fewer than five students have contributed", which is
 * the same absence semantics as a missing milestone row. `enrolled_count` is not floored -- it is a fact
 * about the course roster rather than about behaviour, and it is the denominator a tutor needs to read the
 * other figures.
 */
export async function refreshAssignmentMetrics(
  ex: Executor,
  input: {
    readonly assignmentId: string;
    readonly windowStart: Date;
    readonly windowEnd: Date;
    readonly now: Date;
  },
): Promise<void> {
  // The k-anonymity floor for `active_count` is the scalar subquery's own `having` below: a scalar
  // subquery with a `having` and no `group by` yields one row when the condition holds and no rows
  // otherwise, so the expression is `NULL` exactly when fewer than five students contributed. That is the
  // null semantics the column and the response both want, and it does **not** need a wrapping `nullif` --
  // `nullif(x, null)` is null for every `x`, which is the trap this line was written to avoid.
  await ex`
    insert into assignment_metrics (
      assignment_id, window_start, window_end,
      enrolled_count, active_count, completed_item_count, total_item_count,
      average_completion_rate, question_count, potential_difficulty_area_count, computed_at
    )
    select
      ${input.assignmentId}::uuid,
      ${input.windowStart.toISOString()}::timestamptz,
      ${input.windowEnd.toISOString()}::timestamptz,
      (select count(*)
         from enrollments en
         join assignments a on a.id = ${input.assignmentId}::uuid
        where en.course_id = a.course_id
          and en.role_in_course = 'student'),
      (select count(distinct e.subject_ref)
         from analytics_events e
        where e.assignment_id = ${input.assignmentId}::uuid
          and e.occurred_at >= ${input.windowStart.toISOString()}::timestamptz
          and e.occurred_at <  ${input.windowEnd.toISOString()}::timestamptz
        having count(distinct e.subject_ref) >= ${K_ANONYMITY_FLOOR}),
      (select count(*)
         from student_checklist_progress scp
         join student_assignments sa on sa.id = scp.student_assignment_id
        where sa.assignment_id = ${input.assignmentId}::uuid
          and scp.state = 'completed'),
      (select count(*) from checklist_items ci
        where ci.assignment_id = ${input.assignmentId}::uuid
          and ci.publication_status = 'PUBLISHED'
          and ci.deleted_at is null),
      (select round(avg(m.completion_rate), 4)
         from milestone_metrics m
        where m.assignment_id = ${input.assignmentId}::uuid
          and m.window_start = ${input.windowStart.toISOString()}::timestamptz
          and m.window_end = ${input.windowEnd.toISOString()}::timestamptz),
      (select coalesce(sum(m.question_count), 0)
         from milestone_metrics m
        where m.assignment_id = ${input.assignmentId}::uuid
          and m.window_start = ${input.windowStart.toISOString()}::timestamptz
          and m.window_end = ${input.windowEnd.toISOString()}::timestamptz),
      0,
      ${input.now.toISOString()}::timestamptz
    on conflict (assignment_id, window_start, window_end) do update
      set enrolled_count                    = excluded.enrolled_count,
          active_count                      = excluded.active_count,
          completed_item_count              = excluded.completed_item_count,
          total_item_count                  = excluded.total_item_count,
          average_completion_rate           = excluded.average_completion_rate,
          question_count                    = excluded.question_count,
          potential_difficulty_area_count   = excluded.potential_difficulty_area_count,
          computed_at                       = excluded.computed_at,
          updated_at                        = excluded.computed_at
  `;
}

/** The stored headline row for one window, or `null`. */
export interface AssignmentMetricRow {
  readonly enrolledCount: number;
  readonly activeCount: number | null;
  readonly completedItemCount: number | null;
  readonly totalItemCount: number | null;
  readonly averageCompletionRate: number | null;
  readonly computedAt: string;
}

export async function readAssignmentMetrics(
  ex: Executor,
  assignmentId: string,
  windowStart: Date,
  windowEnd: Date,
): Promise<AssignmentMetricRow | null> {
  const rows = await ex<
    {
      enrolled_count: number;
      active_count: number | null;
      completed_item_count: number | null;
      total_item_count: number | null;
      average_completion_rate: string | number | null;
      computed_at: Date | string;
    }[]
  >`
    select enrolled_count, active_count, completed_item_count, total_item_count,
           average_completion_rate, computed_at
      from assignment_metrics
     where assignment_id = ${assignmentId}::uuid
       and window_start = ${windowStart.toISOString()}::timestamptz
       and window_end = ${windowEnd.toISOString()}::timestamptz
     limit 1
  `;
  const row = rows[0];
  return row === undefined
    ? null
    : {
        enrolledCount: Number(row.enrolled_count),
        activeCount: row.active_count === null ? null : Number(row.active_count),
        completedItemCount:
          row.completed_item_count === null ? null : Number(row.completed_item_count),
        totalItemCount: row.total_item_count === null ? null : Number(row.total_item_count),
        averageCompletionRate:
          row.average_completion_rate === null ? null : Number(row.average_completion_rate),
        computedAt: isoTimestamp(row.computed_at) ?? '',
      };
}

/** Every published Milestone of an assignment, so a milestone with no metrics row can be reported. */
export async function listPublishedMilestones(
  ex: Executor,
  assignmentId: string,
): Promise<Array<{ readonly id: string; readonly title: string; readonly displayOrder: number }>> {
  const rows = await ex<{ id: string; title: string; display_order: number }[]>`
    select id, title, display_order
      from milestones
     where assignment_id = ${assignmentId}::uuid
       and publication_status = 'PUBLISHED'
       and deleted_at is null
     order by display_order asc, id asc
  `;
  return rows.map((row) => ({ id: row.id, title: row.title, displayOrder: row.display_order }));
}
