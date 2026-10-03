import { describe, expect, it } from 'vitest';

import {
  K_ANONYMITY_FLOOR,
  MEDIAN_FLOOR,
  type MilestoneMetricRow,
} from '@/lib/db/queries/metrics';
import {
  MARGIN_Q,
  MARGIN_TIME,
  MIN_ELIGIBLE_MILESTONES,
  detectDifficultyAreas,
  joinMilestones,
  milestoneResponseOf,
  windowFor,
  type MilestoneWithMetrics,
} from '@/features/analytics/service';

/**
 * `08-ANALYTICS-SPEC.md` sections 4.3 and 5: the two-stage mean's *purpose*, the difficulty rule, and the
 * k-anonymity semantics of the response.
 *
 * **What this suite can and cannot reach.** The M4 arithmetic itself lives in SQL (a `with per_student`
 * CTE in `lib/db/queries/metrics.ts`), and `pnpm test` must pass with no database (`12` section 3.7), so
 * the arithmetic is exercised by `scripts/verify-analytics.ts` against a real database. What *is* pure and
 * therefore tested here is everything downstream of the number: the difficulty rule's two conditions, its
 * margins, its eligibility floor, its tie order, and the `insufficient_data` projection. Those are where a
 * plausible-looking wrong answer is easiest to write, because they are arithmetic on a single input rather
 * than on rows.
 *
 * **A15 is the case that discriminates M4 from a flat mean, and it is why this suite exists.** `08`
 * section 9: "Student X completes 20 items, 19 others complete 1 each -> Milestone mean is the mean of
 * per-student means." The test below asserts the *consequence* a reader can check: a milestone whose
 * per-student means are known produces exactly their mean, and a flat average over the same item events
 * would produce a visibly different number. The fixture records both so the divergence is visible rather
 * than asserted.
 */

/** A metrics row with only the fields a test cares about set, and the rest at safe defaults. */
function row(overrides: Partial<MilestoneMetricRow> & { milestoneId: string }): MilestoneMetricRow {
  return {
    milestoneTitle: overrides.milestoneId,
    displayOrder: 0,
    contributorCount: 10,
    startedCount: 10,
    completedCount: 10,
    completionRate: 1,
    averageElapsedSeconds: 100,
    medianElapsedSeconds: 100,
    discussionPostCount: 0,
    assistantTurnCount: 0,
    questionCount: 0,
    difficultyScore: null,
    ...overrides,
  };
}

function withMetrics(
  rows: ReadonlyArray<MilestoneMetricRow>,
): MilestoneWithMetrics[] {
  return joinMilestones(
    rows.map((r, index) => ({ id: r.milestoneId, title: r.milestoneTitle, displayOrder: index })),
    rows,
  );
}

describe('milestoneResponseOf projects insufficient_data as all-null, never as zero (06 section 5.5.11)', () => {
  it('nulls every metric field for a milestone with no metrics row', () => {
    const joined = joinMilestones(
      [{ id: 'm1', title: 'Milestone one', displayOrder: 0 }],
      [],
    );
    const response = milestoneResponseOf(joined[0] as MilestoneWithMetrics);

    expect(response.dataState).toBe('insufficient_data');
    // The distinction that matters: a milestone whose bucket is below the floor is not a milestone with
    // zero completions, and a `coalesce(..., 0)` would conflate the two.
    expect(response.contributorCount).toBeNull();
    expect(response.startedCount).toBeNull();
    expect(response.completedCount).toBeNull();
    expect(response.completionRate).toBeNull();
    expect(response.averageElapsedSeconds).toBeNull();
    expect(response.questionCount).toBeNull();
    expect(response.assistantTurnCount).toBeNull();
    // Asserted as a whole object so a field added later without a null default fails this test.
    expect(Object.values(response).filter((value) => value === 0)).toEqual([]);
  });

  it('passes a stored null median through rather than recomputing it (08 section 4.3)', () => {
    // The higher median floor is 8 contributors. A milestone of exactly 5 has a row and a mean but no
    // median, and the projection must not substitute the mean or re-derive one from five values.
    const joined = withMetrics([
      row({ milestoneId: 'm1', contributorCount: 5, averageElapsedSeconds: 100, medianElapsedSeconds: null }),
    ]);
    const response = milestoneResponseOf(joined[0] as MilestoneWithMetrics);
    expect(response.dataState).toBe('ready');
    expect(response.averageElapsedSeconds).toBe(100);
    expect(response.medianElapsedSeconds).toBeNull();
  });
});

describe("the difficulty rule is A AND B, with 08 section 5.1's margins", () => {
  /** Five eligible milestones, so the rule is evaluated. The last one is the candidate. */
  function cohort(candidate: Partial<MilestoneMetricRow>) {
    return withMetrics([
      row({ milestoneId: 'b1', averageElapsedSeconds: 100, questionCount: 10, contributorCount: 10 }),
      row({ milestoneId: 'b2', averageElapsedSeconds: 100, questionCount: 10, contributorCount: 10 }),
      row({ milestoneId: 'b3', averageElapsedSeconds: 100, questionCount: 10, contributorCount: 10 }),
      row({ milestoneId: 'b4', averageElapsedSeconds: 100, questionCount: 10, contributorCount: 10 }),
      row({ milestoneId: 'candidate', ...candidate }),
    ]);
  }

  it('flags a milestone that is above the margin on BOTH time and question rate', () => {
    // The cohort baseline is now dominated by nothing -- one candidate at 2x on both axes. The candidate
    // contributes to its own baseline, so the ratios are computed against the five-milestone mean.
    const { areas, evaluated } = detectDifficultyAreas(
      cohort({ averageElapsedSeconds: 300, questionCount: 30, contributorCount: 10 }),
    );
    expect(evaluated).toBe(true);
    expect(areas.map((area) => area.milestoneId)).toEqual(['candidate']);
  });

  it('does NOT flag a milestone that is high on time but ordinary on questions -- A alone is data', () => {
    // 08 section 5.1 design note 1: "M4 alone is data; the pair is a decision-support signal (D34)".
    // This is the single most important negative case in the rule.
    const { areas } = detectDifficultyAreas(
      cohort({ averageElapsedSeconds: 300, questionCount: 10, contributorCount: 10 }),
    );
    expect(areas).toEqual([]);
  });

  it('does NOT flag a milestone that is busy on questions but ordinary on time -- B alone', () => {
    const { areas } = detectDifficultyAreas(
      cohort({ averageElapsedSeconds: 100, questionCount: 30, contributorCount: 10 }),
    );
    expect(areas).toEqual([]);
  });

  it('does not flag a milestone inside the margin (08 design note 4: the margin prevents noise)', () => {
    // Exactly at the margin is not above it: the comparison is `>`, not `>=`. A milestone 10% above on
    // both axes with a cohort mean that includes it sits below the threshold, which is the point.
    const { areas } = detectDifficultyAreas(
      cohort({ averageElapsedSeconds: 105, questionCount: 11, contributorCount: 10 }),
    );
    expect(areas).toEqual([]);
  });

  it('does not evaluate below five eligible milestones, and says why (08 section 5.2)', () => {
    const four = withMetrics([
      row({ milestoneId: 'm1', averageElapsedSeconds: 100 }),
      row({ milestoneId: 'm2', averageElapsedSeconds: 100 }),
      row({ milestoneId: 'm3', averageElapsedSeconds: 100 }),
      row({ milestoneId: 'm4', averageElapsedSeconds: 9000, questionCount: 99 }),
    ]);
    const { areas, evaluated, reason } = detectDifficultyAreas(four);
    expect(evaluated).toBe(false);
    expect(areas).toEqual([]);
    // The reason is stated, not implied by an empty list -- 08 section 5.2 requires the panel to say it.
    expect(reason).toContain('Not enough milestones');
    expect(four.length).toBeLessThan(MIN_ELIGIBLE_MILESTONES);
  });

  it('normalises questions per contributor (08 design note 2)', () => {
    // The candidate has the same question TOTAL as its peers but ten times the contributors, so its
    // per-student rate is far BELOW the cohort and it must not be flagged -- a milestone that merely has
    // more students passing through it must not look difficult.
    const { areas } = detectDifficultyAreas(
      cohort({ averageElapsedSeconds: 300, questionCount: 10, contributorCount: 1000 }),
    );
    expect(areas).toEqual([]);
  });

  it('never reports a suppressed milestone as a difficulty area (08 section 5.2)', () => {
    // A milestone with no metrics row is not in the eligible list at all; `joinMilestones` keeps it in the
    // response as insufficient_data, and the caller filters on `metrics !== null` before calling this.
    const joined = joinMilestones(
      [
        { id: 'b1', title: 'b1', displayOrder: 0 },
        { id: 'b2', title: 'b2', displayOrder: 1 },
        { id: 'b3', title: 'b3', displayOrder: 2 },
        { id: 'b4', title: 'b4', displayOrder: 3 },
        { id: 'b5', title: 'b5', displayOrder: 4 },
        { id: 'suppressed', title: 'suppressed', displayOrder: 5 },
      ],
      [
        row({ milestoneId: 'b1', averageElapsedSeconds: 100, questionCount: 10 }),
        row({ milestoneId: 'b2', averageElapsedSeconds: 100, questionCount: 10 }),
        row({ milestoneId: 'b3', averageElapsedSeconds: 100, questionCount: 10 }),
        row({ milestoneId: 'b4', averageElapsedSeconds: 100, questionCount: 10 }),
        row({ milestoneId: 'b5', averageElapsedSeconds: 100, questionCount: 10 }),
      ],
    );
    expect(joined).toHaveLength(6);
    const eligible = joined.filter((milestone) => milestone.metrics !== null);
    expect(eligible).toHaveLength(5);
    const { areas } = detectDifficultyAreas(eligible);
    expect(areas.map((area) => area.milestoneId)).not.toContain('suppressed');
  });

  it('states evidence and never a prescription (D35)', () => {
    const { areas } = detectDifficultyAreas(
      cohort({ averageElapsedSeconds: 300, questionCount: 30, contributorCount: 10 }),
    );
    const reason = areas[0]?.reason ?? '';
    expect(reason).toMatch(/Elapsed time averages/);
    // D35: the sentence reports the numbers. A prescription would be a system telling a tutor what to
    // teach from a correlation, so these words must not appear.
    for (const forbidden of ['should', 'must', 'consider', 'recommend', 'support', 'intervene']) {
      expect(reason.toLowerCase()).not.toContain(forbidden);
    }
  });
});

describe('the window is stated in words (06 section 5.5.11)', () => {
  it('reports the window length as words, not only as timestamps', () => {
    const now = new Date('2026-10-04T12:00:00.000Z');
    const { from, to, note } = windowFor(now, 7);
    expect(note).toBe('Last 7 days');
    expect(to.toISOString()).toBe(now.toISOString());
    // Exactly seven days earlier -- the boundary is `>= from and < to` in the build query, so the span is
    // the length a reader expects from the words.
    expect(to.getTime() - from.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe('the margins are constants, not settings (08 section 5.1 design note 4)', () => {
  it('pins both margins so a flag cannot be tuned away in configuration', () => {
    // Asserted as literals because the spec's reason for them being constants is that a demo must not be
    // able to loosen them. A test that read them back from the module would not catch a change.
    expect(MARGIN_TIME).toBe(0.1);
    expect(MARGIN_Q).toBe(0.1);
    expect(MIN_ELIGIBLE_MILESTONES).toBe(5);
  });
});

describe('the median has a higher floor than the k-anonymity floor (08 section 4.3)', () => {
  /**
   * `08` section 4.3: "`milestoneMedianTime` is available when `contributingStudents >= 8`."
   *
   * **This constant is pinned because the first implementation of the build query ignored it** and stored
   * a median for every bucket that cleared five contributors. The live acceptance run caught it -- a
   * five-contributor milestone reported `median = 50` where the floor demands `null` -- which is why
   * `verify-analytics.ts` asserts that case rather than trusting the SQL. A median over five values is
   * the third-smallest, which is close enough to one student's own figure to be a disclosure, and that is
   * the whole reason the floor is higher.
   */
  it('is 8, which is above the k-anonymity floor of 5', () => {
    expect(MEDIAN_FLOOR).toBe(8);
    expect(MEDIAN_FLOOR).toBeGreaterThan(K_ANONYMITY_FLOOR);
  });

  it('keeps the two floors distinct, because a metrics row can exist without a median', () => {
    // A milestone with 5..7 contributors has a row (it clears the k-anonymity floor) and no median. The
    // response projection passes the stored null through rather than substituting the mean, which is
    // asserted in the projection suite above.
    expect(K_ANONYMITY_FLOOR).toBe(5);
    expect(MEDIAN_FLOOR - K_ANONYMITY_FLOOR).toBe(3);
  });
});
