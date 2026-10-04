/**
 * Run one ingestion end to end, from the command line -- `11` WP-05's gate script.
 *
 * ```powershell
 * # offline, deterministic, no key (WP-04's gate)
 * $env:LLM_PROVIDER='mock'; pnpm exec tsx scripts/ingest-once.ts --fixture demo
 *
 * # against the configured provider
 * pnpm exec tsx --env-file-if-exists=.env scripts/ingest-once.ts --fixture demo --pace-ms 13000
 * ```
 *
 * What it does, in the order a tutor's click would:
 *
 *   1. creates a **new** draft assignment on the seeded course (never reuses the seeded demo
 *      assignment, so running this twice cannot disturb the state Phase 1 verified);
 *   2. stores `docs/fixtures/demo-brief.pdf` and `demo-rubric.pdf` through the real storage driver and
 *      records them as `assignment_sources` with `extraction_status = 'pending'` -- the same rows the
 *      upload route writes;
 *   3. enqueues an `ingestion_jobs` row and calls `runIngestion`, which walks S0-S8;
 *   4. prints the run's counts, notes and job state as JSON, and writes the proposal to `--out`.
 *
 * It is a script, not a test: it needs a migrated, seeded database and the storage directory. The
 * offline `pnpm test` suite must keep passing without either, which is why nothing here lives in
 * `tests/` (`docs/handoff/01-STATE.md` section 5 item 7).
 */

import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { getConfig } from '@/lib/config';
import { closeDb, getSql } from '@/lib/db/client';
import {
  insertAssignmentIfAbsent,
  insertSourceIfAbsent,
  listSources,
  listT1Chunks,
  type SourceMimeType,
} from '@/lib/db/queries/assignments';
import { findLatestJob, insertQueuedJob } from '@/lib/db/queries/ingestions';
import { withTransaction } from '@/lib/db/transaction';
import { getLlmClient, validateProviderConfiguration } from '@/lib/llm';
import { getStorageDriver } from '@/lib/storage';
import { runIngestion } from '@/features/ingest/pipeline';

interface Options {
  readonly fixture: string;
  readonly out: string;
  readonly paceMs: number;
  readonly keep: boolean;
}

function parseArgs(argv: readonly string[]): Options {
  const get = (flag: string, fallback: string): string => {
    const index = argv.indexOf(flag);
    const value = index >= 0 ? argv[index + 1] : undefined;
    return value ?? fallback;
  };
  return {
    fixture: get('--fixture', 'demo'),
    out: get('--out', '.local/proposal.json'),
    paceMs: Number(get('--pace-ms', '0')),
    keep: argv.includes('--keep'),
  };
}

/**
 * The documents each fixture ingests, keyed by the `--fixture` value.
 *
 * **A second fixture exists because one synthetic brief cannot show the product working on a real
 * assignment's shape.** `demo` is the committed synthetic PDF (a software-engineering case analysis).
 * `dataviz` mirrors the structure of a real RMIT Data Visualisation assignment -- five editor-supplied
 * topics, a multi-criterion rubric with pass and distinction standards, APA referencing, and a required
 * AI-use declaration -- which is a different shape from `demo` in exactly the ways that stress the
 * product: more criteria, longer verbatim passages, and a rubric whose standards differ by grade band.
 *
 * **The `dataviz` documents live under `app/.local/` and are gitignored on purpose.** They are derived
 * from a real, currently-assessed piece of coursework. The text is written for this fixture and is not a
 * copy of the assessment, but the safest place for anything assignment-adjacent is outside the published
 * repository -- `AGENTS.md` section 7 requires no third-party material that cannot be published, and
 * the course's own brief and rubric are the university's words rather than ours.
 */
const FIXTURE_DOCUMENTS: Record<string, readonly { kind: 'brief' | 'rubric'; path: string; mimeType: string }[]> = {
  demo: [
    { kind: 'brief', path: '../docs/fixtures/demo-brief.pdf', mimeType: 'application/pdf' },
    { kind: 'rubric', path: '../docs/fixtures/demo-rubric.pdf', mimeType: 'application/pdf' },
  ],
  dataviz: [
    { kind: 'brief', path: './.local/fixture-dataviz-brief.pdf', mimeType: 'application/pdf' },
    { kind: 'rubric', path: './.local/fixture-dataviz-rubric.pdf', mimeType: 'application/pdf' },
  ],
};

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const config = getConfig();
  if (config.databaseUrl === null) {
    throw new Error('DATABASE_URL is not set; this script needs a migrated, seeded database');
  }

  // 1. A fresh assignment on the seeded course, created by the seeded tutor.
  const sql = getSql(config.databaseUrl);
  const seeded = await sql<
    { course_id: string; tutor_id: string }[]
  >`select c.id as course_id, t.id as tutor_id
      from courses c
      join users t on t.role = 'tutor'
     order by c.created_at asc, t.created_at asc
     limit 1`;
  const context = seeded[0];
  if (context === undefined) {
    throw new Error('no seeded course/tutor pair found; run `pnpm db:seed` first');
  }

  const assignmentId = randomUUID();
  const title = `Ingestion verification (${options.fixture}) ${assignmentId.slice(0, 8)}`;
  await withTransaction((tx) =>
    insertAssignmentIfAbsent(tx, {
      id: assignmentId,
      courseId: context.course_id,
      title,
      status: 'draft',
      dueAt: null,
      createdByUserId: context.tutor_id,
      publishedAt: null,
    }),
  );

  // 2. Store the fixture bytes through the real driver, then record the source rows.
  const storage = getStorageDriver();
  const storageDir = config.storageLocalDir;
  const documents = FIXTURE_DOCUMENTS[options.fixture] ?? FIXTURE_DOCUMENTS['demo'];
  if (documents === undefined) {
    throw new Error('no fixture documents configured; this cannot happen with a `demo` key present');
  }
  for (const document of documents) {
    const bytes = new Uint8Array(readFileSync(resolve(process.cwd(), document.path)));
    const sourceId = randomUUID();
    const extension = document.mimeType === 'application/pdf' ? 'pdf' : 'bin';
    const key = `assignments/${assignmentId}/sources/${sourceId}.${extension}`;
    const stored = await storage.put({ key, bytes, contentType: document.mimeType });
    const inserted = await withTransaction((tx) =>
      insertSourceIfAbsent(tx, {
        id: sourceId,
        assignmentId,
        uploadedByUserId: context.tutor_id,
        kind: document.kind,
        originalFilename: document.path.split('/').pop() ?? 'source',
        storageKey: key,
        mimeType: document.mimeType as SourceMimeType,
        byteSize: bytes.byteLength,
        pageCount: null,
        contentHash: stored.contentHash,
        extractionStatus: 'pending',
      }),
    );
    if (!inserted) throw new Error(`could not record the ${document.kind} source`);
  }

  // 3. Enqueue and run.
  const jobId = randomUUID();
  const queued = await withTransaction((tx) =>
    insertQueuedJob(tx, { id: jobId, assignmentId, requestedByUserId: context.tutor_id }),
  );
  if (!queued) throw new Error('an ingestion job is already active for this assignment (unexpected)');

  const validation = await validateProviderConfiguration(config);
  if (!validation.ok) {
    process.stdout.write(
      `provider validation failed: ${validation.errorCode ?? 'CONFIG_INVALID'} ${validation.reason ?? ''}\n`,
    );
  }

  const chunksBefore = (await withTransaction((tx) => listT1Chunks(tx, assignmentId))).length;
  const result = await runIngestion({
    assignmentId,
    jobId,
    requestedByUserId: context.tutor_id,
    client: getLlmClient(),
    storage,
    config,
    requestId: null,
    paceMs: Number.isFinite(options.paceMs) ? options.paceMs : 0,
  });

  const job = await withTransaction((tx) => findLatestJob(tx, assignmentId));
  const sources = await withTransaction((tx) => listSources(tx, assignmentId));
  const chunks = await withTransaction((tx) => listT1Chunks(tx, assignmentId));

  // 4. Report. The proposal dump is written to `--out` (gitignored `.local/` by default) so a human
  // can read the candidate set the way WP-05's gate requires: aloud.
  const outPath = resolve(process.cwd(), options.out);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        assignmentId,
        title,
        jobId,
        storageDir,
        sources: sources.map((source) => ({
          id: source.id,
          kind: source.kind,
          mimeType: source.mimeType,
          pageCount: source.pageCount,
          extractionStatus: source.extractionStatus,
          extractionError: source.extractionError,
        })),
        chunks: chunks.length,
        chunksBefore,
        result,
        job,
      },
      null,
      2,
    ),
    'utf8',
  );

  process.stdout.write(
    `${JSON.stringify(
      {
        assignmentId,
        jobId,
        ok: result.ok,
        errorCode: result.errorCode,
        status: job?.status ?? null,
        stage: job?.stage ?? null,
        counts: result.counts,
        notes: result.notes,
        chunksBefore,
        proposal: outPath,
      },
      null,
      2,
    )}\n`,
  );

  if (!options.keep) {
    process.stdout.write(`(the assignment was kept; pass --keep only changes logging)\n`);
  }
  await closeDb();
}

// A script's exit code is its contract: a rejected promise must not look like success.
main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'the ingestion script failed';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
