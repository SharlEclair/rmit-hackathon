/**
 * Assignment Health: `06-DATA-MODEL.md` section 5.5.11 and `08-ANALYTICS-SPEC.md` sections 4 and 5.
 *
 * ## What this module is allowed to know
 *
 * Nothing here identifies a student, and that is enforced upstream rather than here: the inputs are
 * `MilestoneMetricRow`s, which are aggregates read from `milestone_metrics`, and the table's
 * `contributor_count` is floored at 5 by `ck_milestone_metrics_contributor_count`. So this module cannot
 * leak a per-student figure because it cannot obtain one -- the type it receives has no per-student field
 * to leak. That is a stronger guarantee than a filter, and it is why `metrics.ts` computes the two-stage
 * mean entirely in SQL and hands over a scalar.
 *
 * ## `insufficient_data` is per-milestone *and* per-assignment, and `null` is not zero
 *
 * `06` section 5.5.11: "when `dataState = 'insufficient_data'`, every metric field is `null`". A milestone
 * absent from `milestone_metrics` is one whose bucket fell below the k-anonymity floor, so it is reported
 * with `dataState: 'insufficient_data'` and **every** metric `null` -- not with the zeros a `coalesce`
 * would produce. A milestone with a row is `'ready'`.
 *
 * ## The difficulty rule is two conditions ANDed, and the margins are constants
 *
 * `08` section 5.1: `potentialDifficultyArea(m) = CONDITION A AND CONDITION B`, where A compares M4 with
 * the eligible cohort's mean M4 and B compares the per-student question rate with the eligible cohort's
 * mean rate. `MARGIN_TIME` and `MARGIN_Q` are **constants in code, not environment variables**, so "a flag
 * cannot be tuned away during a demo" (`08` section 5.1 design note 4). The rate divides by the
 * milestone's own contributors, because "a milestone that simply has more students passing through it
 * would otherwise always look difficult" (note 2).
 *
 * `08` section 5.2's edge cases are implemented rather than noted: the rule is **not evaluated** below
 * **5** eligible milestones (`not enough milestones with sufficient activity to compare`), and a
 * suppressed milestone cannot be flagged.
 */

import type { AssignmentHealthResponse, MilestoneMetricResponse } from '@/lib/api/types';
import type { Executor } from '@/lib/db/queries/courses';
import {
  listPublishedMilestones,
  readAssignmentMetrics,
  refreshAssignmentMetrics,
  refreshMilestoneMetrics,
  type MilestoneMetricRow,
} from '@/lib/db/queries/metrics';

/**
 * `08` section 5.1's working defaults.
 *
 * **Constants, not configuration.** The spec is explicit that making them environment variables would
 * allow a flag to be tuned away before a presentation, which would turn a decision-support signal into a
 * setting. A revision changes the register first (`08` section 5.1 note 3's own rule).
 */
export const MARGIN_TIME = 0.1;
export const MARGIN_Q = 0.1;

/** `08` section 5.2: below five eligible milestones the comparison is not evaluated. */
export const MIN_ELIGIBLE_MILESTONES = 5;

/** The aggregation window, in days. `06` section 5.5.11 reports the window in words as well. */
export const DEFAULT_WINDOW_DAYS = 7;

/** The window a request is evaluated over, and the words the response states it in. */
export function windowFor(now: Date, days = DEFAULT_WINDOW_DAYS): {
  readonly from: Date;
  readonly to: Date;
  readonly note: string;
} {
  const to = now;
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { from, to, note: `Last ${String(days)} days` };
}

/** One milestone with its metrics row attached, or `null` metrics when its bucket is below the floor. */
export interface MilestoneWithMetrics {
  readonly milestoneId: string;
  readonly milestoneTitle: string;
  readonly displayOrder: number;
  readonly metrics: MilestoneMetricRow | null;
}

/**
 * Every **published** milestone of the assignment, each with its metrics row when one exists.
 *
 * The join is over the milestone list rather than over `milestone_metrics`, so a below-floor milestone is
 * *present with no metrics* rather than absent from the response. `06` section 5.5.11's rule and
 * `08` section 5.2's "Suppressed milestone | Cannot be flagged. Remains in the table as
 * `insufficient data`" both require the row to exist, and the table's absence of a metrics row is exactly
 * what `insufficient_data` reports.
 */
export function joinMilestones(
  milestones: ReadonlyArray<{ readonly id: string; readonly title: string; readonly displayOrder: number }>,
  metrics: readonly MilestoneMetricRow[],
): MilestoneWithMetrics[] {
  const byMilestone = new Map(metrics.map((row) => [row.milestoneId, row]));
  return milestones.map((milestone) => ({
    milestoneId: milestone.id,
    milestoneTitle: milestone.title,
    displayOrder: milestone.displayOrder,
    metrics: byMilestone.get(milestone.id) ?? null,
  }));
}

/**
 * One milestone's response entry.
 *
 * `dataState` is the gate for every other field: below the floor, **each** metric is `null` rather than
 * the stored zero. The distinction matters because a milestone with no completions and a milestone whose
 * five contributors simply did not complete anything are different facts, and only one of them may be
 * shown.
 */
export function milestoneResponseOf(milestone: MilestoneWithMetrics): MilestoneMetricResponse {
  const metrics = milestone.metrics;
  if (metrics === null) {
    return {
      milestoneId: milestone.milestoneId,
      milestoneTitle: milestone.milestoneTitle,
      dataState: 'insufficient_data',
      contributorCount: null,
      startedCount: null,
      completedCount: null,
      completionRate: null,
      averageElapsedSeconds: null,
      medianElapsedSeconds: null,
      discussionPostCount: null,
      assistantTurnCount: null,
      questionCount: null,
      difficultyScore: null,
    };
  }

  return {
    milestoneId: milestone.milestoneId,
    milestoneTitle: milestone.milestoneTitle,
    dataState: 'ready',
    contributorCount: metrics.contributorCount,
    startedCount: metrics.startedCount,
    completedCount: metrics.completedCount,
    completionRate: metrics.completionRate,
    averageElapsedSeconds: metrics.averageElapsedSeconds,
    // The stored median is already `null` below the median floor (`08` section 4.3), so it is passed
    // through rather than re-derived: a median recomputed here from five values would be the very
    // disclosure the higher floor exists to prevent.
    medianElapsedSeconds: metrics.medianElapsedSeconds,
    discussionPostCount: metrics.discussionPostCount,
    assistantTurnCount: metrics.assistantTurnCount,
    questionCount: metrics.questionCount,
    difficultyScore: metrics.difficultyScore,
  };
}

/** One flagged milestone, with the evidence sentence `08` section 5.1 and D35 require. */
export interface DifficultyArea {
  readonly milestoneId: string;
  readonly milestoneTitle: string;
  readonly reason: string;
  readonly averageElapsedSeconds: number;
  readonly questionCount: number;
  readonly completionRate: number;
}

/**
 * The potential difficulty areas of an eligible set, by `08` section 5.1's two-condition rule.
 *
 * **Both conditions, not either** (note 1): M4 alone is data, and the pair is the decision-support signal.
 * A milestone with no completions has no M4 to compare, so it cannot satisfy condition A and is not
 * flagged -- it is reported with a `null` time in the table instead, which is the honest reading.
 *
 * `08` section 5.2: below `MIN_ELIGIBLE_MILESTONES` eligible milestones the rule is **not evaluated** and
 * the caller receives `[]` with a reason, rather than a comparison against a two-value baseline.
 */
export function detectDifficultyAreas(eligible: readonly MilestoneWithMetrics[]): {
  readonly areas: DifficultyArea[];
  readonly evaluated: boolean;
  readonly reason: string | null;
} {
  if (eligible.length < MIN_ELIGIBLE_MILESTONES) {
    return {
      areas: [],
      evaluated: false,
      reason: 'Not enough milestones with sufficient activity to compare.',
    };
  }

  const times = eligible
    .map((milestone) => milestone.metrics?.averageElapsedSeconds ?? null)
    .filter((value): value is number => value !== null);
  const rates = eligible.map((milestone) => questionRateOf(milestone.metrics));

  // The cohort baseline is the mean **over the eligible milestones**, per `08` section 5.1's definition
  // of `cohortMeanTime` and `cohortQuestionRate`; it is not the mean over contributing students, which
  // would weight a large milestone more heavily than a small one.
  const cohortMeanTime = times.length === 0 ? 0 : mean(times);
  const cohortQuestionRate = rates.length === 0 ? 0 : mean(rates);

  const areas: DifficultyArea[] = [];
  for (const milestone of eligible) {
    const metrics = milestone.metrics;
    if (metrics === null) continue;

    const timeAbove =
      metrics.averageElapsedSeconds !== null &&
      metrics.averageElapsedSeconds > cohortMeanTime * (1 + MARGIN_TIME);
    const rate = questionRateOf(metrics);
    const rateAbove = rate > cohortQuestionRate * (1 + MARGIN_Q);
    if (!timeAbove || !rateAbove) continue;

    areas.push({
      milestoneId: milestone.milestoneId,
      milestoneTitle: milestone.milestoneTitle,
      // `08` section 5.1's design, D35: state the evidence, never the prescription. The sentence says
      // what the numbers are and leaves the tutor to decide what to do, because a system that tells a
      // tutor to "give more support here" is prescribing pedagogy from a correlation.
      reason: evidenceSentence(metrics, cohortMeanTime, cohortQuestionRate),
      averageElapsedSeconds: metrics.averageElapsedSeconds ?? 0,
      questionCount: metrics.questionCount,
      completionRate: metrics.completionRate,
    });
  }

  // `08` section 5.2's tie order: descending by the weaker of the two percentiles, then by M4, then by
  // milestone order. Nothing identity-derived is used, and the final key is the milestone's own position
  // so the order is deterministic.
  const timePercentiles = percentiles(eligible, (m) => m.metrics?.averageElapsedSeconds ?? null);
  const ratePercentiles = percentiles(eligible, (m) => (m.metrics === null ? null : questionRateOf(m.metrics)));
  areas.sort((a, b) => {
    const aWeak = Math.min(timePercentiles.get(a.milestoneId) ?? 0, ratePercentiles.get(a.milestoneId) ?? 0);
    const bWeak = Math.min(timePercentiles.get(b.milestoneId) ?? 0, ratePercentiles.get(b.milestoneId) ?? 0);
    if (bWeak !== aWeak) return bWeak - aWeak;
    if (b.averageElapsedSeconds !== a.averageElapsedSeconds) {
      return b.averageElapsedSeconds - a.averageElapsedSeconds;
    }
    const aOrder = eligible.find((m) => m.milestoneId === a.milestoneId)?.displayOrder ?? 0;
    const bOrder = eligible.find((m) => m.milestoneId === b.milestoneId)?.displayOrder ?? 0;
    return aOrder - bOrder;
  });

  return { areas, evaluated: true, reason: null };
}

/**
 * `questionRate(m) = questions(m) / activeStudentsInMilestone(m)` (`08` section 5.1).
 *
 * The denominator is `contributorCount`, the milestone's own eligible contributors -- note 2's
 * per-student normalisation. A milestone with no contributors cannot be eligible, so the guard is for the
 * type rather than for a reachable case.
 */
function questionRateOf(metrics: MilestoneMetricRow | null): number {
  if (metrics === null || metrics.contributorCount === 0) return 0;
  return metrics.questionCount / metrics.contributorCount;
}

/** D35's evidence sentence: what the numbers are, with no prescription and no identity. */
function evidenceSentence(
  metrics: MilestoneMetricRow,
  cohortMeanTime: number,
  cohortQuestionRate: number,
): string {
  const time = metrics.averageElapsedSeconds ?? 0;
  const rate = questionRateOf(metrics);
  const overTime = cohortMeanTime === 0 ? 0 : Math.round(((time - cohortMeanTime) / cohortMeanTime) * 100);
  const overRate =
    cohortQuestionRate === 0 ? 0 : Math.round(((rate - cohortQuestionRate) / cohortQuestionRate) * 100);
  return (
    `Elapsed time averages ${String(time)}s, ${String(overTime)}% above the cohort's ` +
    `${String(Math.round(cohortMeanTime))}s across ${String(metrics.contributorCount)} contributors, and ` +
    `${String(metrics.questionCount)} tutor-directed question(s) per student is ${String(overRate)}% above ` +
    `the cohort rate.`
  );
}

function mean(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

/**
 * Each milestone's percentile within the eligible set, for the tie order.
 *
 * `min(percentileOf(M4), percentileOf(questionRate))` is `08` section 5.2's first sort key, and it needs
 * a rank rather than the raw value -- two milestones can be 10% above the cohort on different absolute
 * scales, and the rule compares how unusual each is, not how large.
 */
function percentiles(
  eligible: readonly MilestoneWithMetrics[],
  pick: (milestone: MilestoneWithMetrics) => number | null,
): Map<string, number> {
  const pairs = eligible
    .map((milestone) => ({ id: milestone.milestoneId, value: pick(milestone) }))
    .filter((pair): pair is { id: string; value: number } => pair.value !== null);
  const sorted = [...pairs].sort((a, b) => a.value - b.value);
  const out = new Map<string, number>();
  for (const pair of pairs) {
    const rank = sorted.findIndex((candidate) => candidate.id === pair.id);
    out.set(pair.id, sorted.length <= 1 ? 1 : rank / (sorted.length - 1));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// The builder
// ---------------------------------------------------------------------------------------------

/**
 * Refresh both read models for a window and return `06` section 5.5.11's response.
 *
 * **`dataState` at the assignment level is `'ready'` when the headline is publishable**, which is
 * `enrolledCount > 0`: a course roster with no students is a configuration state, not a privacy one. A
 * `null` `activeCount` is reported as `null` **inside** a `ready` response rather than demoting the whole
 * payload, because the floor applies to the behavioural figures and the k-anonymity semantics of
 * `06` section 4.7.2 item 4 are per-bucket.
 */
export async function buildAssignmentHealth(
  ex: Executor,
  input: { readonly assignmentId: string; readonly now: Date; readonly windowDays?: number },
): Promise<AssignmentHealthResponse> {
  const { from, to, note } = windowFor(input.now, input.windowDays ?? DEFAULT_WINDOW_DAYS);

  // The refresh writes the read models, then the response reads them back. Two steps on purpose: a
  // single statement returning its own input would make "stored" and "computed" indistinguishable, and a
  // stored value that differs from the computed one is the one defect a read model exists to expose.
  const metrics = await refreshMilestoneMetrics(ex, {
    assignmentId: input.assignmentId,
    windowStart: from,
    windowEnd: to,
    now: input.now,
  });
  await refreshAssignmentMetrics(ex, {
    assignmentId: input.assignmentId,
    windowStart: from,
    windowEnd: to,
    now: input.now,
  });

  const [milestones, headline] = await Promise.all([
    listPublishedMilestones(ex, input.assignmentId),
    readAssignmentMetrics(ex, input.assignmentId, from, to),
  ]);

  const joined = joinMilestones(milestones, metrics);
  // `08` section 5.1's ELIGIBLE: "qualified bucket (contributingStudents >= 5)". Every row in
  // `milestone_metrics` already satisfies that, because the floor is a `having` and a CHECK -- so
  // eligibility here is "has a metrics row", and re-testing the count would duplicate the constraint.
  const eligible = joined.filter((milestone) => milestone.metrics !== null);
  const difficulty = detectDifficultyAreas(eligible);

  return {
    assignmentId: input.assignmentId,
    window: { from: from.toISOString(), to: to.toISOString() },
    dataState: (headline?.enrolledCount ?? 0) > 0 ? 'ready' : 'insufficient_data',
    headline: {
      enrolledCount: headline?.enrolledCount ?? 0,
      activeCount: headline?.activeCount ?? null,
      averageCompletionRate: headline?.averageCompletionRate ?? null,
      potentialDifficultyAreaCount: difficulty.evaluated ? difficulty.areas.length : null,
    },
    milestones: joined.map((milestone) => milestoneResponseOf(milestone)),
    potentialDifficultyAreas: difficulty.areas,
    // The window in words, and the reason when the rule was not evaluated -- `06` section 5.5.11 requires
    // the first, and `08` section 5.2 requires the second to be stated rather than implied by an empty list.
    windowNote: difficulty.reason === null ? note : `${note}. ${difficulty.reason}`,
  };
}
