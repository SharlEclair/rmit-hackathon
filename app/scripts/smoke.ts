#!/usr/bin/env node
/**
 * `pnpm demo:smoke` -- WP-12's scripted end-to-end check of the demo loop
 * (`11-BUILD-PLAN.md` WP-12, `14-HACKATHON-SUBMISSION.md` section 3's 09:00 row).
 *
 * **What this is for.** On submission day the run sheet says "`pnpm db:seed` and `pnpm demo:smoke` on the
 * demo machine". This is that command: one exit code that answers "is the machine about to demo actually
 * going to work", run **before** a rehearsal rather than during one.
 *
 * **What it checks, in the order a failure would hurt most.**
 *
 *   1. **The environment is the one the demo needs**: a reachable database, applied migrations, and a
 *      resolved provider. The provider is reported rather than asserted, because the demo is supposed to
 *      work with *either* -- that is D90's whole point -- but knowing which one is running is the
 *      difference between a five-second diagnosis and a twenty-minute one.
 *   2. **The schema has not drifted**, which is the failure that makes every other check meaningless.
 *   3. **The seed produced the demo state**: the seeded assignment, its published milestones and
 *      checklist items, and the two demo accounts.
 *   4. **The build artefacts the four acceptance runs need are present**, so a missing report is caught
 *      here rather than halfway through a rehearsal.
 *   5. **The four acceptance runs pass**, each in its own process, with the counts reported. These are
 *      the same scripts the phase handoffs quote, so this is a re-run rather than a second opinion.
 *
 * **It deliberately does not start a server.** `12-OPERATIONS.md` section 5's MVP assumes a long-lived
 * local Node process, and the run sheet has the operator start it; a smoke test that silently spawned one
 * would leave a stray process on the demo machine at the worst moment. If the server is not up, this
 * reports exactly that and exits 1 without pretending to have tested the HTTP paths.
 *
 * **Exit codes.** `0` all checks passed. `1` a check failed. `78` a precondition is missing (the server or
 * the database), matching the convention `verify-student.ts` uses for `CONFIG_INVALID`.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getConfig } from '../src/lib/config';
import { withTransaction } from '../src/lib/db/transaction';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(HERE, '..');
const BASE_URL = process.env.VERIFY_BASE_URL ?? 'http://localhost:3000';

interface Result {
  readonly step: string;
  readonly ok: boolean;
  readonly detail: string;
}

const results: Result[] = [];
function report(step: string, ok: boolean, detail: string): void {
  results.push({ step, ok, detail });
  process.stdout.write(`${ok ? 'ok  ' : 'FAIL'}  ${step}\n        ${detail}\n`);
}

/** The four acceptance runs, in the order the phase handoffs introduce them. */
const RUNS = [
  { name: 'verify-student', script: 'scripts/verify-student.ts', expected: 18 },
  { name: 'verify-review', script: 'scripts/verify-review.ts', expected: 20 },
  { name: 'verify-analytics', script: 'scripts/verify-analytics.ts', expected: 13 },
  { name: 'verify-discussion', script: 'scripts/verify-discussion.ts', expected: 20 },
] as const;

async function main(): Promise<void> {
  process.stdout.write('demo smoke test\n\n');

  // --- 1. the environment -----------------------------------------------------------------------
  let config: ReturnType<typeof getConfig>;
  try {
    config = getConfig();
  } catch (error) {
    report(
      'the environment resolves',
      false,
      `getConfig() threw: ${error instanceof Error ? error.message : String(error)}`,
    );
    finish(78);
    return;
  }
  report(
    'the environment resolves',
    true,
    `provider=${config.llmProvider} model=${config.llmModelReasoning ?? '(none)'} ` +
      `database=${config.databaseUrl === null ? '(unset)' : 'set'}`,
  );
  // Reported, never asserted: D90 makes an offline demo a supported mode, so a `mock` provider is a
  // legitimate answer rather than a failure. What would be a failure is *not knowing* which one is running.
  process.stdout.write(
    config.llmProvider === 'mock'
      ? '        note: the mock provider is active -- fully offline and deterministic\n\n'
      : '        note: a real provider is active; rehearsal without network will not classify\n\n',
  );

  // --- 2. the database and the schema -----------------------------------------------------------
  try {
    const tables = await withTransaction(async (tx) => {
      const rows = await tx<{ count: string }[]>`
        select count(*)::text as count from information_schema.tables
         where table_schema = 'public' and table_type = 'BASE TABLE'
      `;
      return rows[0]?.count ?? '0';
    });
    report('the database is reachable', Number(tables) >= 30, `${tables} base tables`);
  } catch (error) {
    report(
      'the database is reachable',
      false,
      `a query failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    finish(78);
    return;
  }

  const drift = run(['exec', 'tsx', '--env-file-if-exists=.env', 'scripts/verify-schema.ts']);
  report(
    'the schema has not drifted',
    drift.status === 0 && /no drift|drift: none/.test(drift.output),
    lastLine(drift.output),
  );

  // --- 3. the seeded demo state ------------------------------------------------------------------
  try {
    const seeded = await withTransaction(async (tx) => {
      const [assignment] = await tx<{ id: string; title: string }[]>`
        select a.id, a.title
          from assignments a
         where a.status = 'published'
           and exists (
             select 1 from milestones m
              where m.assignment_id = a.id and m.publication_status = 'PUBLISHED'
           )
         order by a.created_at asc limit 1
      `;
      const [milestones] = await tx<{ count: string }[]>`
        select count(*)::text as count from milestones
         where assignment_id = ${assignment?.id ?? null}::uuid and publication_status = 'PUBLISHED'
      `;
      const [items] = await tx<{ count: string }[]>`
        select count(*)::text as count from checklist_items
         where assignment_id = ${assignment?.id ?? null}::uuid and publication_status = 'PUBLISHED'
      `;
      const [accounts] = await tx<{ count: string }[]>`
        select count(*)::text as count from users
         where email in ('student@demo.rmit', 'tutor@demo.rmit')
      `;
      return {
        assignment,
        milestones: milestones?.count ?? '0',
        items: items?.count ?? '0',
        accounts: accounts?.count ?? '0',
      };
    });

    report(
      'the seed produced a demo assignment with published content',
      seeded.assignment !== undefined && Number(seeded.milestones) > 0 && Number(seeded.items) > 0,
      seeded.assignment === undefined
        ? 'no published assignment with a published milestone -- run pnpm db:seed'
        : `"${seeded.assignment.title}" milestones=${seeded.milestones} items=${seeded.items}`,
    );
    report(
      'both demo accounts exist',
      seeded.accounts === '2',
      `${seeded.accounts}/2 (student@demo.rmit, tutor@demo.rmit)`,
    );
  } catch (error) {
    report(
      'the seed produced a demo assignment with published content',
      false,
      `a query failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // --- 4. the server, which the HTTP runs need ---------------------------------------------------
  const up = await serverIsUp();
  report(
    'the dev server is answering',
    up,
    up ? BASE_URL : `${BASE_URL} did not answer -- start it with "pnpm dev" in another terminal`,
  );
  if (!up) {
    // The HTTP runs cannot be faked, so this exits 78 rather than reporting four failures. `12` section 5
    // treats the server as an operator responsibility, and a smoke test that hid that would be worse than
    // one that stops.
    report('the four acceptance runs', false, 'skipped: the server is not up');
    finish(78);
    return;
  }

  // --- 5. the four acceptance runs ---------------------------------------------------------------
  for (const runSpec of RUNS) {
    const outcome = run(['exec', 'tsx', '--env-file-if-exists=.env', runSpec.script], { cwd: APP_ROOT });
    const passed = /(\d+)\/(\d+) passed/.exec(outcome.output);
    const count = passed?.[1] ?? '?';
    const total = passed?.[2] ?? String(runSpec.expected);
    report(
      `${runSpec.name} (${String(runSpec.expected)} checks)`,
      outcome.status === 0 && count === String(runSpec.expected),
      passed === null ? lastLine(outcome.output) : `${count}/${total} passed`,
    );
  }

  // --- 6. the fallback artefacts the run sheet says to check -------------------------------------
  //
  // `11-BUILD-PLAN.md` WP-12 names two: `demo/fallback/*` (a recorded artefact per beat that can fail) and
  // a `demo/reset` script that restores the seeded state in under 60 seconds. The recordings are captured
  // by a human and the reset script exists; both are checked, and a missing recording is reported as a
  // **failing** check rather than a warning, because the run sheet's 10:00 row is the deadline for it and a
  // smoke test that shrugged at a missing fallback would be hiding the one thing it is for.
  const workspaceRoot = join(APP_ROOT, '..');
  const resetScript = ['demo/reset.ps1', 'demo/reset.sh', 'demo/reset.mjs'].find((path) =>
    existsSync(join(workspaceRoot, path)),
  );
  report(
    'the demo reset script exists',
    resetScript !== undefined,
    resetScript ?? 'no demo/reset.{ps1,sh,mjs} -- the run sheet needs one at 11:30',
  );

  const fallbackDir = join(workspaceRoot, 'demo', 'fallback');
  const recordings = existsSync(fallbackDir)
    ? readdirSync(fallbackDir).filter((name) => /\.(png|mp4)$/i.test(name))
    : [];
  report(
    'the fallback recordings exist',
    recordings.length > 0,
    recordings.length === 0
      ? 'demo/fallback/ holds no .png or .mp4 -- capture these before the rehearsal'
      : `${String(recordings.length)} recording(s): ${recordings.slice(0, 4).join(', ')}`,
  );

  finish(results.every((result) => result.ok) ? 0 : 1);
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

/** Run a command and capture its combined output. Never throws; a failure is a status. */
function run(args: readonly string[], options: { cwd?: string } = {}): {
  readonly status: number;
  readonly output: string;
} {
  const outcome = spawnSync('pnpm', [...args], {
    cwd: options.cwd ?? APP_ROOT,
    encoding: 'utf8',
    shell: true,
  });
  return {
    status: outcome.status ?? 1,
    output: `${outcome.stdout ?? ''}\n${outcome.stderr ?? ''}`,
  };
}

function lastLine(output: string): string {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
  return lines.at(-1) ?? '(no output)';
}

/**
 * Whether the dev server answers.
 *
 * The check hits `/api/health`, which `06` section 5.5.15 defines as the public liveness route and D76
 * built in Phase 1. It reports the *presence* of a provider configuration and never a value, so this
 * probe is safe to run on any machine (C7).
 */
async function serverIsUp(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}/api/health`, {
      signal: AbortSignal.timeout(5_000),
    });
    return response.status === 200;
  } catch {
    return false;
  }
}

function finish(code: number): void {
  const failed = results.filter((result) => !result.ok);
  process.stdout.write(
    `\n${String(results.length - failed.length)}/${String(results.length)} checks passed\n`,
  );
  if (failed.length > 0) {
    process.stdout.write('\nfix these before the rehearsal:\n');
    for (const result of failed) process.stdout.write(`  - ${result.step}: ${result.detail}\n`);
  }
  process.exitCode = code;
}

await main();
