#!/usr/bin/env node
/**
 * Phase 4's acceptance run: WP-06's gate, over HTTP, against the live database.
 *
 * **What it proves, and why it is a script rather than a test.** `pnpm test` must pass with no network
 * and no database (`12` section 3.7), so the route-level claims of Phase 4 cannot live in the suite.
 * They can live here, because this script is an operator tool (D72) run deliberately against a
 * migrated and seeded database and a running server, and its output is the evidence the handoff
 * quotes. `app/tests/review/` covers everything that is pure: the state machine, the field rules, the
 * recomputed validation, the publish gates.
 *
 * **The seven steps, and what each would catch.**
 *
 *   1. `NEEDS_REVIEW` content is `404` to a student -- gate rule G1 before approval (T3).
 *   2. **After approving, it is still `404`.** This is the assertion that makes D99 real: a build that
 *      treated `APPROVED` as the visibility threshold passes every other step here and fails this one.
 *   3. After publishing, the same request is `200`, and only `PUBLISHED` artifacts are in the map.
 *   4. Editing a published artifact returns it to `EDITED` and it leaves the student's map
 *      immediately -- transition 8 and T-18.
 *   5. Two concurrent PATCHes with the same `expectedRevision`: one `200`, one `409 STALE_REVISION`
 *      (T-19).
 *   6. A PATCH carrying `verbatimText` is `409 IMMUTABLE_FIELD` -- C2 and I-2 as an API refusal.
 *   7. A policy rule code with no guardrail capability mapping is refused at write time with the code
 *      named (T22, D101) -- the failure that would otherwise disable the Assistant silently.
 *
 * **Usage.** Two terminals:
 *
 * ```bash
 * cd app && pnpm dev                                   # terminal 1
 * pnpm exec tsx --env-file-if-exists=.env scripts/verify-review.ts   # terminal 2
 * ```
 *
 * `BASE_URL` overrides the default `http://localhost:3000`. The script writes its full report to
 * `.local/phase4-review-verify.json` (gitignored) and prints a pass/fail line per step.
 *
 * **It creates rows and does not delete them.** The fixture assignment is named
 * `Review demo (<HH:MM>)`, so it is readable in the database and harmless if left: it is published, it
 * belongs to the seeded course, and no student is enrolled in a way that its presence changes.
 * Deleting it would also delete the audit trail this run exists to produce.
 *
 * **The name was `Phase 4 verification <ISO timestamp>` until it was noticed in the sidebar.** That
 * form is unambiguous in a database and unreadable in the product, and the fixtures share a database
 * with the demo -- so every run added a row of raw ISO digits to the course tree a person actually
 * looks at. A fixture name is part of the demo's surface when the two share a database.
 */

import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

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
  promoteStructureToNeedsReview,
} from '../src/lib/db/queries/structure';
import { signSessionToken, SESSION_LIFETIME_MS } from '../src/lib/auth/session';
import { SESSION_COOKIE_NAME } from '../src/lib/auth/_shared';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const REQUEST_TIMEOUT_MS = 20_000;

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

/** One HTTP call with a session cookie. Returns the status and the parsed body. */
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

/**
 * A page as HTML, with the session cookie.
 *
 * Distinct from `call` because a page is not JSON: `call` parses the body and returns `null` for HTML,
 * so a page assertion needs the text. It also asserts the rendered markup rather than a payload, which
 * is the only way to check that a badge a payload carries actually reaches a screen (C3).
 */
async function page(path: string, cookie: string): Promise<{ status: number; html: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      headers: { accept: 'text/html', cookie },
      signal: controller.signal,
      redirect: 'manual',
    });
    return { status: response.status, html: await response.text() };
  } finally {
    clearTimeout(timer);
  }
}

function bodyPath(body: unknown, path: string): unknown {  let current: unknown = body;
  for (const key of path.split('.')) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/**
 * A session cookie value for a seeded account.
 *
 * Signing in through `/api/auth/login` would exercise one more real path, but it also needs the demo
 * password and would make this script depend on the seed publishing credentials in a configurable
 * way. The token is the same value the login route would mint -- `signSessionToken` is that route's
 * own function, and `roles.ts` re-reads the `users` row on every request, so the session is as real
 * as a form login. What this script is verifying is the review and visibility logic, not the login
 * form (Phase 1's).
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

async function main(): Promise<void> {
  const config = getConfig();
  if (config.databaseUrl === null) {
    process.stderr.write('CONFIG_INVALID: DATABASE_URL is required for this script\n');
    process.exit(78);
  }

  // A cheap liveness check first: everything below is meaningless against a server that is not up,
  // and "fetch failed" is a much worse error message than "start pnpm dev".
  const health = await call('GET', '/api/health', null);
  if (health.status !== 200) {
    process.stderr.write(
      `The server did not answer /api/health (status ${String(health.status)}). Start it with "pnpm dev".\n`,
    );
    process.exit(1);
  }

  const sql = getSql(config.databaseUrl);
  const now = new Date().toISOString();

  // --- fixture ---------------------------------------------------------------
  const ids = {
    assignment: randomUUID(),
    structure: randomUUID(),
    source: randomUUID(),
    chunk: randomUUID(),
    requirement: randomUUID(),
    milestone: randomUUID(),
    item: randomUUID(),
    faq: randomUUID(),
    rule: randomUUID(),
  };

  const accounts = await sql<{ id: string; email: string }[]>`
    select id, email from users where email in ('tutor@demo.rmit', 'student@demo.rmit')
  `;
  const tutor = accounts.find((row) => row.email === 'tutor@demo.rmit');
  const student = accounts.find((row) => row.email === 'student@demo.rmit');
  if (tutor === undefined || student === undefined) {
    process.stderr.write('The seeded demo accounts are missing. Run "pnpm db:seed" first.\n');
    process.exit(1);
  }
  const course = await sql<{ id: string }[]>`select id from courses order by created_at asc limit 1`;
  const courseId = course[0]?.id;
  if (courseId === undefined) {
    process.stderr.write('No course found. Run "pnpm db:seed" first.\n');
    process.exit(1);
  }

  const provenance = {
    modelId: 'verification',
    promptVersion: 'phase4-verify',
    generatedAt: now,
    groundingChunkIds: [ids.chunk],
  };
  const aiStamp = {
    publicationStatus: 'AI_GENERATED' as const,
    approvedByUserId: null,
    approvedAt: null,
    publishedAt: null,
  };

  await withTransaction(async (tx) => {
    await insertAssignmentIfAbsent(tx, {
      id: ids.assignment,
      courseId,
      title: `Review demo (${now.slice(11, 16)})`,
      status: 'draft',
      dueAt: null,
      createdByUserId: tutor.id,
      publishedAt: null,
    });
    await insertSourceIfAbsent(tx, {
      id: ids.source,
      assignmentId: ids.assignment,
      uploadedByUserId: tutor.id,
      kind: 'brief',
      originalFilename: 'phase4-verify.txt',
      storageKey: `verify/${ids.source}`,
      mimeType: 'text/plain',
      byteSize: 128,
      pageCount: null,
      contentHash: 'f'.repeat(64),
      extractionStatus: 'extracted',
    });
    await insertSourceChunkIfAbsent(tx, {
      id: ids.chunk,
      assignmentId: ids.assignment,
      sourceId: ids.source,
      chunkIndex: 0,
      text: 'Submit one file only. The analysis criterion is worth 40 percent.',
      pageFrom: null,
      pageTo: null,
      sectionLabel: null,
      charCount: 72,
    });
    await insertStructureIfAbsent(tx, {
      id: ids.structure,
      assignmentId: ids.assignment,
      version: 1,
      isCurrent: true,
      origin: 'ai',
      provenance,
      groundingChunkIds: [ids.chunk],
      stamp: aiStamp,
    });
    await tx`
      update assignments set current_structure_id = ${ids.structure}::uuid, status = 'in_review'
       where id = ${ids.assignment}::uuid
    `;
    await insertRequirementNodeIfAbsent(tx, {
      id: ids.requirement,
      assignmentId: ids.assignment,
      structureId: ids.structure,
      parentRequirementNodeId: null,
      title: 'Deliverable and submission',
      verbatimText: 'Submit one file only.',
      sourceChunkId: ids.chunk,
      sourcePage: null,
      sourceSectionLabel: null,
      mapSummary: 'AI interpretation of the submission requirement.',
      displayOrder: 0,
      origin: 'ai',
      provenance,
      groundingChunkIds: [ids.chunk],
      stamp: aiStamp,
    });
    await insertMilestoneIfAbsent(tx, {
      id: ids.milestone,
      assignmentId: ids.assignment,
      structureId: ids.structure,
      title: 'Prepare the submission',
      summary: null,
      displayOrder: 0,
      origin: 'ai',
      provenance,
      groundingChunkIds: [ids.chunk],
      stamp: aiStamp,
    });
    await tx`
      insert into milestone_requirement_links (id, assignment_id, requirement_node_id, milestone_id, created_by_user_id)
      values (${randomUUID()}::uuid, ${ids.assignment}::uuid, ${ids.requirement}::uuid, ${ids.milestone}::uuid, null)
    `;
    await insertChecklistItemIfAbsent(tx, {
      id: ids.item,
      assignmentId: ids.assignment,
      structureId: ids.structure,
      milestoneId: ids.milestone,
      title: 'Verify the file format',
      planningLevel: 'verify',
      description: null,
      displayOrder: 0,
      origin: 'ai',
      provenance,
      groundingChunkIds: [ids.chunk],
      stamp: aiStamp,
    });
    await insertAiPolicyRuleIfAbsent(tx, {
      id: ids.rule,
      assignmentId: ids.assignment,
      structureId: ids.structure,
      ruleCode: 'no_answer_generation',
      ruleText: 'The assistant must not write the assignment on the student behalf.',
      effect: 'PROHIBIT',
      appliesTo: 'assistant',
      sourceChunkId: ids.chunk,
      displayOrder: 0,
      origin: 'ai',
      provenance,
      groundingChunkIds: [ids.chunk],
      stamp: aiStamp,
    });
    // Transition 2 (`06` section 3.2), the same call the ingestion pipeline makes: the fixture is
    // `AI_GENERATED` on insert and `NEEDS_REVIEW` before the tutor can review it.
    await promoteStructureToNeedsReview(tx, { structureId: ids.structure, faqEntryIds: [ids.faq] });
  });

  const tutorCookie = `${SESSION_COOKIE_NAME}=${token(tutor.id, 'tutor')}`;
  const studentCookie = `${SESSION_COOKIE_NAME}=${token(student.id, 'student')}`;
  const mapPath = `/api/student/assignments/${ids.assignment}/structure`;
  const reviewPath = `/api/tutor/assignments/${ids.assignment}/review`;

  // --- Step 1: G1 before approval -------------------------------------------
  const before = await call('GET', mapPath, studentCookie);
  record(
    '1. NEEDS_REVIEW content is not student-visible',
    '404 NOT_FOUND',
    `${String(before.status)} ${String(bodyPath(before.body, 'error.code') ?? '')}`,
    before.status === 404,
  );

  // --- review bundle --------------------------------------------------------
  const review = await call('GET', reviewPath, tutorCookie);
  const counts = bodyPath(review.body, 'counts') as Record<string, number> | undefined;
  record(
    '2. The review bundle reads the fixture',
    '200 with 5 NEEDS_REVIEW and 0 PUBLISHED',
    `${String(review.status)} needsReview=${String(counts?.['NEEDS_REVIEW'])} published=${String(counts?.['PUBLISHED'])}`,
    review.status === 200 && counts?.['NEEDS_REVIEW'] === 5 && counts?.['PUBLISHED'] === 0,
  );
  record(
    '3. No run has ever been requested, so ingestion is null (I-39)',
    'ingestion === null',
    `ingestion=${JSON.stringify(bodyPath(review.body, 'ingestion'))}`,
    bodyPath(review.body, 'ingestion') === null,
  );
  const blockers = bodyPath(review.body, 'gates.publishBlockers') as string[] | undefined;
  record(
    '4. Publish is blocked with no approved policy rule',
    'canPublish false, blockers include NO_POLICY_RULE_APPROVED',
    `canPublish=${String(bodyPath(review.body, 'gates.canPublish'))} blockers=${JSON.stringify(blockers)}`,
    bodyPath(review.body, 'gates.canPublish') === false &&
      (blockers ?? []).includes('NO_POLICY_RULE_APPROVED'),
  );

  // --- the review page renders, and C3's badge is on it ---------------------
  //
  // This is the page Phase 4 deliberately did not build (I-44: `tokens.css` declared no token, so no
  // screen could render correctly). Phase 5 built the token layer and then the page, so the check that
  // was impossible here is now the one that matters: **C3's marker is on screen for an unapproved AI
  // artifact**. The assertion is on the rendered HTML, not on the bundle, because the bundle could be
  // correct while the page showed an unmarked artifact -- which is precisely the failure C3 forbids.
  const reviewPage = await page(`/tutor/assignments/${ids.assignment}/review`, tutorCookie);
  record(
    '4b. the review page renders, and every unapproved AI artifact carries the C3 marker (C3, I-44)',
    '200 with "Review queue", "Approve", and the fixed pre-approval string',
    `status ${String(reviewPage.status)}, hasQueue ${String(reviewPage.html.includes('Review queue'))}, ` +
      `hasApprove ${String(reviewPage.html.includes('Approve'))}, ` +
      `hasMarker ${String(reviewPage.html.includes('AI generated - requires tutor approval'))}`,
    reviewPage.status === 200 &&
      reviewPage.html.includes('Review queue') &&
      reviewPage.html.includes('Approve') &&
      reviewPage.html.includes('AI generated - requires tutor approval'),
  );
  record(
    '4c. the page states that approving is not publishing (D99)',
    'the sentence is present, so the two controls cannot be confused for one',
    `present ${String(reviewPage.html.includes('only publishing makes it student-visible'))}`,
    reviewPage.html.includes('only publishing makes it student-visible'),
  );

  const artifacts = (bodyPath(review.body, 'artifacts') ?? []) as Array<{
    id: string;
    kind: string;
    revision: number;
  }>;
  const milestoneArtifact = artifacts.find((artifact) => artifact.kind === 'milestone');
  const requirementArtifact = artifacts.find((artifact) => artifact.kind === 'requirement_node');
  const itemArtifact = artifacts.find((artifact) => artifact.kind === 'checklist_item');
  if (milestoneArtifact === undefined || requirementArtifact === undefined || itemArtifact === undefined) {
    process.stderr.write('The review bundle did not return the fixture artifacts.\n');
    process.exit(1);
  }

  // --- approve-all ----------------------------------------------------------
  const approve = await call('POST', `/api/tutor/assignments/${ids.assignment}/approve`, tutorCookie);
  record(
    '5. Approve-all moves every reviewable artifact to APPROVED',
    '200 with approved 5',
    `${String(approve.status)} approved=${String(bodyPath(approve.body, 'approved'))}`,
    approve.status === 200 && bodyPath(approve.body, 'approved') === 5,
  );

  // --- Step 2: APPROVED is still invisible (D99) ----------------------------
  const afterApprove = await call('GET', mapPath, studentCookie);
  record(
    '6. APPROVED is still not student-visible (D99, I-21)',
    '404 NOT_FOUND',
    `${String(afterApprove.status)} ${String(bodyPath(afterApprove.body, 'error.code') ?? '')}`,
    afterApprove.status === 404,
  );

  // --- publish --------------------------------------------------------------
  const publish = await call('POST', `/api/tutor/assignments/${ids.assignment}/publish`, tutorCookie, {});
  record(
    '7. Publish succeeds once every gate is clear',
    '200 with status published',
    `${String(publish.status)} status=${String(bodyPath(publish.body, 'status'))}`,
    publish.status === 200 && bodyPath(publish.body, 'status') === 'published',
  );

  // --- Step 3: G1 after publish --------------------------------------------
  const afterPublish = await call('GET', mapPath, studentCookie);
  const nodes = (bodyPath(afterPublish.body, 'nodes') ?? []) as Array<{ id: string; kind: string }>;
  const edges = (bodyPath(afterPublish.body, 'edges') ?? []) as unknown[];
  // The fixture publishes a requirement, a milestone and a checklist item. The structure row is not a
  // Map node (it is the container) and the policy rule is not either, which is why the expected count
  // is 3 rather than the 5 artifacts the review bundle lists.
  record(
    '8. After publish the student sees the map',
    '200 with the 3 published nodes and at least one edge',
    `${String(afterPublish.status)} nodes=${String(nodes.length)} edges=${String(edges.length)} label=${String(bodyPath(afterPublish.body, 'label'))}`,
    afterPublish.status === 200 &&
      nodes.length === 3 &&
      edges.length >= 2 &&
      bodyPath(afterPublish.body, 'label') === 'AI-generated interpretation',
  );

  // --- Step 4: transition 8 removes a published artifact from student reads --
  //
  // The revision must be re-read here: approve and publish each bumped it, so the value captured from
  // the first bundle read is stale by design. Using the stale value is exactly the T-19 race, and
  // asserting `EDITED` against it would have failed for the right reason (which the first run of this
  // script did).
  const afterPublishReview = await call('GET', reviewPath, tutorCookie);
  const publishedArtifacts = (bodyPath(afterPublishReview.body, 'artifacts') ?? []) as Array<{
    id: string;
    revision: number;
  }>;
  const currentMilestoneRevision =
    publishedArtifacts.find((artifact) => artifact.id === milestoneArtifact.id)?.revision ??
    milestoneArtifact.revision;

  const edited = await call(
    'PATCH',
    `/api/tutor/structure-artifacts/${milestoneArtifact.id}`,
    tutorCookie,
    {
      expectedRevision: currentMilestoneRevision,
      action: 'save',
      payload: { title: 'Prepare and submit' },
    },
  );
  const afterEdit = await call('GET', mapPath, studentCookie);
  const nodesAfterEdit = (bodyPath(afterEdit.body, 'nodes') ?? []) as Array<{ id: string }>;
  record(
    '9. Editing a PUBLISHED artifact withdraws it immediately (transition 8, T-18)',
    '200 EDITED, and the milestone is absent from the student map while the requirement remains',
    `${String(edited.status)} status=${String(bodyPath(edited.body, 'publicationStatus'))} milestoneStillVisible=${String(nodesAfterEdit.some((node) => node.id === milestoneArtifact.id))} requirementVisible=${String(nodesAfterEdit.some((node) => node.id === requirementArtifact.id))}`,
    edited.status === 200 &&
      bodyPath(edited.body, 'publicationStatus') === 'EDITED' &&
      !nodesAfterEdit.some((node) => node.id === milestoneArtifact.id) &&
      nodesAfterEdit.some((node) => node.id === requirementArtifact.id),
  );

  // --- Step 5: T-19, two concurrent PATCHes with the same expectedRevision --
  const fresh = await call('GET', reviewPath, tutorCookie);
  const freshArtifacts = (bodyPath(fresh.body, 'artifacts') ?? []) as Array<{
    id: string;
    kind: string;
    revision: number;
  }>;
  const target = freshArtifacts.find((artifact) => artifact.id === itemArtifact.id);
  const sameRevision = target?.revision ?? itemArtifact.revision;
  const [raceA, raceB] = await Promise.all([
    call('PATCH', `/api/tutor/structure-artifacts/${itemArtifact.id}`, tutorCookie, {
      expectedRevision: sameRevision,
      action: 'save',
      payload: { description: 'Edited by writer A.' },
    }),
    call('PATCH', `/api/tutor/structure-artifacts/${itemArtifact.id}`, tutorCookie, {
      expectedRevision: sameRevision,
      action: 'save',
      payload: { description: 'Edited by writer B.' },
    }),
  ]);
  const statuses = [raceA.status, raceB.status].sort();
  record(
    '10. Two concurrent PATCHes with one revision: one wins, one is refused (T-19)',
    '[200, 409]',
    JSON.stringify(statuses),
    statuses[0] === 200 && statuses[1] === 409,
  );
  record(
    '11. The refusal is STALE_REVISION, not a generic conflict',
    '409 STALE_REVISION',
    `${String(raceA.status === 409 ? bodyPath(raceA.body, 'error.code') : bodyPath(raceB.body, 'error.code'))}`,
    bodyPath(raceA.status === 409 ? raceA.body : raceB.body, 'error.code') === 'STALE_REVISION',
  );

  // --- Step 6: IMMUTABLE_FIELD on a T1 verbatim field ----------------------
  const immutable = await call(
    'PATCH',
    `/api/tutor/structure-artifacts/${requirementArtifact.id}`,
    tutorCookie,
    {
      expectedRevision: requirementArtifact.revision,
      action: 'save',
      payload: { verbatimText: 'A paraphrase presented as the requirement.' },
    },
  );
  record(
    '12. A verbatim requirement cannot be paraphrased through the API (C2, I-2)',
    '409 IMMUTABLE_FIELD with verbatimText named',
    `${String(immutable.status)} ${String(bodyPath(immutable.body, 'error.code'))} fields=${JSON.stringify(bodyPath(immutable.body, 'error.details.fields'))}`,
    immutable.status === 409 &&
      bodyPath(immutable.body, 'error.code') === 'IMMUTABLE_FIELD' &&
      JSON.stringify(bodyPath(immutable.body, 'error.details.fields')) === '["verbatimText"]',
  );

  // --- Step 7: the policy rule-code guard (T22/D101) -----------------------
  const unmapped = await call(
    'POST',
    `/api/tutor/assignments/${ids.assignment}/artifacts`,
    tutorCookie,
    {
      kind: 'ai_policy_rule',
      structureId: ids.structure,
      payload: {
        ruleCode: 'no_vibes_based_grading',
        ruleText: 'The assistant must not grade anything.',
        effect: 'PROHIBIT',
        appliesTo: 'assistant',
      },
    },
  );
  record(
    '13. An unmapped assistant-applicable rule code is refused at write time (T22)',
    '400 VALIDATION_FAILED naming the code',
    `${String(unmapped.status)} ${String(bodyPath(unmapped.body, 'error.code'))} message=${String(bodyPath(unmapped.body, 'error.message'))}`,
    unmapped.status === 400 &&
      bodyPath(unmapped.body, 'error.code') === 'VALIDATION_FAILED' &&
      String(bodyPath(unmapped.body, 'error.message')).includes('no_vibes_based_grading'),
  );

  const mapped = await call(
    'POST',
    `/api/tutor/assignments/${ids.assignment}/artifacts`,
    tutorCookie,
    {
      kind: 'ai_policy_rule',
      structureId: ids.structure,
      payload: {
        // A mapped **capability** rule: `policyFromRows` enforces ALLOW/PROHIBIT through the
        // capability algebra, which is where a missing mapping would make the policy `POL_INVALID`.
        ruleCode: 'explain_assessment_documents',
        ruleText: 'Explain what the assignment documents ask for, in the documents own words.',
        effect: 'ALLOW',
        appliesTo: 'assistant',
      },
    },
  );
  record(
    '14. A mapped rule code is accepted, and the new artifact starts NEEDS_REVIEW',
    '201 with publicationStatus NEEDS_REVIEW',
    `${String(mapped.status)} status=${String(bodyPath(mapped.body, 'publicationStatus'))} ${String(bodyPath(mapped.body, 'error.message') ?? '')}`,
    mapped.status === 201 && bodyPath(mapped.body, 'publicationStatus') === 'NEEDS_REVIEW',
  );

  const escalation = await call(
    'POST',
    `/api/tutor/assignments/${ids.assignment}/artifacts`,
    tutorCookie,
    {
      kind: 'ai_policy_rule',
      structureId: ids.structure,
      payload: {
        // T31: an ESCALATE rule needs no capability mapping, because the guardrail enforces it through
        // a named subject. The first run of this script refused this row, which was the guard being
        // stricter than the validator -- a false refusal, not a fail-closed default.
        ruleCode: 'route_uncertain_requests_to_tutor',
        ruleText: 'Ask your tutor when the documents do not settle a question.',
        effect: 'ESCALATE_TO_TUTOR',
        appliesTo: 'assistant',
      },
    },
  );
  record(
    '15. An escalation rule is accepted even though it has no capability mapping (T31)',
    '201 with publicationStatus NEEDS_REVIEW',
    `${String(escalation.status)} status=${String(bodyPath(escalation.body, 'publicationStatus'))} ${String(bodyPath(escalation.body, 'error.message') ?? '')}`,
    escalation.status === 201 && bodyPath(escalation.body, 'publicationStatus') === 'NEEDS_REVIEW',
  );

  // --- a second publish is refused, because the assignment is already out ----
  const secondPublish = await call(
    'POST',
    `/api/tutor/assignments/${ids.assignment}/publish`,
    tutorCookie,
    {},
  );
  record(
    '16. A second publish is refused with the reason named',
    '409 INVALID_STATE_TRANSITION, reason ASSIGNMENT_NOT_IN_REVIEW',
    `${String(secondPublish.status)} reason=${String(bodyPath(secondPublish.body, 'error.details.reason'))}`,
    secondPublish.status === 409 &&
      bodyPath(secondPublish.body, 'error.details.reason') === 'ASSIGNMENT_NOT_IN_REVIEW',
  );

  // --- the audit trail exists ----------------------------------------------
  const auditRows = await sql<{ action: string }[]>`
    select action from audit_logs
     where target_id in (${ids.assignment}::uuid, ${ids.structure}::uuid)
        or target_id = any(${[milestoneArtifact.id, itemArtifact.id]}::uuid[])
     order by created_at asc
  `;
  const actions = auditRows.map((row) => row.action);
  const expectedActions = ['artifact.approved_all', 'assignment.published', 'artifact.edited'];
  record(
    '17. Every mutating tutor action wrote an audit row (06 section 3.5 rule 4)',
    `rows include ${expectedActions.join(', ')} twice for artifact.edited (the milestone edit and the race)`,
    JSON.stringify(actions),
    expectedActions.every((action) => actions.includes(action)) &&
      actions.filter((action) => action === 'artifact.edited').length >= 2,
  );

  // --- the state machine's own refusal names the attempted transition -------
  //
  // The requirement node is still PUBLISHED (nothing has touched it since publish), so asking to
  // approve it is the transition `06` section 3.2 does not have: nothing moves *into* APPROVED from
  // PUBLISHED. The refusal must name the action, which is what WP-06's acceptance criterion asks for.
  const latest = await call('GET', reviewPath, tutorCookie);
  const latestArtifacts = (bodyPath(latest.body, 'artifacts') ?? []) as Array<{
    id: string;
    revision: number;
    publicationStatus: string;
  }>;
  const stillPublished = latestArtifacts.find(
    (artifact) => artifact.id === requirementArtifact.id && artifact.publicationStatus === 'PUBLISHED',
  );
  const illegal = await call(
    'PATCH',
    `/api/tutor/structure-artifacts/${requirementArtifact.id}`,
    tutorCookie,
    {
      expectedRevision: stillPublished?.revision ?? requirementArtifact.revision,
      action: 'approve',
      payload: {},
    },
  );
  record(
    '18. Approving an already-published artifact is refused, naming the transition',
    '409 INVALID_STATE_TRANSITION with the action in the message',
    `${String(illegal.status)} ${String(bodyPath(illegal.body, 'error.code'))} message=${String(bodyPath(illegal.body, 'error.message'))}`,
    illegal.status === 409 &&
      bodyPath(illegal.body, 'error.code') === 'INVALID_STATE_TRANSITION' &&
      String(bodyPath(illegal.body, 'error.message')).includes('approve'),
  );

  const report = {
    ranAt: now,
    baseUrl: BASE_URL,
    assignmentId: ids.assignment,
    steps,
    passed: steps.filter((step) => step.pass).length,
    failed: steps.filter((step) => !step.pass).length,
  };

  const out = resolve(process.cwd(), '.local', 'phase4-review-verify.json');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  process.stdout.write(
    `\n${String(report.passed)}/${String(steps.length)} passed. Report: ${out}\n`,
  );
  await sql.end({ timeout: 5 });
  process.exit(report.failed === 0 ? 0 : 1);
}

await main();
