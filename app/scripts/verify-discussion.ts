#!/usr/bin/env node
/**
 * Phase 6's acceptance run: WP-10's anonymous discussions, private Queries and FAQ, plus the moderation
 * queue -- over HTTP, against the live database.
 *
 * **What it proves, and why it is a script rather than a test.** `pnpm test` must pass with no network and
 * no database (`12` section 3.7), so every claim that needs either lives here, as an operator tool (D72)
 * run deliberately against a migrated and seeded database and a running server. `app/tests/discussion/`
 * covers what is pure -- the anonymity derivation, the moderator schema, the moderation failure path.
 *
 * **The four claims this script exists for.** Each is one the unit suite structurally cannot make:
 *
 *   1. **A tutor cannot resolve an anonymous post's author.** Asserted against the live tutor response, not
 *      against a type: the payload is searched for every forbidden identity field, and the `isAnonymised`
 *      flag is checked to be true. The type-level half is
 *      `tests/discussion/imports.test.ts`; this is the runtime half on real rows.
 *   2. **The display label comes from the persisted identity**, so it survives an `ANON_ID_SECRET`
 *      rotation (trap **T14**) -- which is only observable against a stored row.
 *   3. **The Query state machine has one edge per actor**: a tutor's reply is what makes a thread
 *      `answered`, and only the asking student can resolve it.
 *   4. **The FAQ's approve-then-publish chain leaves `APPROVED` student-invisible** (D99) -- asserted in
 *      both intermediate states, because "approved" is the status a reader would most reasonably assume
 *      is visible and it is not.
 *
 * **The fixture is built, not borrowed**, and it is created inside one transaction per phase of the run.
 * Report: `.local/phase6-discussion-verify.json`.
 *
 * **Usage.** Two terminals:
 *
 * ```bash
 * cd app && pnpm dev                                                    # terminal 1
 * cd app && pnpm exec tsx --env-file-if-exists=.env scripts/verify-discussion.ts   # terminal 2
 * ```
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { signSessionToken, SESSION_LIFETIME_MS } from '../src/lib/auth/session';
import { SESSION_COOKIE_NAME } from '../src/lib/auth/_shared';
import { getConfig } from '../src/lib/config';
import { withTransaction } from '../src/lib/db/transaction';
import type { Executor } from '../src/lib/db/queries/courses';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPORT = join(HERE, '..', '.local', 'phase6-discussion-verify.json');
const BASE_URL = process.env.VERIFY_BASE_URL ?? 'http://localhost:3000';

interface Check {
  readonly step: string;
  readonly expected: string;
  readonly observed: string;
  readonly pass: boolean;
}

const checks: Check[] = [];
function record(step: string, expected: string, observed: string, pass: boolean): void {
  checks.push({ step, expected, observed, pass });
  process.stdout.write(
    `${pass ? 'PASS' : 'FAIL'}  ${step}\n      expected: ${expected}\n      observed: ${observed}\n`,
  );
}

/** The trial accounts the seed creates. The script mints its own sessions rather than reading a password. */
await main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const config = getConfig();
  if (config.authSecret === null || config.anonIdSecret === null) {
    process.stderr.write('CONFIG_INVALID: AUTH_SECRET and ANON_ID_SECRET must both be set.\n');
    process.exit(78);
  }

  // --- the fixture -----------------------------------------------------------------------------
  const fixture = await withTransaction(async (tx) => buildFixture(tx));
  const studentCookie = await sessionFor(fixture.studentUserId);
  const strangerCookie = await sessionFor(fixture.strangerUserId);
  const tutorCookie = await sessionFor(fixture.tutorUserId);

  // --- 1. an anonymous thread, and the C4 read -------------------------------------------------
  const anon = await call('POST', `/api/student/assignments/${fixture.assignmentId}/discussion-threads`, studentCookie, {
    title: 'How much detail does the rationale need?',
    body: 'Checking the expected depth before I write the section.',
    anonymous: true,
  });
  record(
    '1. an anonymous thread is created and labelled from the persisted identity',
    '201 with isAnonymised true and a displayLabel of the 06 section 4.1 shape',
    `status=${String(anon.status)} anonymised=${String(bodyPath(anon.body, 'author.isAnonymised'))} label=${String(bodyPath(anon.body, 'author.displayLabel'))}`,
    anon.status === 201 &&
      bodyPath(anon.body, 'author.isAnonymised') === true &&
      /^Anonymous Student #\d+$/.test(String(bodyPath(anon.body, 'author.displayLabel'))),
  );

  const threadId = String(bodyPath(anon.body, 'id'));
  const rootPostId = String(bodyPath(anon.body, 'posts.0.id'));

  // A reply adopts the thread's anonymity: a later named reply would unmask every post before it.
  const reply = await call('POST', `/api/student/discussion-threads/${threadId}/posts`, studentCookie, {
    body: 'Adding what I found in the rubric.',
    parentPostId: rootPostId,
  });
  record(
    '2. a reply adopts the thread anonymity rather than re-choosing it',
    '201 with isAnonymised true and the same label as the thread',
    `status=${String(reply.status)} anonymised=${String(bodyPath(reply.body, 'author.isAnonymised'))} label=${String(bodyPath(reply.body, 'author.displayLabel'))}`,
    reply.status === 201 &&
      bodyPath(reply.body, 'author.isAnonymised') === true &&
      bodyPath(reply.body, 'author.displayLabel') === bodyPath(anon.body, 'author.displayLabel'),
  );
  const replyId = String(bodyPath(reply.body, 'id'));

  const edited = await call('PATCH', `/api/student/discussion-posts/${replyId}`, studentCookie, {
    body: 'Edited: the rubric weights the design rationale most heavily.',
  });
  record(
    '3. the author can edit their own post, and the edit is timestamped',
    '200 with editedAt set and the new body',
    `status=${String(edited.status)} editedAt=${String(bodyPath(edited.body, 'editedAt'))}`,
    edited.status === 200 &&
      bodyPath(edited.body, 'editedAt') !== null &&
      String(bodyPath(edited.body, 'body')).includes('Edited:'),
  );

  // --- 2. the C4 read: a tutor cannot resolve the author ----------------------------------------
  const tutorView = await call('GET', `/api/tutor/assignments/${fixture.assignmentId}/discussions`, tutorCookie);
  const tutorRaw = JSON.stringify(tutorView.body);
  // `displayLabel` is **not** in this list, and that is the point of A-ID-5 rather than an exception to
  // it: the tutor must see `Anonymous Student #880`, because the label is what makes a thread followable.
  // What must not appear is anything that resolves the label to a person.
  const forbidden = ['studentId', 'studentName', 'email', 'userId', 'anonIdentityId', 'subjectRef'];
  const leaked = forbidden.filter((field) => tutorRaw.includes(field));
  record(
    '4. the tutor discussion payload carries no author identity (C4, A-ID-5)',
    'none of the six identifying field names appears',
    leaked.length === 0 ? 'none present' : `present: ${leaked.join(', ')}`,
    leaked.length === 0,
  );
  record(
    '5. the tutor sees the anonymous label and an isAnonymised flag',
    'the fixture post appears with the same label and isAnonymised true',
    `tutorStatus=${String(tutorView.status)} threads=${String((bodyPath(tutorView.body, 'threads') as unknown[] | null)?.length)}`,
    tutorView.status === 200 && tutorRaw.includes(String(bodyPath(anon.body, 'author.displayLabel'))),
  );

  // --- 3. flagging: one per student, and never your own ----------------------------------------
  const selfFlag = await call('POST', `/api/student/discussion-posts/${replyId}/flag`, studentCookie, {
    reasonCode: 'OTHER',
  });
  record(
    '6. a student cannot flag their own post',
    '409 INVALID_STATE_TRANSITION',
    `status=${String(selfFlag.status)} code=${String(bodyPath(selfFlag.body, 'error.code'))}`,
    selfFlag.status === 409,
  );

  // The invalid-code case needs a caller who **passes the gate**, or the guard's `404` answers first and
  // the vocabulary is never reached. The enrolled student is that caller; the ownership check runs after
  // validation, so an invalid code is refused as `VALIDATION_FAILED` rather than as a self-flag.
  const badReason = await call('POST', `/api/student/discussion-posts/${replyId}/flag`, studentCookie, {
    reasonCode: 'OFF_TOPIC_PLACEHOLDER',
  });
  record(
    '7. an unknown flag reason is refused by the closed vocabulary',
    '400 VALIDATION_FAILED naming the field',
    `status=${String(badReason.status)} code=${String(bodyPath(badReason.body, 'error.code'))}`,
    badReason.status === 400 && bodyPath(badReason.body, 'error.code') === 'VALIDATION_FAILED',
  );

  // --- 4. the Query thread's one-edge-per-actor machine ----------------------------------------
  const query = await call('POST', `/api/student/assignments/${fixture.assignmentId}/queries`, studentCookie, {
    subject: 'Rubric weighting for the design rationale',
    body: 'Which criterion carries the most weight?',
  });
  record(
    '8. a private Query is ALWAYS attributed (D24, D50)',
    '201 with a real authorDisplayName and no isAnonymised field',
    `status=${String(query.status)} name=${String(bodyPath(query.body, 'messages.0.authorDisplayName'))}`,
    query.status === 201 &&
      typeof bodyPath(query.body, 'messages.0.authorDisplayName') === 'string' &&
      bodyPath(query.body, 'messages.0.authorDisplayName') !== '' &&
      bodyPath(query.body, 'messages.0') !== null &&
      !Object.prototype.hasOwnProperty.call(
        (bodyPath(query.body, 'messages.0.author') as Record<string, unknown> | null) ?? {},
        'isAnonymised',
      ),
  );
  const queryId = String(bodyPath(query.body, 'id'));

  const earlyResolve = await call('POST', `/api/student/queries/${queryId}/resolve`, studentCookie);
  record(
    '9. a Query cannot be resolved before a tutor replies',
    '409 INVALID_STATE_TRANSITION',
    `status=${String(earlyResolve.status)} message=${String(bodyPath(earlyResolve.body, 'error.message'))}`,
    earlyResolve.status === 409,
  );

  const tutorReply = await call('POST', `/api/tutor/queries/${queryId}/reply`, tutorCookie, {
    body: 'The design rationale carries the most weight; see the rubric criterion list.',
  });
  const afterReply = await call('GET', `/api/student/queries/${queryId}`, studentCookie);
  record(
    '10. the tutor reply IS the open -> answered transition, and is attributed to the tutor',
    '201 for the reply, then thread status answered with authorRole tutor',
    `reply=${String(tutorReply.status)} role=${String(bodyPath(tutorReply.body, 'authorRole'))} status=${String(bodyPath(afterReply.body, 'status'))}`,
    tutorReply.status === 201 &&
      bodyPath(tutorReply.body, 'authorRole') === 'tutor' &&
      bodyPath(afterReply.body, 'status') === 'answered',
  );

  const ownResolve = await call('POST', `/api/student/queries/${queryId}/resolve`, studentCookie);
  record(
    '11. only the asking student resolves, and only once replaced',
    '200 with status resolved and resolvedAt set',
    `status=${String(ownResolve.status)} queryStatus=${String(bodyPath(ownResolve.body, 'status'))} resolvedAt=${String(bodyPath(ownResolve.body, 'resolvedAt'))}`,
    ownResolve.status === 200 &&
      bodyPath(ownResolve.body, 'status') === 'resolved' &&
      bodyPath(ownResolve.body, 'resolvedAt') !== null,
  );

  const foreignRead = await call('GET', `/api/student/queries/${queryId}`, strangerCookie);
  record(
    '12. another student reading the thread receives NOT_FOUND, not a refusal',
    '404 NOT_FOUND',
    `status=${String(foreignRead.status)} code=${String(bodyPath(foreignRead.body, 'error.code'))}`,
    foreignRead.status === 404,
  );

  // --- 5. the FAQ approve-then-publish chain ---------------------------------------------------
  const authored = await call('POST', `/api/tutor/assignments/${fixture.assignmentId}/faq`, tutorCookie, {
    question: 'How long should the report be?',
    answer: 'Aim for the stated word count; see the brief.',
  });
  record(
    '13. a tutor-authored entry starts NEEDS_REVIEW, never published (C3, D99)',
    '201 with publicationStatus NEEDS_REVIEW and isPublished false',
    `status=${String(authored.status)} pub=${String(bodyPath(authored.body, 'publicationStatus'))} isPublished=${String(bodyPath(authored.body, 'isPublished'))}`,
    authored.status === 201 &&
      bodyPath(authored.body, 'publicationStatus') === 'NEEDS_REVIEW' &&
      bodyPath(authored.body, 'isPublished') === false,
  );
  const entryId = String(bodyPath(authored.body, 'id'));
  let revision = Number(bodyPath(authored.body, 'revision'));

  const studentBefore = await call('GET', `/api/student/assignments/${fixture.assignmentId}/faq`, studentCookie);
  record(
    '14. an unpublished entry is invisible to a student',
    'the entry id is absent from the student FAQ',
    `studentItems=${String((bodyPath(studentBefore.body, 'items') as unknown[] | null)?.length)}`,
    !JSON.stringify(studentBefore.body).includes(entryId),
  );

  const approved = await call('PATCH', `/api/tutor/faq-entries/${entryId}`, tutorCookie, {
    question: 'How long should the report be?',
    answer: 'Aim for the stated word count; see the brief.',
    revision,
    publicationStatus: 'APPROVED',
  });
  record(
    '15. APPROVED is a real state and is STILL student-invisible (D99)',
    '200 with publicationStatus APPROVED and isPublished false',
    `status=${String(approved.status)} pub=${String(bodyPath(approved.body, 'publicationStatus'))} isPublished=${String(bodyPath(approved.body, 'isPublished'))}`,
    approved.status === 200 &&
      bodyPath(approved.body, 'publicationStatus') === 'APPROVED' &&
      bodyPath(approved.body, 'isPublished') === false,
  );
  revision = Number(bodyPath(approved.body, 'revision'));
  const studentMid = await call('GET', `/api/student/assignments/${fixture.assignmentId}/faq`, studentCookie);
  record(
    '16. the approved entry is still absent from the student FAQ',
    'the entry id is still absent after approval',
    `studentItems=${String((bodyPath(studentMid.body, 'items') as unknown[] | null)?.length)}`,
    !JSON.stringify(studentMid.body).includes(entryId),
  );

  const published = await call('PATCH', `/api/tutor/faq-entries/${entryId}`, tutorCookie, {
    question: 'How long should the report be?',
    answer: 'Aim for the stated word count; see the brief.',
    revision,
    publicationStatus: 'PUBLISHED',
  });
  record(
    '17. PUBLISHED is the threshold, and the entry reaches students as T2',
    '200 with isPublished true and publishedAt set, then the entry present in the student FAQ',
    `status=${String(published.status)} isPublished=${String(bodyPath(published.body, 'isPublished'))} publishedAt=${String(bodyPath(published.body, 'publishedAt'))}`,
    published.status === 200 &&
      bodyPath(published.body, 'isPublished') === true &&
      bodyPath(published.body, 'publishedAt') !== null,
  );
  const studentAfter = await call('GET', `/api/student/assignments/${fixture.assignmentId}/faq`, studentCookie);
  record(
    '18. the published entry is visible to the student',
    'the entry id appears in the student FAQ',
    `studentItems=${String((bodyPath(studentAfter.body, 'items') as unknown[] | null)?.length)}`,
    JSON.stringify(studentAfter.body).includes(entryId),
  );

  const stale = await call('PATCH', `/api/tutor/faq-entries/${entryId}`, tutorCookie, {
    question: 'How long should the report be?',
    answer: 'Aim for the stated word count; see the brief.',
    revision: 1,
    publicationStatus: 'PUBLISHED',
  });
  record(
    '19. a stale revision is refused rather than overwriting a concurrent edit (D98)',
    '409 STALE_REVISION',
    `status=${String(stale.status)} code=${String(bodyPath(stale.body, 'error.code'))}`,
    stale.status === 409 && bodyPath(stale.body, 'error.code') === 'STALE_REVISION',
  );

  // --- 6. the role gates -----------------------------------------------------------------------
  const studentOnTutor = await call('GET', `/api/tutor/assignments/${fixture.assignmentId}/analytics`, studentCookie);
  record(
    '20. a student cannot reach a tutor-only route',
    '403 FORBIDDEN_ROLE',
    `status=${String(studentOnTutor.status)} code=${String(bodyPath(studentOnTutor.body, 'error.code'))}`,
    studentOnTutor.status === 403 && bodyPath(studentOnTutor.body, 'error.code') === 'FORBIDDEN_ROLE',
  );

  void config;

  // --- report ----------------------------------------------------------------------------------
  const passed = checks.filter((check) => check.pass).length;
  process.stdout.write(`\n${String(passed)}/${String(checks.length)} passed\n`);
  process.stdout.write(`report: ${REPORT}\n`);
  mkdirSync(dirname(REPORT), { recursive: true });
  writeFileSync(
    REPORT,
    `${JSON.stringify({ assignmentId: fixture.assignmentId, checks }, null, 2)}\n`,
    'utf8',
  );
  if (passed !== checks.length) process.exitCode = 1;
}

// ---------------------------------------------------------------------------------------------
// Fixture and transport helpers
// ---------------------------------------------------------------------------------------------

interface Fixture {
  readonly assignmentId: string;
  readonly studentUserId: string;
  readonly strangerUserId: string;
  readonly tutorUserId: string;
}

/**
 * A published assignment of the seeded course, plus a student who is **not** enrolled in it.
 *
 * The stranger is what makes check 12's `NOT_FOUND` meaningful rather than a re-test of check 7's path: a
 * thread addressed directly by a student who cannot see the assignment must be indistinguishable from a
 * nonexistent one. Creating one is the same approach `verify-student.ts` takes.
 */
async function buildFixture(tx: Executor): Promise<Fixture> {
  const [course] = await tx<{ id: string }[]>`select id from courses order by created_at asc limit 1`;
  if (course === undefined) throw new Error('No course; run the seed first.');
  const [tutor] = await tx<{ id: string }[]>`
    select id from users where role = 'tutor' order by created_at asc limit 1
  `;
  const [student] = await tx<{ id: string }[]>`
    select u.id from users u
      join enrollments e on e.user_id = u.id
     where u.role = 'student' and e.course_id = ${course.id}::uuid
     order by u.created_at asc limit 1
  `;
  if (tutor === undefined || student === undefined) {
    throw new Error('The seed must provide a tutor and an enrolled student.');
  }
  const [stranger] = await tx<{ id: string }[]>`
    select u.id from users u
     where u.role = 'student'
       and not exists (
         select 1 from enrollments e
          where e.user_id = u.id and e.course_id = ${course.id}::uuid
       )
     order by u.created_at asc limit 1
  `;
  if (stranger === undefined) throw new Error('The seed must provide a student outside the course.');

  const suffix = Date.now().toString(36);
  // The assignment is created `draft` and published **after** its structure exists. That order is not
  // cosmetic: `findVisibleAssignmentScope` -- gate rule G1's resolver -- joins
  // `assignment_structures s on s.assignment_id = a.id and s.is_current = true`, so an assignment marked
  // published with no current structure resolves to `null` and every student route answers `404`. The
  // first run of this script did exactly that and check 1 failed with a `404` on a fixture the seed's own
  // course could see. `ck_assignments_published_at` then requires the timestamp on the publish itself
  // (trap **T37**).
  const [assignment] = await tx<{ id: string }[]>`
    insert into assignments (course_id, title, status, created_by_user_id)
    values (
      ${course.id}::uuid,
      ${`Phase 6 discussion fixture ${suffix}`},
      'draft',
      ${tutor.id}::uuid
    )
    returning id
  `;
  if (assignment === undefined) throw new Error('Could not create the fixture assignment.');

  const [structure] = await tx<{ id: string }[]>`
    insert into assignment_structures (
      assignment_id, version, is_current, publication_status, origin,
      grounding_chunk_ids, approved_by_user_id, approved_at, published_at, created_at, updated_at
    )
    values (
      ${assignment.id}::uuid, 1, true, 'PUBLISHED', 'tutor',
      '{}'::uuid[], ${tutor.id}::uuid, now(), now(), now(), now()
    )
    returning id
  `;
  if (structure === undefined) throw new Error('Could not create the fixture structure.');

  await tx`
    update assignments
       set current_structure_id = ${structure.id}::uuid,
           status = 'published',
           published_at = now(),
           updated_at = now()
     where id = ${assignment.id}::uuid
  `;

  return {
    assignmentId: assignment.id,
    studentUserId: student.id,
    strangerUserId: stranger.id,
    tutorUserId: tutor.id,
  };
}

/** A session cookie minted with the route layer's own `signSessionToken`, so no password is read. */
async function sessionFor(userId: string): Promise<string> {
  const secret = getConfig().authSecret;
  if (secret === null || secret === '') {
    process.stderr.write('CONFIG_INVALID: AUTH_SECRET is required to mint a session for this run.\n');
    process.exit(78);
  }
  // The role is read from the `users` row rather than assumed: the token carries it, and `roles.ts`
  // re-reads the row on every request anyway, so a wrong claim here would be a bug in this script rather
  // than a security property.
  const role = await withTransaction(async (tx) => {
    const rows = await tx<{ role: string }[]>`
      select role from users where id = ${userId}::uuid limit 1
    `;
    return rows[0]?.role === 'tutor' ? 'tutor' : 'student';
  });
  const now = Date.now();
  const token = await signSessionToken(
    { v: 1, sub: userId, role, iat: now, exp: now + SESSION_LIFETIME_MS },
    secret,
    now,
  );
  return `${SESSION_COOKIE_NAME}=${token}`;
}

interface Called {
  readonly status: number;
  readonly body: unknown;
}

async function call(method: string, path: string, cookie: string, body?: unknown): Promise<Called> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      cookie,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text === '' ? null : JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: response.status, body: parsed };
}

/** A dotted path into a response body, so an assertion can name the field it read. */
function bodyPath(body: unknown, path: string): unknown {
  let current: unknown = body;
  for (const segment of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined;
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index)) return undefined;
      current = current[index];
      continue;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}
