#!/usr/bin/env node
/**
 * `pnpm demo:discussions` -- the seeded cohort discussion that `13-DEMO-STORY.md` beat 7 assumes.
 *
 * **The gap this closes.** Beat 7 opens with "a thread exists, posted as `Anonymous Student #482`", and
 * its own fallback is "show the seeded thread in both tabs". Neither was true of a freshly reset
 * database: `scripts/seed.ts` writes the cohort assignment, its structure, the private Query threads and
 * the FAQ, and creates **no** discussion thread. So the beat's opening screen was empty and its fallback
 * had nothing to fall back to -- which is exactly the class of defect a rehearsal finds and a unit test
 * cannot.
 *
 * **Why this is its own script rather than part of the seed.** `01-STATE.md` and D81 keep the seed's job
 * narrow (the cohort assignment, deterministic, read by every later phase's gate), and the discussion
 * rows are demo *presentation*: they exist so a screen has something to render. `demo/reset.ps1` runs
 * both, so a reset still produces the whole state in one command.
 *
 * **Idempotent by thread title**, like `demo-state.ts` is by assignment title: a second run finds the
 * threads it already wrote and adds nothing. It never modifies or deletes an existing row -- the four
 * acceptance runs write real threads beside these, and a script that cleaned up "its" rows by time
 * would eventually take one of theirs.
 *
 * **Two author kinds, on purpose.** One thread is anonymous (the beat's opening screen) and one is
 * attributed, because `07` section 6.3 draws a distinction the tab has to render: a pseudonym for an
 * anonymous thread and a display name for a named one. Both are written the way the product writes them
 * -- exactly one author column, enforced by `ck_posts_author_xor` -- so the seeded rows cannot be a
 * shape the service would refuse to produce.
 *
 * Usage: `pnpm demo:discussions` (needs the database; no server and no model call).
 */

import { randomUUID } from 'node:crypto';

import { getConfig } from '../src/lib/config';
import { withTransaction } from '../src/lib/db/transaction';
import type { Executor } from '../src/lib/db/queries/courses';
import { insertPost, insertThread, linkFirstPost } from '../src/lib/db/queries/discussions';
import { identityFor, type AnonymousIdentity } from '../src/features/discussion/anon-identity';

interface Fixture {
  readonly assignmentId: string;
  readonly assignmentTitle: string;
  readonly courseId: string;
  readonly anonStudentId: string;
  readonly namedStudentId: string;
  readonly namedLabel: string;
}

/** One seeded thread. `by` names which seeded author opens it. */
interface Seed {
  readonly title: string;
  readonly body: string;
  readonly by: 'anonymous' | 'named';
  readonly minutesAgo: number;
  /** Replies, in order. `anonymous` replies adopt the replying student's own pseudonym. */
  readonly replies: readonly string[];
}

/**
 * The three threads. Written as questions a cohort would actually ask about a report assignment that
 * asks for a case analysis and a design proposal -- and deliberately **without answers**: a seeded
 * discussion is a prompt for the beat, not a place the demo gets its content from.
 */
const SEEDS: readonly Seed[] = [
  {
    title: 'Windows or macOS for the marker?',
    body:
      'My design proposal uses a Windows-only build step. Will the marker run it on Windows, or should I make it cross-platform?',
    by: 'anonymous',
    minutesAgo: 190,
    replies: ['The submission brief says one archive, so it has to run anywhere.'],
  },
  {
    title: 'Reading list for the case analysis section?',
    body: 'Do we need to cite beyond the supplied material, or is the brief enough?',
    by: 'named',
    minutesAgo: 95,
    replies: [],
  },
  {
    title: 'How detailed should the design rationale be?',
    body: 'Is a paragraph per decision enough, or does each one need alternatives considered?',
    by: 'anonymous',
    minutesAgo: 35,
    replies: [],
  },
];

async function main(): Promise<void> {
  const config = getConfig();
  const anonIdSecret = config.anonIdSecret;
  if (anonIdSecret === null || anonIdSecret === '') {
    process.stderr.write('CONFIG_INVALID: ANON_ID_SECRET is required to seed anonymous threads.\n');
    process.exit(78);
  }

  const written = await withTransaction(async (tx) => {
    const fixture = await findFixture(tx);
    if (fixture === null) {
      throw new Error('No published seeded assignment found; run "pnpm db:seed" first.');
    }

    const anonymous = await identityFor(tx, {
      anonIdSecret,
      studentId: fixture.anonStudentId,
      assignmentId: fixture.assignmentId,
    });
    // The named author needs no identity row at all: a non-anonymous post carries `author_user_id`
    // and no identity, which is what `06` section 4.3 means by "never created for a student who only
    // posts under their name".
    const created: string[] = [];

    for (const seed of SEEDS) {
      const existing = await threadIdByTitle(tx, fixture.assignmentId, seed.title);
      if (existing !== null) continue;
      await writeThread(tx, {
        fixture,
        seed,
        anonymous,
        anonIdSecret,
      });
      created.push(seed.title);
    }

    return { fixture, created, label: anonymous.displayLabel };
  });

  process.stdout.write('demo discussions ready\n\n');
  process.stdout.write(`  assignment  ${written.fixture.assignmentId}\n`);
  process.stdout.write(`              "${written.fixture.assignmentTitle}"\n`);
  process.stdout.write(`  anonymous author label: ${written.label}\n`);
  process.stdout.write(
    `  threads created this run: ${written.created.length === 0 ? 'none (already present)' : written.created.join('; ')}\n`,
  );
  process.stdout.write('\nopen the student Discussions tab for that assignment to see them.\n');
}

/**
 * The seeded assignment: the earliest `published` one with a current structure and a published
 * milestone. The same selector `demo-state.ts` uses, so the two scripts cannot disagree about which
 * assignment is "the" demo assignment.
 */
async function findFixture(ex: Executor): Promise<Fixture | null> {
  const rows = await ex<
    { id: string; title: string; course_id: string; created_by_user_id: string }[]
  >`
    select a.id, a.title, a.course_id, a.created_by_user_id
      from assignments a
      join assignment_structures s on s.assignment_id = a.id and s.is_current = true
     where a.status = 'published'
       and exists (select 1 from milestones m
                    where m.assignment_id = a.id and m.publication_status = 'PUBLISHED')
     order by a.created_at asc
     limit 1
  `;
  const row = rows[0];
  if (row === undefined) return null;

  const [anonStudent] = await ex<{ id: string }[]>`
    select id from users where email = 'student@demo.rmit' limit 1
  `;
  if (anonStudent === undefined) {
    throw new Error('The seed must provide the interactive demo student account.');
  }

  // A second enrolled student, so the attributed thread has a name that is not the demo account's:
  // one screen showing both author kinds is the thing the beat reads.
  const namedRows = await ex<{ id: string; display_name: string }[]>`
    select u.id, u.display_name
      from users u
      join enrollments e on e.user_id = u.id
     where e.course_id = ${row.course_id}::uuid
       and u.role = 'student'
       and u.email <> 'student@demo.rmit'
     order by u.created_at asc
     limit 1
  `;
  const named = namedRows[0];

  return {
    assignmentId: row.id,
    assignmentTitle: row.title,
    courseId: row.course_id,
    anonStudentId: anonStudent.id,
    namedStudentId: named?.id ?? anonStudent.id,
    namedLabel: named?.display_name ?? 'Demo Student (interactive)',
  };
}

async function threadIdByTitle(
  ex: Executor,
  assignmentId: string,
  title: string,
): Promise<string | null> {
  const rows = await ex<{ id: string }[]>`
    select id from discussion_threads
     where assignment_id = ${assignmentId}::uuid and title = ${title}
     limit 1
  `;
  return rows[0]?.id ?? null;
}

async function writeThread(
  ex: Executor,
  input: {
    readonly fixture: Fixture;
    readonly seed: Seed;
    readonly anonymous: AnonymousIdentity;
    readonly anonIdSecret: string;
  },
): Promise<void> {
  const { fixture, seed } = input;
  const anonymousThread = seed.by === 'anonymous';
  const createdAt = new Date(Date.now() - seed.minutesAgo * 60 * 1000);

  const threadId = randomUUID();
  const firstPostId = randomUUID();

  await insertThread(ex, {
    id: threadId,
    assignmentId: fixture.assignmentId,
    milestoneId: null,
    title: seed.title,
    createdAt,
  });
  await insertPost(ex, {
    id: firstPostId,
    threadId,
    assignmentId: fixture.assignmentId,
    parentPostId: null,
    body: seed.body,
    createdAt,
    // Exactly one of the two columns, and which one is the whole anonymity contract (A-ID-1).
    authorAnonIdentityId: anonymousThread ? input.anonymous.id : null,
    authorUserId: anonymousThread ? null : fixture.namedStudentId,
    isAnonymised: anonymousThread,
  });
  await linkFirstPost(ex, threadId, firstPostId);

  let offset = 12;
  for (const reply of seed.replies) {
    const replyIdentity = anonymousThread
      ? await identityFor(ex, {
          anonIdSecret: input.anonIdSecret,
          studentId: fixture.namedStudentId,
          assignmentId: fixture.assignmentId,
        })
      : null;
    await insertPost(ex, {
      id: randomUUID(),
      threadId,
      assignmentId: fixture.assignmentId,
      parentPostId: firstPostId,
      body: reply,
      createdAt: new Date(createdAt.getTime() + offset * 60 * 1000),
      authorAnonIdentityId: replyIdentity?.id ?? null,
      authorUserId: replyIdentity === null ? fixture.namedStudentId : null,
      isAnonymised: replyIdentity !== null,
    });
    offset += 9;
  }
}

await main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
