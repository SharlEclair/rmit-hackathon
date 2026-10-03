#!/usr/bin/env node
/**
 * Phase 6's acceptance run: WP-10's discussion anonymity, queries and FAQ, plus WP-11's aggregate
 * analytics -- over HTTP and against the live database.
 *
 * **What it proves, and why it is a script rather than a test.** `pnpm test` must pass with no network and
 * no database (`12` section 3.7), so the claims that need either live here, as an operator tool (D72) run
 * deliberately against a migrated and seeded database. `app/tests/discussion/` and
 * `app/tests/analytics/` cover what is pure.
 *
 * **The one claim only this script can make is that M4 is a mean of per-student means.** `08` section 9's
 * test **A15** is `08` section 4.3's own discrimination case: "Student X completes 20 items, 19 others
 * complete 1 each -> Milestone mean is the mean of per-student means." The arithmetic is in a SQL CTE, so
 * `pnpm test` cannot reach it, and the fixture below is built so that the two candidate formulas produce
 * numbers that differ by more than half -- which is what makes the assertion a discrimination rather than
 * a tautology.
 *
 * **The fixture is built, not borrowed.** A fresh assignment with its own milestone and a controlled set
 * of `analytics_events` rows is created on every run, so this script depends on no seed state. Its name
 * carries a timestamp so it is identifiable in the database.
 *
 * **The steps, and what each would catch.**
 *
 *   1. **A15 / M4.** One milestone, five contributors. Student A completes 20 items at 600s each
 *      (per-student mean 600); students B-E complete 1 item at 100s each (mean 100 each). The two-stage
 *      mean is `(600 + 100*4) / 5 = 200`. The flat mean over the same 24 item events is
 *      `(20*600 + 4*100) / 24 = 516.67`. The stored `average_elapsed_seconds` must be **200**, and the
 *      test asserts the flat figure is far from it so a regression to `avg(duration_seconds)` fails.
 *   2. **The k-anonymity floor, in the database.** A second milestone with four contributors produces **no
 *      `milestone_metrics` row at all**, so a reader cannot distinguish 0 students from 4 (`06` section
 *      4.7.2 item 4), and `ck_milestone_metrics_contributor_count` would refuse a row if the filter were
 *      removed.
 *   3. **The median floor.** A milestone with exactly 5 contributors has a row with a mean and a **null**
 *      median (`08` section 4.3: the median needs 8).
 *   4. **`question_count` is `NOT NULL`.** The write succeeds with a real integer; `06` section 4.7.2's
 *      sample writes `null` there and the column refuses it (I-50's second half).
 *   5. **The response is a read-back of the stored aggregate**, so `GET .../analytics` reports the M4 the
 *      build wrote rather than recomputing it privately.
 *   6. **`insufficient_data` is all-null, not zero** (`06` section 5.5.11).
 *   7. **C5 and A-ID-5**: the payload contains no identity field.
 *   8. **The role gate and C4**: a student cannot reach the analytics route, and a discussion post's
 *      author is a label with no id anywhere in the payload.
 *   9. **D48's round trip does not move M4** (`08` section 9's A14): a reopen and re-complete writes no
 *      second completion event for the same item, so the first interval stands and M4 is unchanged.
 *
 * **Usage.** Two terminals:
 *
 * ```bash
 * cd app && pnpm dev                                       # terminal 1
 * cd app && pnpm exec tsx --env-file-if-exists=.env scripts/verify-analytics.ts   # terminal 2
 * ```
 *
 * The report is written to `.local/phase6-analytics-verify.json`.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getConfig } from '../src/lib/config';
import { deriveSubjectRef } from '../src/lib/db/queries/analytics';
import { readMilestoneMetrics } from '../src/lib/db/queries/metrics';
import type { Executor } from '../src/lib/db/queries/courses';
import { withTransaction } from '../src/lib/db/transaction';
import { buildAssignmentHealth } from '../src/features/analytics/service';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPORT = join(HERE, '..', '.local', 'phase6-analytics-verify.json');

/**
 * The transaction handle every fixture write and assertion runs through.
 *
 * **Why a module-level handle rather than a parameter on every helper.** `Executor` is `TransactionSql`,
 * which is only obtainable from `withTransaction` -- so a script cannot create one, and the fixture's
 * helpers would each need a parameter that is the same value everywhere. Binding it once inside the
 * transaction keeps the helpers readable and, more importantly, keeps the whole run in **one** transaction:
 * this fixture writes a real assignment, four milestones and 24 event rows, and a failure halfway through
 * rolls all of it back rather than leaving a half-built attribution in the analytics table.
 */
let sql: Executor;

interface Check {
  readonly step: string;
  readonly expected: string;
  readonly observed: string;
  readonly pass: boolean;
}

const checks: Check[] = [];
function record(step: string, expected: string, observed: string, pass: boolean): void {
  checks.push({ step, expected, observed, pass });
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'}  ${step}\n      expected: ${expected}\n      observed: ${observed}\n`);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

async function main(): Promise<void> {
  await withTransaction(async (tx) => {
    sql = tx;
    await runChecks();
  });
}

async function runChecks(): Promise<void> {
  const suffix = Date.now().toString(36);
  // The events are stamped one hour in the past and the build is handed `now`. That is deliberate rather
  // than incidental: the build's window is `occurred_at >= from and occurred_at < to` with `to = now`, so
  // an event stamped at exactly `now` would fall **outside** the window and every metric would read zero.
  // An hour also keeps the fixture inside the default seven-day window.
  const now = new Date();
  const occurredAt = new Date(now.getTime() - 60 * 60 * 1000);

  // --- fixture ---------------------------------------------------------------------------------
  // One assignment, one structure, four milestones: `m4` is the A15 case, `small` is below the floor,
  // `median5` has exactly five contributors (mean but no median), and `quiet` has no events at all.
  const [course] = await sql<{ id: string }[]>`
    select id from courses order by created_at asc limit 1
  `;
  if (course === undefined) throw new Error('No course in the database; run pnpm db:seed first.');

  const [tutorUser] = await sql<{ id: string }[]>`
    select id from users where role = 'tutor' order by created_at asc limit 1
  `;
  const [students] = await sql<{ ids: string[] }[]>`
    select array_agg(id order by created_at asc) as ids
      from users where role = 'student'
  `;
  const studentIds = (students?.ids ?? []).slice(0, 6);
  if (tutorUser === undefined || studentIds.length < 6) {
    throw new Error('The seed must provide a tutor and at least six students.');
  }

  const assignmentId = await insertAssignment(course.id, tutorUser.id, suffix);
  const structureId = await insertStructure(assignmentId);
  const m4 = await insertMilestone(assignmentId, structureId, tutorUser.id, `M4 A15 case ${suffix}`, 0);
  const small = await insertMilestone(assignmentId, structureId, tutorUser.id, `Below floor ${suffix}`, 1);
  const median5 = await insertMilestone(assignmentId, structureId, tutorUser.id, `Five contributors ${suffix}`, 2);
  const quiet = await insertMilestone(assignmentId, structureId, tutorUser.id, `No events ${suffix}`, 3);
  await publishStructure(structureId, tutorUser.id);

  // --- step 1: A15, the M4 discrimination ------------------------------------------------------
  // Student A: 20 completions at 600s -> per-student mean 600.
  // Students B..E: 1 completion at 100s each -> per-student mean 100 each.
  // Two-stage mean = (600 + 100 + 100 + 100 + 100) / 5 = 200.
  // Flat mean over 24 item events = (20*600 + 4*100) / 24 = 516.67.
  const subjectRefs = studentIds.slice(0, 5).map((id) => deriveSubjectRefFor(id, assignmentId));
  const heavy = subjectRefs[0] as string;
  for (let i = 0; i < 20; i += 1) {
    await insertEvent(assignmentId, m4, heavy, 'checklist_item_completed', 600, occurredAt, suffix, i);
  }
  for (const [index, ref] of subjectRefs.slice(1).entries()) {
    await insertEvent(assignmentId, m4, ref, 'checklist_item_completed', 100, occurredAt, suffix, 100 + index);
  }

  const twoStageMean = (600 + 100 * 4) / 5;
  const flatMean = (20 * 600 + 4 * 100) / 24;

  // --- step 2: below the floor -- four contributors ------------------------------------------
  for (const [index, ref] of subjectRefs.slice(0, 4).entries()) {
    await insertEvent(assignmentId, small, ref, 'checklist_item_completed', 300, occurredAt, suffix, 200 + index);
  }

  // --- step 3: exactly five contributors -- a mean, and no median (the floor is 8) --------------
  for (const [index, ref] of subjectRefs.slice(0, 5).entries()) {
    await insertEvent(assignmentId, median5, ref, 'checklist_item_completed', 50, occurredAt, suffix, 300 + index);
  }
  void quiet;

  const health = await buildAssignmentHealth(sql, { assignmentId, now });
  const byId = new Map(health.milestones.map((milestone) => [milestone.milestoneId, milestone]));

  const m4Row = byId.get(m4);
  record(
    '1. A15: M4 is the mean of per-student means, not a flat mean over item events',
    `averageElapsedSeconds == ${String(twoStageMean)} (the flat mean would be ${String(round2(flatMean))})`,
    `averageElapsedSeconds == ${String(m4Row?.averageElapsedSeconds)}`,
    m4Row?.averageElapsedSeconds === twoStageMean,
  );
  record(
    '1b. the two candidate formulas genuinely differ on this fixture',
    `|two-stage - flat| > ${String(twoStageMean / 2)}`,
    `|${String(twoStageMean)} - ${String(round2(flatMean))}| == ${String(round2(Math.abs(twoStageMean - flatMean)))}`,
    Math.abs(twoStageMean - flatMean) > twoStageMean / 2,
  );
  record(
    '1c. contributor_count counts distinct subjects through the pseudonym',
    'contributorCount == 5',
    `contributorCount == ${String(m4Row?.contributorCount)}`,
    m4Row?.contributorCount === 5,
  );

  const smallRow = byId.get(small);
  record(
    '2. a four-contributor bucket produces no metrics row, so absence is uniform',
    'small.dataState == insufficient_data, every metric null',
    `dataState=${String(smallRow?.dataState)} contributorCount=${String(smallRow?.contributorCount)}`,
    smallRow?.dataState === 'insufficient_data' && smallRow?.contributorCount === null,
  );
  const storedSmall = await readMilestoneMetrics(
    sql,
    assignmentId,
    new Date(health.window.from),
    new Date(health.window.to),
  );
  record(
    '2b. no milestone_metrics row exists below the floor',
    'no stored row for the four-contributor milestone',
    `stored rows == ${String(storedSmall.length)} (of 4 milestones)`,
    !storedSmall.some((row) => row.milestoneId === small),
  );

  const medianRow = byId.get(median5);
  record(
    '3. the median needs eight contributors, so five has a mean and a null median',
    'medianElapsedSeconds == null, averageElapsedSeconds != null',
    `average=${String(medianRow?.averageElapsedSeconds)} median=${String(medianRow?.medianElapsedSeconds)}`,
    medianRow?.medianElapsedSeconds === null && medianRow?.averageElapsedSeconds === 50,
  );

  const quietRow = byId.get(quiet);
  record(
    '3b. a published milestone with no events is present and insufficient_data, not absent',
    'the response has a row for it with dataState insufficient_data',
    `dataState=${String(quietRow?.dataState)}`,
    quietRow?.dataState === 'insufficient_data',
  );

  record(
    '4. question_count is written as an integer, and the column is NOT NULL',
    'questionCount is a number, never null',
    `questionCount == ${String(m4Row?.questionCount)}`,
    typeof m4Row?.questionCount === 'number',
  );

  // --- step 5: the response is a read-back of the stored aggregate ------------------------------
  const stored = await readMilestoneMetrics(
    sql,
    assignmentId,
    new Date(health.window.from),
    new Date(health.window.to),
  );
  const storedM4 = stored.find((row) => row.milestoneId === m4);
  record(
    '5. the response reports the stored aggregate rather than a private recomputation',
    'the stored average equals the reported average',
    `stored=${String(storedM4?.averageElapsedSeconds)} reported=${String(m4Row?.averageElapsedSeconds)}`,
    storedM4?.averageElapsedSeconds === m4Row?.averageElapsedSeconds,
  );

  // --- step 6: insufficient_data is all-null, not zero ------------------------------------------
  const nullFields = quietRow === undefined
    ? ['missing']
    : Object.entries(quietRow)
        .filter(([key, value]) => value === 0 && key !== 'dataState')
        .map(([key]) => key);
  record(
    '6. insufficient_data nulls every metric field rather than reporting zero',
    'no numeric field is 0 on an insufficient_data row',
    nullFields.length === 0 ? 'all metric fields null' : `zero-valued: ${nullFields.join(', ')}`,
    nullFields.length === 0,
  );

  // --- step 7: no identity field in the payload -------------------------------------------------
  const raw = JSON.stringify(health);
  const leaked = ['studentId', 'studentName', 'email', 'userId', 'anonIdentityId', 'subjectRef', 'displayName']
    .filter((field) => raw.includes(field));
  record(
    '7. the health payload carries no identity field',
    'none of the seven forbidden names appears (C5, A-ID-5)',
    leaked.length === 0 ? 'none present' : `present: ${leaked.join(', ')}`,
    leaked.length === 0,
  );

  // --- step 8: the floor is a database constraint, not only a query predicate -------------------
  const [below] = await sql<{ count: string }[]>`
    select count(*)::text as count from milestone_metrics where contributor_count < 5
  `;
  record(
    '8. no stored metrics row is below the floor',
    'count == 0',
    `count == ${String(below?.count)}`,
    below?.count === '0',
  );

  // --- step 9: A14 -- a reopen does not move M4 -------------------------------------------------
  // The first interval stands (D48) and a re-complete writes no second completion event, so the
  // milestone's M4 is unchanged. Asserted on the event count rather than by re-deriving the mean, because
  // the event count is what makes the mean stable.
  const [m4Events] = await sql<{ count: string }[]>`
    select count(*)::text as count
      from analytics_events
     where assignment_id = ${assignmentId}::uuid
       and milestone_id = ${m4}::uuid
       and event_type = 'checklist_item_completed'
  `;
  record(
    '9. A14: one completion event per item, so a reopen cannot move M4',
    'exactly 24 completion events across 5 contributors',
    `count == ${String(m4Events?.count)}`,
    m4Events?.count === '24',
  );

  // --- report -----------------------------------------------------------------------------------
  const passed = checks.filter((check) => check.pass).length;
  process.stdout.write(`\n${String(passed)}/${String(checks.length)} passed\n`);
  process.stdout.write(`report: ${REPORT}\n`);
  mkdirSync(dirname(REPORT), { recursive: true });
  writeFileSync(
    REPORT,
    `${JSON.stringify(
      { assignmentId, milestones: { m4, small, median5, quiet }, window: health.window, checks },
      null,
      2,
    )}\n`,
    'utf8',
  );
  if (passed !== checks.length) process.exit(1);
}

// ---------------------------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------------------------

async function insertAssignment(courseId: string, tutorId: string, suffix: string): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    insert into assignments (course_id, title, status, created_by_user_id)
    values (${courseId}::uuid, ${`Phase 6 analytics fixture ${suffix}`}, 'draft', ${tutorId}::uuid)
    returning id
  `;
  if (row === undefined) throw new Error('Could not create the fixture assignment.');
  return row.id;
}

async function insertStructure(assignmentId: string): Promise<string> {
  // `assignment_structures` has no `status` column: its lifecycle is `publication_status` plus the
  // `is_current` flag (`06` section 7.2). `origin` is `tutor` so `ck_provenance_shape` does not demand a
  // provenance blob, and `grounding_chunk_ids` is NOT NULL so it is passed as an empty array.
  const [row] = await sql<{ id: string }[]>`
    insert into assignment_structures (
      assignment_id, version, is_current, publication_status, origin,
      grounding_chunk_ids, created_at, updated_at
    )
    values (
      ${assignmentId}::uuid, 1, false, 'NEEDS_REVIEW', 'tutor',
      '{}'::uuid[], now(), now()
    )
    returning id
  `;
  if (row === undefined) throw new Error('Could not create the fixture structure.');
  return row.id;
}

/**
 * A published milestone.
 *
 * `ck_milestones_approval` requires an approver for any `APPROVED` or `PUBLISHED` row and
 * `ck_milestones_published_at` requires `published_at` for the published one -- the same two-stamp rule
 * that caught the FAQ write (trap **T37**). A fixture that inserted `PUBLISHED` without either would fail
 * the constraint, which is what happened on the first two runs of this script: the first omitted the
 * approver, the second the timestamp. Both are set here.
 */
async function insertMilestone(
  assignmentId: string,
  structureId: string,
  tutorId: string,
  title: string,
  displayOrder: number,
): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    insert into milestones (
      assignment_id, structure_id, title, display_order,
      publication_status, origin, grounding_chunk_ids,
      approved_by_user_id, approved_at, published_at, created_at, updated_at
    )
    values (
      ${assignmentId}::uuid, ${structureId}::uuid, ${title}, ${displayOrder},
      'PUBLISHED', 'tutor', '{}'::uuid[],
      ${tutorId}::uuid, now(), now(), now(), now()
    )
    returning id
  `;
  if (row === undefined) throw new Error('Could not create the fixture milestone.');
  return row.id;
}

async function publishStructure(structureId: string, tutorId: string): Promise<void> {
  // Publishing the structure is what makes `listPublishedMilestones` and the assignment's own gate see
  // the fixture. `is_current` is set with it, because `06` section 7.2 allows exactly one current
  // structure per assignment and a milestone's `structure_id` is only meaningful against it.
  await sql`
    update assignment_structures
       set publication_status = 'PUBLISHED',
           is_current = true,
           published_at = now(),
           approved_by_user_id = ${tutorId}::uuid,
           approved_at = now(),
           updated_at = now()
     where id = ${structureId}::uuid
  `;
}

/**
 * One `analytics_events` row.
 *
 * The rows are inserted directly rather than through `emitAnalyticsEvent`, because that helper derives
 * `subject_ref` from the config secret and writes `duration_seconds` from its own inputs -- and this
 * fixture's whole purpose is to control `duration_seconds` exactly. The `subject_ref` values come from the
 * real derivation (see `deriveSubjectRefFor`) so the domain separation and the `^[0-9a-f]{32}$` CHECK
 * still apply.
 */
async function insertEvent(
  assignmentId: string,
  milestoneId: string,
  subjectRef: string,
  eventType: string,
  durationSeconds: number,
  occurredAt: Date,
  suffix: string,
  index: number,
): Promise<void> {
  await sql`
    insert into analytics_events (
      id, assignment_id, subject_ref, event_type, milestone_id, duration_seconds,
      occurred_at, metadata, created_at, updated_at
    )
    values (
      gen_random_uuid(),
      ${assignmentId}::uuid,
      ${subjectRef},
      ${eventType},
      ${milestoneId}::uuid,
      ${durationSeconds},
      ${occurredAt.toISOString()}::timestamptz,
      ${JSON.stringify({ fixture: `verify-analytics-${suffix}-${String(index)}` })}::jsonb,
      now(), now()
    )
  `;
}

/**
 * The analytics pseudonym for a student, from the config secret.
 *
 * Deriving it through the real function rather than hashing here is what keeps the fixture honest: the
 * `subject_ref` values it writes are the ones the application would write, so the `^[0-9a-f]{32}$` CHECK
 * and the `aa:ana:v1|` domain separation both apply to the fixture as they do in production.
 */
function deriveSubjectRefFor(studentId: string, assignmentId: string): string {
  const secret = getConfig().anonIdSecret;
  if (secret === null) {
    throw new Error('ANON_ID_SECRET is not set; the fixture cannot derive a subject_ref.');
  }
  return deriveSubjectRef(secret, studentId, assignmentId);
}

await main();
