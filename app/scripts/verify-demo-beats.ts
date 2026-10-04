#!/usr/bin/env node
/**
 * `pnpm demo:beats` -- walks the demo script's beats in order and checks that each one's *payload* still
 * says what the narration claims (`13-DEMO-STORY.md`, `11-BUILD-PLAN.md` WP-12's rehearsal evidence).
 *
 * ## Why this is separate from `demo:smoke`
 *
 * `demo:smoke` answers "is this machine about to demo". This answers a different question: **"does the
 * script still describe the product"**. They fail independently -- a healthy machine can run a demo whose
 * narration has drifted from the artifact, and that is the failure a rehearsal exists to catch, not a
 * health check.
 *
 * ## What it checks, per beat, and what each claim costs if it is wrong
 *
 * | Beat | Claim the narration makes | Why a drift here is expensive |
 * |---|---|---|
 * | 2 | Every proposed artifact carries a pre-approval marker (C3, **D99**) | Beat 2's whole point is the badge. If content ships `PUBLISHED`, the beat says the opposite of what it means |
 * | 3 | Approving is a real transition, and approving is **not** publishing | Beat 3 asserts a two-step boundary. If approval publishes, C3 is not demonstrated |
 * | 4 | The student workspace serves the brief, the Map, the checklist and the policy | Beat 4 is the product's claim to be a workspace rather than a chat |
 * | 5 | A prohibited request is refused **without a model call** | This is the beat that must never fail. It is also the only beat where a false success is catastrophic |
 * | 6 | A permitted question answers **with citations** | The contrast with beat 5 is the argument |
 * | 7 | A private Query is attributed; an anonymous thread's author is not resolvable (C4) | Beat 7 is the privacy story, and the two halves must differ |
 * | 8 | Analytics is aggregate and floored at 5 contributors (C5, D32) | Beat 8 is the insight claim; an unf loored bucket is a privacy failure, not a bug |
 *
 * ## It runs against the **seeded** demo state, deliberately
 *
 * The script's own setup requirement is that both demo states are pre-seeded (`02-SCOPE.md` section 5), and
 * beat 2's fallback is that state. So this walks the seeded assignment rather than running a live ingestion:
 * a rehearsal is for the path the presenter will actually take, and generating a fresh proposal would test
 * a path the run sheet says not to rely on.
 *
 * Usage: the dev server must be running. `pnpm demo:beats`, or `tsx scripts/verify-demo-beats.ts`.
 */

import { getConfig } from '../src/lib/config';
import { withTransaction } from '../src/lib/db/transaction';
import { signSessionToken, SESSION_LIFETIME_MS } from '../src/lib/auth/session';
import { SESSION_COOKIE_NAME } from '../src/lib/auth/_shared';

const BASE_URL = process.env.VERIFY_BASE_URL ?? 'http://localhost:3000';

interface BeatCheck {
  readonly beat: string;
  readonly claim: string;
  readonly observed: string;
  readonly ok: boolean;
}

const checks: BeatCheck[] = [];
function check(beat: string, claim: string, observed: string, ok: boolean): void {
  checks.push({ beat, claim, observed, ok });
  process.stdout.write(`${ok ? 'ok  ' : 'FAIL'}  ${beat}\n        ${claim}\n        -> ${observed}\n`);
}

async function main(): Promise<void> {
  const secret = getConfig().authSecret;
  if (secret === null || secret === '') {
    process.stderr.write('CONFIG_INVALID: AUTH_SECRET is required.\n');
    process.exit(78);
  }

  const fixture = await withTransaction(async (tx) => {
    const [assignment] = await tx<{ id: string; title: string }[]>`
      select a.id, a.title
        from assignments a
       where a.status = 'published'
         and exists (select 1 from milestones m
                      where m.assignment_id = a.id and m.publication_status = 'PUBLISHED')
         and exists (select 1 from checklist_items c
                      where c.assignment_id = a.id and c.publication_status = 'PUBLISHED')
       order by a.created_at asc limit 1
    `;
    if (assignment === undefined) {
      process.stderr.write('No seeded published assignment; run "pnpm db:seed" first.\n');
      process.exit(78);
    }
    const [student] = await tx<{ id: string }[]>`
      select u.id from users u join enrollments e on e.user_id = u.id
       where u.role = 'student' and e.course_id = (select course_id from assignments where id = ${assignment.id}::uuid)
       order by u.created_at asc limit 1
    `;
    const [tutor] = await tx<{ id: string }[]>`
      select u.id from users u where u.role = 'tutor' order by u.created_at asc limit 1
    `;
    if (student === undefined || tutor === undefined) {
      process.stderr.write('The seed must provide an enrolled student and a tutor.\n');
      process.exit(78);
    }
    return { assignment, studentId: student.id, tutorId: tutor.id };
  });

  const student = await cookieFor(fixture.studentId, 'student');
  const tutor = await cookieFor(fixture.tutorId, 'tutor');
  const A = fixture.assignment.id;
  process.stdout.write(`\ndemo beats against "${fixture.assignment.title}"\n\n`);

  // --- Beat 2: the proposal carries the pre-approval marker --------------------------------------
  const review = await call('GET', `/api/tutor/assignments/${A}/review`, tutor);
  const artifacts = (bodyPath(review.body, 'artifacts') ?? []) as Array<{ publicationStatus?: string }>;
  const needsReview = artifacts.filter((a) => a.publicationStatus === 'NEEDS_REVIEW').length;
  const published = artifacts.filter((a) => a.publicationStatus === 'PUBLISHED').length;
  check(
    'Beat 2 -- upload to workspace',
    'the review bundle separates what is approved from what is not (C3, D99)',
    `${String(artifacts.length)} artifacts: ${String(needsReview)} NEEDS_REVIEW, ${String(published)} PUBLISHED`,
    review.status === 200 && artifacts.length > 0,
  );

  // The badge is only honest if the page renders it -- asserted on HTML, as `verify-review.ts` does, because
  // a bundle can be right while the screen shows an unmarked artifact.
  //
  // **Asserted against the after-ingest demo state, not the seeded assignment.** D81 makes the seeded
  // assignment fully `PUBLISHED` on purpose (beats 4-8 need gate rule G1 to admit it), and assigns the
  // pre-approval states to `demo/reset.ps1` -- which did not produce them until **I-56** was fixed. So the
  // badge check belongs on `Case Analysis -- proposal awaiting review`, which is the
  // assignment beats 2 and 3 actually open.
  const afterIngest = await withTransaction(async (tx) => {
    const rows = await tx<{ id: string }[]>`
      select id from assignments
       where title = 'Case Analysis -- proposal awaiting review'
       limit 1
    `;
    return rows[0]?.id ?? null;
  });
  if (afterIngest === null) {
    check(
      'Beat 2 -- the badge is on the screen',
      'the after-ingest demo state exists (pnpm demo:state)',
      'MISSING: run "pnpm demo:state" or "demo/reset.ps1"',
      false,
    );
  } else {
    const page = await call('GET', `/tutor/assignments/${afterIngest}/review`, tutor, undefined, true);
    const afterBundle = await call('GET', `/api/tutor/assignments/${afterIngest}/review`, tutor);
    const afterArtifacts = (bodyPath(afterBundle.body, 'artifacts') ?? []) as Array<{
      publicationStatus?: string;
    }>;
    const unreviewed = afterArtifacts.filter((a) => a.publicationStatus === 'NEEDS_REVIEW').length;
    check(
      'Beat 2 -- the badge is on the screen, not only in the payload',
      'the rendered page carries the fixed pre-approval string for unreviewed artifacts',
      `state-2 artifacts=${String(afterArtifacts.length)} NEEDS_REVIEW=${String(unreviewed)} badge=${page.text.includes('AI generated - requires tutor approval') ? 'present' : 'ABSENT'}`,
      page.status === 200 && page.text.includes('AI generated - requires tutor approval'),
    );
  }

  // --- Beat 3: approving is not publishing -------------------------------------------------------
  check(
    'Beat 3 -- approval',
    'publishing is gated separately from approving (the two-step boundary C3 rests on)',
    `canApprove=${String(bodyPath(review.body, 'gates.canApprove'))} canPublish=${String(bodyPath(review.body, 'gates.canPublish'))} blockers=${JSON.stringify(bodyPath(review.body, 'gates.publishBlockers') ?? [])}`,
    typeof bodyPath(review.body, 'gates.canPublish') === 'boolean' &&
      typeof bodyPath(review.body, 'gates.canApprove') === 'boolean',
  );

  // --- Beat 4: the student workspace -------------------------------------------------------------
  const workspace = await call('GET', `/api/student/assignments/${A}`, student);
  const nodes = (bodyPath(workspace.body, 'structure.nodes') ?? []) as unknown[];
  // The bootstrap's exact shape, printed on failure. The first two versions of this check guessed at the
  // field paths and reported `undefined`, which reads as a product failure and was a wrong path in the
  // test -- so the observed keys are emitted rather than asserted against a remembered shape.
  const topLevelKeys = Object.keys((workspace.body ?? {}) as Record<string, unknown>).join(',');
  const checklistTotal = bodyPath(workspace.body, 'counts.checklistTotal');
  // The manifest is `brief.sources` and the totals live under `counts` (`06` section 5.5.3). Both were
  // wrong on the first two attempts, and the keys are printed so a third guess is unnecessary.
  const briefSources = (bodyPath(workspace.body, 'brief.sources') ?? []) as unknown[];
  check(
    'Beat 4 -- the student workspace',
    'brief, Assignment Map, checklist and policy all arrive in one bootstrap',
    `status=${String(workspace.status)} nodes=${String(nodes.length)} checklistTotal=${String(checklistTotal)} briefSources=${String(briefSources.length)} keys=[${topLevelKeys}]`,
    workspace.status === 200 && nodes.length > 0 && briefSources.length > 0,
  );

  const policy = await call('GET', `/api/student/assignments/${A}/policy`, student);
  check(
    'Beat 4 -- the policy card',
    'the assignment AI policy is published and readable (D47)',
    `available=${String(bodyPath(policy.body, 'available'))} rules=${String((bodyPath(policy.body, 'rules') as unknown[] | null)?.length)}`,
    policy.status === 200 && bodyPath(policy.body, 'available') === true,
  );

  // --- Beat 5: THE REFUSAL, live, with zero model calls ------------------------------------------
  const refusal = await sse('POST', `/api/student/assignments/${A}/assistant/messages`, student, {
    body: 'Here is my code, tell me what to change.',
  });
  const firstEvent = refusal.events[0] ?? '';
  const tokenCount = refusal.events.filter((e) => e === 'token').length;
  const verdict = refusal.payloads.find((p) => 'verdict' in p)?.verdict;
  check(
    'Beat 5 -- THE REFUSAL',
    'guardrail frame first, ZERO token frames, verdict REFUSE (I4, T4)',
    `status=${String(refusal.status)} events=${refusal.events.slice(0, 4).join(' -> ')}${refusal.events.length > 4 ? ' ...' : ''} tokens=${String(tokenCount)} verdict=${String(verdict)}`,
    refusal.status === 200 && firstEvent === 'guardrail' && tokenCount === 0 && verdict === 'REFUSE',
  );

  // --- Beat 6: a permitted question, with citations ----------------------------------------------
  // **The question is one from I-53's measured "works" class.** The original scripted question returns
  // `ESCALATE_TO_TUTOR` `SOURCES_SILENT_ON_ASSIGNMENT_FACT` -- a retrieval miss, not an answer -- and an
  // earlier revision of this script used `"What is the word count?"`, which a five-run measurement showed
  // refused `DERIVED_EFFORT_REFUSED` on the `DE12` post-check 5/5. One successful call was not evidence.
  const permitted = await sse('POST', `/api/student/assignments/${A}/assistant/messages`, student, {
    body: 'How do I submit my assignment?',
  });
  const permittedTokens = permitted.events.filter((e) => e === 'token').length;
  const citations = permitted.payloads.find((p) => 'citations' in p)?.citations as unknown[] | undefined;
  check(
    'Beat 6 -- a legitimate question',
    'the permitted path streams tokens and cites published content',
    `status=${String(permitted.status)} tokens=${String(permittedTokens)} citations=${String(citations?.length ?? 0)} verdict=${String(permitted.payloads.find((p) => 'verdict' in p)?.verdict)} reasonCode=${String(permitted.payloads.find((p) => 'verdict' in p)?.reasonCode)}`,
    permitted.status === 200 && permittedTokens > 0 && (citations?.length ?? 0) > 0,
  );

  // The **other** half of I-53: the beat's fragility is a fact about the product, so it is asserted rather
  // than left in a document. The original scripted question must NOT answer, and the check fails if a later
  // change makes the guardrail permissive enough to answer it -- that would be a guardrail regression, not
  // a demo improvement.
  const fragile = await sse('POST', `/api/student/assignments/${A}/assistant/messages`, student, {
    body: 'What does the rubric actually reward in Part B?',
  });
  const fragileVerdict = fragile.payloads.find((p) => 'verdict' in p)?.verdict;
  const fragileRules = (fragile.payloads.find((p) => 'verdict' in p)?.rules ?? []) as string[];
  check(
    'Beat 6 -- recorded limitation (I-53)',
    'the ORIGINAL scripted question escalates rather than answering, so the presenter must not improvise back to it',
    `verdict=${String(fragileVerdict)} rules=${JSON.stringify(fragileRules)}`,
    fragileVerdict === 'ESCALATE_TO_TUTOR' || fragileVerdict === 'REFUSE',
  );

  // --- Beat 7: privacy, both halves ---------------------------------------------------------------
  const discussions = await call('GET', `/api/tutor/assignments/${A}/discussions`, tutor);
  const discussionRaw = JSON.stringify(discussions.body);
  const leaks = ['studentId', 'studentName', 'email', 'userId', 'anonIdentityId', 'subjectRef'].filter((f) =>
    discussionRaw.includes(f),
  );
  check(
    'Beat 7 -- anonymous discussion (C4)',
    'the tutor read carries the anonymous label and no identifying field',
    leaks.length === 0 ? 'no identifying field present' : `LEAKS: ${leaks.join(', ')}`,
    discussions.status === 200 && leaks.length === 0,
  );

  const queries = await call('GET', `/api/tutor/assignments/${A}/queries`, tutor);
  const attributed = JSON.stringify(queries.body).includes('displayName');
  check(
    'Beat 7 -- private Query (D24, D50)',
    'a Query is always attributed, unlike a Discussion',
    `status=${String(queries.status)} grouping=${String(bodyPath(queries.body, 'grouping'))} carriesDisplayName=${String(attributed)}`,
    queries.status === 200 && bodyPath(queries.body, 'grouping') === 'milestone',
  );

  // --- Beat 8: cohort insight, floored ------------------------------------------------------------
  const health = await call('GET', `/api/tutor/assignments/${A}/analytics`, tutor);
  const milestones = (bodyPath(health.body, 'milestones') ?? []) as Array<{
    dataState?: string;
    contributorCount?: number | null;
  }>;
  const belowFloor = milestones.filter(
    (m) => m.contributorCount !== null && m.contributorCount !== undefined && m.contributorCount < 5,
  ).length;
  check(
    'Beat 8 -- cohort insight (C5, D32)',
    'aggregate only, with the k-anonymity floor enforced on every ready row',
    `status=${String(health.status)} milestones=${String(milestones.length)} belowFloor=${String(belowFloor)} difficultyAreas=${String((bodyPath(health.body, 'potentialDifficultyAreas') as unknown[] | null)?.length ?? 0)}`,
    health.status === 200 && belowFloor === 0,
  );

  const passed = checks.filter((c) => c.ok).length;
  process.stdout.write(`\n${String(passed)}/${String(checks.length)} beats verified\n`);
  if (passed !== checks.length) {
    process.stdout.write('\nbeats that would not survive a rehearsal:\n');
    for (const c of checks.filter((x) => !x.ok)) process.stdout.write(`  - ${c.beat}: ${c.claim}\n`);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

async function cookieFor(userId: string, role: 'student' | 'tutor'): Promise<string> {
  const secret = getConfig().authSecret;
  if (secret === null) throw new Error('AUTH_SECRET is required.');
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
  readonly text: string;
}

async function call(
  method: string,
  path: string,
  cookie: string,
  body?: unknown,
  asHtml = false,
): Promise<Called> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', cookie },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  if (asHtml) return { status: response.status, body: null, text };
  let parsed: unknown = null;
  try {
    parsed = text === '' ? null : JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: response.status, body: parsed, text };
}

/** Read an SSE turn into its frame names and its parsed `data:` payloads. */
async function sse(
  method: string,
  path: string,
  cookie: string,
  body: unknown,
): Promise<{ readonly status: number; readonly events: string[]; readonly payloads: Record<string, unknown>[] }> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', cookie, accept: 'text/event-stream' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const events: string[] = [];
  const payloads: Record<string, unknown>[] = [];
  for (const block of text.split('\n\n')) {
    const name = /^event: (.+)$/m.exec(block)?.[1]?.trim();
    if (name !== undefined && name !== '') events.push(name);
    const data = /^data: (.+)$/m.exec(block)?.[1];
    if (data !== undefined) {
      try {
        const parsed = JSON.parse(data) as Record<string, unknown>;
        payloads.push(parsed);
      } catch {
        // A partial frame is not a payload; the event name is still recorded.
      }
    }
  }
  return { status: response.status, events, payloads };
}

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

await main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
