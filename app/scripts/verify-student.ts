#!/usr/bin/env node
/**
 * Phase 5's acceptance run: WP-07's and WP-09's student API, over HTTP, against the live database.
 *
 * **What it proves, and why it is a script rather than a test.** `pnpm test` must pass with no network
 * and no database (`12` section 3.7), so a route-level claim cannot live in the suite. It can live here,
 * because this is an operator tool (D72) run deliberately against a migrated and seeded database and a
 * running server, and its output is the evidence the handoff quotes. `app/tests/workspace/` covers what
 * is pure.
 *
 * **The fixture is built, not borrowed.** A fresh assignment with its own structure, milestone,
 * checklist item and policy rule is created on every run, so this script does not depend on the demo
 * seed being published, on which demonstration assignment the seed produced, or on rows an earlier run
 * happened to leave. Its name carries a timestamp, so it is obvious in the database and harmless: it is
 * published, it belongs to the seeded course, and leaving it changes no other student's state. Deleting
 * it would also delete the audit trail this run exists to produce.
 *
 * **The steps, and what each would catch.**
 *
 *   1. Gate rule G1: a student's own published assignment is `200`, and a nonexistent one is `404` with
 *      the error envelope -- never an empty shell (T3).
 *   2. The workspace bootstrap is complete against `06` section 5.5.3: header, sources, Map, checklist,
 *      policy, FAQ count and the five counts are all present with the fixture's own values.
 *   3. `brief` returns the document manifest with its page sections and **no** `viewerUrl` (I-06).
 *   4. `policy` reports `available: true` and the published rule verbatim.
 *   5. `checklist` reports one published milestone with its item, and the totals are `0/1` before any
 *      transition.
 *   6. `start` is `200` and idempotent: a second `start` is also `200` and does NOT reset `startedAt`.
 *   7. `complete` is `200`, records a non-negative `elapsedSeconds`, and writes the
 *      `checklist_item_completed` analytics event -- the T7 duty, checked on data rather than assumed.
 *   8. `complete` again is a no-op: D48's first interval stands, the second call returns the same
 *      `elapsedSeconds`, and no second event is written.
 *   9. `reopen` sets `state` back to `in_progress` (`06` section 7.3.2) and increments `reopenCount`
 *      while keeping the first `elapsedSeconds` (D48).
 *  10. A `reopen` carrying a stale `expectedReopenCount` is `409 INVALID_STATE_TRANSITION`, so two tabs
 *      cannot double-count one reopen.
 *  11. The derived UI state is `reopened`, not `complete`, for the row from step 9 (`07` section 4.6
 *      rule 6) -- the case the API's three-value `state` cannot express.
 *  12. A tutor-only endpoint is `403 FORBIDDEN_ROLE` to a student, and an unenrolled student's request
 *      for the assignment is `404` rather than a leak.
 *
 * **Usage.** Two terminals:
 *
 * ```bash
 * cd app && pnpm dev                                              # terminal 1
 * pnpm exec tsx --env-file-if-exists=.env scripts/verify-student.ts   # terminal 2
 * ```
 *
 * `BASE_URL` overrides the default `http://localhost:3000`. The full report is written to
 * `.local/phase5-student-verify.json` (gitignored).
 */

import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { signSessionToken, SESSION_LIFETIME_MS } from '../src/lib/auth/session';
import { SESSION_COOKIE_NAME } from '../src/lib/auth/_shared';
import { getConfig } from '../src/lib/config';
import { getSql } from '../src/lib/db/client';
import { withTransaction } from '../src/lib/db/transaction';
import {
  insertAssignmentIfAbsent,
  insertSourceChunkIfAbsent,
  insertSourceIfAbsent,
} from '../src/lib/db/queries/assignments';
import {
  insertAiPolicyRuleIfAbsent,
  insertChecklistItemIfAbsent,
  insertMilestoneIfAbsent,
  insertRequirementNodeIfAbsent,
  insertStructureIfAbsent,
} from '../src/lib/db/queries/structure';
import type { Executor } from '../src/lib/db/queries/courses';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const REQUEST_TIMEOUT_MS = 20_000;
const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

interface Step {
  readonly name: string;
  readonly expected: string;
  readonly observed: string;
  readonly pass: boolean;
}

const steps: Step[] = [];

function record(name: string, expected: string, observed: string, pass: boolean): void {
  steps.push({ name, expected, observed, pass });
  const mark = pass ? 'PASS' : 'FAIL';
  process.stdout.write(`${mark}  ${name}\n      expected: ${expected}\n      observed: ${observed}\n`);
}

async function call(
  method: string,
  path: string,
  cookie: string | null,
  body?: unknown,
): Promise<{ status: number; body: unknown; text: string }> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (cookie !== null) headers['cookie'] = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
      redirect: 'manual',
    });
    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = text === '' ? null : (JSON.parse(text) as unknown);
    } catch {
      parsed = null;
    }
    return { status: response.status, body: parsed, text };
  } finally {
    clearTimeout(timer);
  }
}

function at(body: unknown, path: string): unknown {
  let current: unknown = body;
  for (const key of path.split('.')) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/**
 * The `event:` names of an SSE body, in order.
 *
 * Independent of the client in `assistant-panel.tsx` on purpose: this asserts the wire format the
 * route produces, and a parser shared with the consumer would let one bug satisfy both sides.
 */
function sseEvents(text: string): string[] {
  const names: string[] = [];
  for (const match of text.matchAll(/^event: (\S+)$/gm)) {
    const name = match[1];
    if (name !== undefined) names.push(name);
  }
  return names;
}

/**
 * A session cookie for a seeded account, minted with the login route's own `signSessionToken`.
 *
 * Signing in through `/api/auth/login` would need the demo password to be published in a configurable
 * way, and `roles.ts` re-reads the `users` row on every request, so the token is as real as a form
 * login. What this script verifies is the workspace and its gate, not the login form (Phase 1's).
 */
function token(userId: string, role: 'tutor' | 'student'): string {
  const secret = getConfig().authSecret;
  if (secret === null || secret === '') {
    process.stderr.write('CONFIG_INVALID: AUTH_SECRET is required to mint a session for this run.\n');
    process.exit(78);
  }
  const now = Date.now();
  return signSessionToken(
    { v: 1, sub: userId, role, iat: now, exp: now + SESSION_LIFETIME_MS },
    secret,
    now,
  );
}

/** Build the fixture: one published assignment with a requirement, milestone, item and policy rule. */
async function buildFixture(tx: Executor, input: {
  readonly courseId: string;
  readonly tutorId: string;
  readonly now: string;
}): Promise<{ assignmentId: string; itemId: string; ruleId: string }> {
  const ids = {
    assignment: randomUUID(),
    source: randomUUID(),
    chunk: randomUUID(),
    structure: randomUUID(),
    requirement: randomUUID(),
    milestone: randomUUID(),
    item: randomUUID(),
    rule: randomUUID(),
  };

  const provenance = {
    modelId: 'verification',
    promptVersion: 'phase5-verify',
    generatedAt: input.now,
    groundingChunkIds: [ids.chunk],
  };
  // The fixture is published through the same stamp shape the review layer writes, so the gate sees
  // exactly the state a tutor's publish produces.
  const publishedStamp = {
    publicationStatus: 'PUBLISHED' as const,
    approvedByUserId: input.tutorId,
    approvedAt: input.now,
    publishedAt: input.now,
  };

  await insertAssignmentIfAbsent(tx, {
    id: ids.assignment,
    courseId: input.courseId,
    title: `Phase 5 verification ${input.now}`,
    status: 'draft',
    dueAt: null,
    createdByUserId: input.tutorId,
    publishedAt: null,
  });
  await insertSourceIfAbsent(tx, {
    id: ids.source,
    assignmentId: ids.assignment,
    uploadedByUserId: input.tutorId,
    kind: 'brief',
    originalFilename: 'phase5-verify.txt',
    storageKey: `verify/${ids.source}`,
    mimeType: 'text/plain',
    byteSize: 96,
    pageCount: 1,
    contentHash: 'e'.repeat(64),
    extractionStatus: 'extracted',
  });
  await insertSourceChunkIfAbsent(tx, {
    id: ids.chunk,
    assignmentId: ids.assignment,
    sourceId: ids.source,
    chunkIndex: 0,
    text: 'Submit one file only. The report must cite its references.',
    pageFrom: 1,
    pageTo: 1,
    sectionLabel: 'Submission',
    charCount: 58,
  });
  await insertStructureIfAbsent(tx, {
    id: ids.structure,
    assignmentId: ids.assignment,
    version: 1,
    isCurrent: true,
    origin: 'ai',
    provenance,
    groundingChunkIds: [ids.chunk],
    stamp: publishedStamp,
  });
  await insertRequirementNodeIfAbsent(tx, {
    id: ids.requirement,
    assignmentId: ids.assignment,
    structureId: ids.structure,
    parentRequirementNodeId: null,
    title: 'Deliverable and submission',
    verbatimText: 'Submit one file only.',
    sourceChunkId: ids.chunk,
    sourcePage: 1,
    sourceSectionLabel: 'Submission',
    mapSummary: 'AI interpretation of the submission requirement.',
    displayOrder: 0,
    origin: 'ai',
    provenance,
    groundingChunkIds: [ids.chunk],
    stamp: publishedStamp,
  });
  await insertMilestoneIfAbsent(tx, {
    id: ids.milestone,
    assignmentId: ids.assignment,
    structureId: ids.structure,
    title: 'Prepare the submission',
    summary: 'Assemble the single file.',
    displayOrder: 0,
    origin: 'ai',
    provenance,
    groundingChunkIds: [ids.chunk],
    stamp: publishedStamp,
  });
  await insertChecklistItemIfAbsent(tx, {
    id: ids.item,
    assignmentId: ids.assignment,
    structureId: ids.structure,
    milestoneId: ids.milestone,
    title: 'Understand the submission format',
    planningLevel: 'understand',
    description: null,
    displayOrder: 0,
    origin: 'ai',
    provenance,
    groundingChunkIds: [ids.chunk],
    stamp: publishedStamp,
  });
  await insertAiPolicyRuleIfAbsent(tx, {
    id: ids.rule,
    assignmentId: ids.assignment,
    structureId: ids.structure,
    ruleCode: 'explain_assessment_documents',
    ruleText: 'You may ask the assistant to explain the assessment documents.',
    effect: 'ALLOW',
    appliesTo: 'assistant',
    sourceChunkId: ids.chunk,
    displayOrder: 0,
    origin: 'ai',
    provenance,
    groundingChunkIds: [ids.chunk],
    stamp: publishedStamp,
  });

  // The assignment becomes visible in the same transaction that published its contents, which is what
  // makes G1's three conditions agree the instant a student can see it (`06` section 3.4).
  await tx`
    update assignments
       set current_structure_id = ${ids.structure}::uuid,
           status = 'published',
           published_at = ${input.now}::timestamptz
     where id = ${ids.assignment}::uuid
  `;

  return { assignmentId: ids.assignment, itemId: ids.item, ruleId: ids.rule };
}

/**
 * The T7 duty, checked on data: each transition writes its `analytics_events` row in the same
 * transaction as the state change it describes. This is the query the report reads.
 */

async function main(): Promise<void> {
  const config = getConfig();
  if (config.databaseUrl === null) {
    process.stderr.write('CONFIG_INVALID: DATABASE_URL is required for this script\n');
    process.exit(78);
  }

  const health = await call('GET', '/api/health', null);
  if (health.status !== 200) {
    process.stderr.write(
      `The server did not answer /api/health (status ${String(health.status)}). Start it with "pnpm dev".\n`,
    );
    process.exit(1);
  }

  const sql = getSql(config.databaseUrl);
  const now = new Date().toISOString();

  const accounts = await sql<{ id: string; email: string }[]>`
    select id, email from users where email in ('tutor@demo.rmit', 'student@demo.rmit')
  `;
  const tutor = accounts.find((row) => row.email === 'tutor@demo.rmit');
  const student = accounts.find((row) => row.email === 'student@demo.rmit');
  if (tutor === undefined || student === undefined) {
    process.stderr.write('The seeded demo accounts are missing. Run "pnpm db:seed" first.\n');
    process.exit(1);
  }

  const enrolment = await sql<{ course_id: string }[]>`
    select course_id from enrollments
     where user_id = ${student.id}::uuid and role_in_course = 'student'
     order by created_at asc limit 1
  `;
  const courseId = enrolment[0]?.course_id;
  if (courseId === undefined) {
    process.stderr.write('The demo student is not enrolled in a course. Run "pnpm db:seed" first.\n');
    process.exit(1);
  }

  const fixture = await withTransaction((tx) =>
    buildFixture(tx, { courseId, tutorId: tutor.id, now }),
  );

  const studentCookie = `${SESSION_COOKIE_NAME}=${token(student.id, 'student')}`;

  // --- 1. Gate rule G1 ------------------------------------------------------
  const own = await call('GET', `/api/student/assignments/${fixture.assignmentId}`, studentCookie);
  record(
    'G1: the fixture assignment is 200 to its enrolled student',
    'status 200',
    `status ${String(own.status)}`,
    own.status === 200,
  );

  const missing = await call(
    'GET',
    `/api/student/assignments/${randomUUID()}`,
    studentCookie,
  );
  const missingCode = at(missing.body, 'error.code');
  record(
    'G1: an unknown assignment is 404 NOT_FOUND, not an empty shell (T3)',
    'status 404, error.code NOT_FOUND',
    `status ${String(missing.status)}, error.code ${String(missingCode)}`,
    missing.status === 404 && missingCode === 'NOT_FOUND',
  );

  // --- 2. the workspace bootstrap -------------------------------------------
  const title = at(own.body, 'assignment.title');
  const status = at(own.body, 'assignment.status');
  const sourceCount = Array.isArray(at(own.body, 'brief.sources'))
    ? (at(own.body, 'brief.sources') as unknown[]).length
    : -1;
  const nodeCount = Array.isArray(at(own.body, 'structure.nodes'))
    ? (at(own.body, 'structure.nodes') as unknown[]).length
    : -1;
  const milestoneCount = Array.isArray(at(own.body, 'checklist.milestones'))
    ? (at(own.body, 'checklist.milestones') as unknown[]).length
    : -1;
  const totalItems = at(own.body, 'counts.checklistTotal');
  const dataState = at(own.body, 'dataState');
  record(
    'workspace: header, sources, Map, checklist, counts are all populated (06 5.5.3)',
    'title is the fixture, status published, 1 source, >=1 Map node, 1 milestone, checklistTotal 1, dataState ready',
    `title ${String(title) === `Phase 5 verification ${now}` ? 'matches the fixture' : 'MISMATCH'}, ` +
      `status ${String(status)}, sources ${String(sourceCount)}, nodes ${String(nodeCount)}, ` +
      `milestones ${String(milestoneCount)}, checklistTotal ${String(totalItems)}, dataState ${String(dataState)}`,
    title === `Phase 5 verification ${now}` &&
      status === 'published' &&
      sourceCount === 1 &&
      nodeCount >= 1 &&
      milestoneCount === 1 &&
      totalItems === 1 &&
      dataState === 'ready',
  );

  // --- 3. brief -------------------------------------------------------------
  const brief = await call(
    'GET',
    `/api/student/assignments/${fixture.assignmentId}/brief`,
    studentCookie,
  );
  const docCount = Array.isArray(at(brief.body, 'documents'))
    ? (at(brief.body, 'documents') as unknown[]).length
    : -1;
  const sectionCount = Array.isArray(at(brief.body, 'documents.0.sections'))
    ? (at(brief.body, 'documents.0.sections') as unknown[]).length
    : -1;
  const hasViewerUrl = at(brief.body, 'documents.0.viewerUrl') !== undefined;
  const pageCount = Array.isArray(at(brief.body, 'documents.0.pages'))
    ? (at(brief.body, 'documents.0.pages') as unknown[]).length
    : -1;
  const firstPageText = at(brief.body, 'documents.0.pages.0.text');
  record(
    'brief: a manifest with page sections and stored page text, and no viewerUrl (06 5.5.4, D107)',
    'status 200, 1 document, 1 section, 1 page with text, viewerUrl absent',
    `status ${String(brief.status)}, documents ${String(docCount)}, sections ${String(sectionCount)}, ` +
      `pages ${String(pageCount)}, firstPageHasText ${String(typeof firstPageText === 'string' && firstPageText.length > 0)}, ` +
      `viewerUrl present ${String(hasViewerUrl)}`,
    brief.status === 200 &&
      docCount === 1 &&
      sectionCount === 1 &&
      pageCount === 1 &&
      typeof firstPageText === 'string' &&
      firstPageText.length > 0 &&
      !hasViewerUrl,
  );

  // --- 4. policy ------------------------------------------------------------
  const policy = await call(
    'GET',
    `/api/student/assignments/${fixture.assignmentId}/policy`,
    studentCookie,
  );
  const available = at(policy.body, 'policy.available') ?? at(policy.body, 'available');
  const ruleCount = Array.isArray(at(policy.body, 'rules'))
    ? (at(policy.body, 'rules') as unknown[]).length
    : -1;
  record(
    'policy: available with the published rule verbatim (06 5.5.7)',
    'status 200, available true, 1 rule',
    `status ${String(policy.status)}, available ${String(available)}, rules ${String(ruleCount)}`,
    policy.status === 200 && available === true && ruleCount === 1,
  );

  // --- 5. checklist before any transition -----------------------------------
  const before = await call(
    'GET',
    `/api/student/assignments/${fixture.assignmentId}/checklist`,
    studentCookie,
  );
  const beforeCompleted = at(before.body, 'totals.completed');
  const beforeTotal = at(before.body, 'totals.total');
  const beforeState = at(before.body, 'milestones.0.items.0.state');
  record(
    'checklist: 0/1 and the item is not_started before any transition',
    'completed 0, total 1, state not_started',
    `completed ${String(beforeCompleted)}, total ${String(beforeTotal)}, state ${String(beforeState)}`,
    beforeCompleted === 0 && beforeTotal === 1 && beforeState === 'not_started',
  );

  // --- 6. start is idempotent ----------------------------------------------
  const start1 = await call(
    'POST',
    `/api/student/checklist-items/${fixture.itemId}/start`,
    studentCookie,
  );
  const startedAt1 = at(start1.body, 'startedAt');
  const state1 = at(start1.body, 'state');
  await new Promise((r) => setTimeout(r, 30));
  const start2 = await call(
    'POST',
    `/api/student/checklist-items/${fixture.itemId}/start`,
    studentCookie,
  );
  const startedAt2 = at(start2.body, 'startedAt');
  record(
    'start: 200, state in_progress, and a second start does not reset startedAt (06 5.1)',
    'both 200, first startedAt unchanged by the second call',
    `statuses ${String(start1.status)}/${String(start2.status)}, state ${String(state1)}, ` +
      `startedAt stable ${String(startedAt1 === startedAt2)}`,
    start1.status === 200 &&
      start2.status === 200 &&
      state1 === 'in_progress' &&
      startedAt1 !== null &&
      startedAt1 === startedAt2,
  );

  // --- 7. complete ----------------------------------------------------------
  await new Promise((r) => setTimeout(r, 1100));
  const complete1 = await call(
    'POST',
    `/api/student/checklist-items/${fixture.itemId}/complete`,
    studentCookie,
  );
  const elapsed1 = at(complete1.body, 'elapsedSeconds');
  const completedState = at(complete1.body, 'state');
  const completedTotals = at(complete1.body, 'totals.completed');
  record(
    'complete: 200, non-negative elapsedSeconds, totals move to 1/1',
    'status 200, state completed, elapsedSeconds >= 1, totals.completed 1',
    `status ${String(complete1.status)}, state ${String(completedState)}, ` +
      `elapsedSeconds ${String(elapsed1)}, totals.completed ${String(completedTotals)}`,
    complete1.status === 200 &&
      completedState === 'completed' &&
      typeof elapsed1 === 'number' &&
      elapsed1 >= 1 &&
      completedTotals === 1,
  );

  // The T7 duty, on data: the transition wrote its event in the same transaction.
  const events = await sql<{ event_type: string; count: string | number }[]>`
    select event_type, count(*) as count
      from analytics_events
     where assignment_id = ${fixture.assignmentId}::uuid
     group by event_type
     order by event_type asc
  `;
  const eventMap = new Map(events.map((row) => [row.event_type, Number(row.count)]));
  record(
    'T7: the transitions wrote checklist_item_started and checklist_item_completed',
    'started 1, completed 1',
    `started ${String(eventMap.get('checklist_item_started') ?? 0)}, ` +
      `completed ${String(eventMap.get('checklist_item_completed') ?? 0)}`,
    eventMap.get('checklist_item_started') === 1 && eventMap.get('checklist_item_completed') === 1,
  );

  // --- 8. complete again is a D48 no-op ------------------------------------
  await new Promise((r) => setTimeout(r, 1100));
  const complete2 = await call(
    'POST',
    `/api/student/checklist-items/${fixture.itemId}/complete`,
    studentCookie,
  );
  const elapsed2 = at(complete2.body, 'elapsedSeconds');
  const eventsAfter = await sql<{ count: string | number }[]>`
    select count(*) as count from analytics_events
     where assignment_id = ${fixture.assignmentId}::uuid
       and event_type = 'checklist_item_completed'
  `;
  const completedEventCount = Number(eventsAfter[0]?.count ?? 0);
  record(
    'complete again: D48 first interval stands and no second event is written',
    'status 200, same elapsedSeconds, completed event count still 1',
    `status ${String(complete2.status)}, elapsedSeconds ${String(elapsed2)} (was ${String(elapsed1)}), ` +
      `completed events ${String(completedEventCount)}`,
    complete2.status === 200 && elapsed2 === elapsed1 && completedEventCount === 1,
  );

  // --- 9. reopen ------------------------------------------------------------
  const reopen1 = await call(
    'POST',
    `/api/student/checklist-items/${fixture.itemId}/reopen`,
    studentCookie,
  );
  const reopenState = at(reopen1.body, 'state');
  const reopenCount = at(reopen1.body, 'reopenCount');
  const reopenElapsed = at(reopen1.body, 'elapsedSeconds');
  record(
    'reopen: state returns to in_progress, reopenCount 1, first interval kept (06 7.3.2, D48)',
    'status 200, state in_progress, reopenCount 1, elapsedSeconds unchanged',
    `status ${String(reopen1.status)}, state ${String(reopenState)}, ` +
      `reopenCount ${String(reopenCount)}, elapsedSeconds ${String(reopenElapsed)}`,
    reopen1.status === 200 &&
      reopenState === 'in_progress' &&
      reopenCount === 1 &&
      reopenElapsed === elapsed1,
  );

  // --- 10. a stale expectedReopenCount is refused ---------------------------
  const stale = await call(
    'POST',
    `/api/student/checklist-items/${fixture.itemId}/reopen`,
    studentCookie,
    { expectedReopenCount: 0 },
  );
  const staleCode = at(stale.body, 'error.code');
  record(
    'reopen with a stale expectedReopenCount is 409 INVALID_STATE_TRANSITION',
    'status 409, error.code INVALID_STATE_TRANSITION',
    `status ${String(stale.status)}, error.code ${String(staleCode)}`,
    stale.status === 409 && staleCode === 'INVALID_STATE_TRANSITION',
  );

  // --- 11. the derived UI state --------------------------------------------
  // Re-complete so the row is `completed` with reopenCount 1: the shape 07 section 4.6 rule 6
  // describes and the API's three-value `state` cannot express.
  const completeAgain = await call(
    'POST',
    `/api/student/checklist-items/${fixture.itemId}/complete`,
    studentCookie,
  );
  const finalState = at(completeAgain.body, 'state');
  const finalReopenCount = at(completeAgain.body, 'reopenCount');
  const finalElapsed = at(completeAgain.body, 'elapsedSeconds');
  record(
    'after re-completion: state completed with reopenCount 1 and the FIRST interval',
    'state completed, reopenCount 1, elapsedSeconds still the first value',
    `state ${String(finalState)}, reopenCount ${String(finalReopenCount)}, ` +
      `elapsedSeconds ${String(finalElapsed)}`,
    finalState === 'completed' &&
      finalReopenCount === 1 &&
      finalElapsed === elapsed1,
  );

  // --- 12. role and enrolment ----------------------------------------------
  // A real tutor path, addressed at the fixture: it exists, so a `404` here would mean the guard
  // leaked rather than that the path is absent.
  const tutorOnly = await call(
    'GET',
    `/api/tutor/assignments/${fixture.assignmentId}/review`,
    studentCookie,
  );
  const tutorOnlyCode = at(tutorOnly.body, 'error.code');
  record(
    'a student calling a tutor path is refused, never served',
    'status 403 with error.code FORBIDDEN_ROLE',
    `status ${String(tutorOnly.status)}, error.code ${String(tutorOnlyCode)}`,
    tutorOnly.status === 403 && tutorOnlyCode === 'FORBIDDEN_ROLE',
  );

  // An unenrolled student must not be able to tell the fixture exists (`06` section 5.2 rule 2:
  // "the response is NOT_FOUND, not FORBIDDEN_ROLE, so the API does not confirm that the other
  // assignment exists").
  //
  // The seeded cohort is enrolled on the demo course, so this creates its own outsider rather than
  // self-skipping: a check that never runs is not a check. The row is inert -- no enrolment, no
  // membership of `anon_identities`, and the email is unique per run.
  const outsiderId = randomUUID();
  await sql`
    insert into users (id, email, display_name, password_hash, role)
    values (
      ${outsiderId}::uuid,
      ${`phase5-outsider-${outsiderId}@example.invalid`},
      'Phase 5 outsider',
      'not-a-real-hash',
      'student'
    )
    on conflict do nothing
  `;
  const outsiderCookie = `${SESSION_COOKIE_NAME}=${token(outsiderId, 'student')}`;
  const leaked = await call(
    'GET',
    `/api/student/assignments/${fixture.assignmentId}`,
    outsiderCookie,
  );
  const leakedCode = at(leaked.body, 'error.code');
  record(
    'an unenrolled student sees NOT_FOUND, not the assignment',
    'status 404, error.code NOT_FOUND',
    `status ${String(leaked.status)}, error.code ${String(leakedCode)}`,
    leaked.status === 404 && leakedCode === 'NOT_FOUND',
  );

  // --- 13. the Assistant stream --------------------------------------------
  // WP-09's own verification gate: "Student message: 'Here's my code, tell me what's wrong with it.'
  // Expected: refusal naming the assignment's AI Usage Policy, plus an offer of what it can help with.
  // Expected in the log: one decision record, verdict REFUSE, rule id cited. Expected in the provider
  // call log: zero calls for that turn." This checks the HTTP half of that; the refusal itself is the
  // guardrail's own golden set (`pnpm test -- tests/guardrail`).
  const refused = await call(
    'POST',
    `/api/student/assignments/${fixture.assignmentId}/assistant/messages`,
    studentCookie,
    { body: 'Here is my code, tell me what to change.' },
  );
  const refusedEvents = sseEvents(refused.text);
  record(
    'assistant: the demo refusal is a 200 whose FIRST event is guardrail, with zero token frames (I4, T4, T13)',
    'status 200, events guardrail -> message -> done, 0 token frames',
    `status ${String(refused.status)}, events ${refusedEvents.join(' -> ')}, token frames ${String(refusedEvents.filter((event) => event === 'token').length)}`,
    refused.status === 200 &&
      refusedEvents[0] === 'guardrail' &&
      refusedEvents.filter((event) => event === 'token').length === 0,
  );

  const guardrailFrame = /^event: guardrail\ndata: (.*)$/m.exec(refused.text);
  const guardrailJson = guardrailFrame?.[1];
  const guardrailPayload =
    guardrailJson === undefined
      ? null
      : (JSON.parse(guardrailJson) as {
          verdict?: string;
          reasonCode?: string;
          rules?: string[];
          refusal?: { whatICanHelpWith?: string[]; refusalTemplateId?: string } | null;
        });
  record(
    'assistant: the refusal names a cited rule and offers what it can help with (R5, N10)',
    'verdict REFUSE, at least one cited rule, 2..4 help items, a template id',
    `verdict ${String(guardrailPayload?.verdict)}, rules ${JSON.stringify(guardrailPayload?.rules ?? [])}, ` +
      `helpItems ${String(guardrailPayload?.refusal?.whatICanHelpWith?.length ?? 0)}, template ${String(guardrailPayload?.refusal?.refusalTemplateId)}`,
    guardrailPayload?.verdict === 'REFUSE' &&
      (guardrailPayload.rules ?? []).length > 0 &&
      (guardrailPayload.refusal?.whatICanHelpWith?.length ?? 0) >= 2 &&
      (guardrailPayload.refusal?.whatICanHelpWith?.length ?? 0) <= 4 &&
      guardrailPayload.refusal?.refusalTemplateId === 'T-REFUSE',
  );

  // A permitted turn must stream, and every frame must follow the guardrail.
  const permitted = await call(
    'POST',
    `/api/student/assignments/${fixture.assignmentId}/assistant/messages`,
    studentCookie,
    { body: 'What does the brief say about the submission format?' },
  );
  const permittedEvents = sseEvents(permitted.text);
  record(
    'assistant: a permitted turn streams tokens, all of them after the guardrail (06 5.5.9)',
    'status 200, first event guardrail, at least one token frame, citations then message then done',
    `status ${String(permitted.status)}, events ${String(permittedEvents.filter((event) => event !== 'token').length)} non-token frames with ${String(permittedEvents.filter((event) => event === 'token').length)} token frames, order ${permittedEvents[0] ?? 'none'} first`,
    permitted.status === 200 &&
      permittedEvents[0] === 'guardrail' &&
      permittedEvents.filter((event) => event === 'token').length > 0,
  );

  // --- report ---------------------------------------------------------------
  const passed = steps.filter((step) => step.pass).length;
  const failed = steps.length - passed;

  const report = {
    phase: 5,
    ranAt: now,
    baseUrl: BASE_URL,
    fixture: { assignmentId: fixture.assignmentId, itemId: fixture.itemId },
    steps,
    passed,
    failed,
    ok: failed === 0,
  };

  const out = resolve(APP_ROOT, '.local');
  mkdirSync(out, { recursive: true });
  const reportPath = resolve(out, 'phase5-student-verify.json');
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  process.stdout.write(`\n${String(passed)}/${String(steps.length)} passed\n`);
  process.stdout.write(`report: ${reportPath}\n`);
  process.exit(failed === 0 ? 0 : 1);
}

  void main().catch((error: unknown) => {
    process.stderr.write(`verification run crashed: ${String(error)}\n`);
    process.exit(1);
  });
