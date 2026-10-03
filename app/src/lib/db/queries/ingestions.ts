/**
 * The ingestion-job repository: `ingestion_jobs` (`06` section 7.7.1; migration `0011`).
 *
 * D60 makes a Postgres-backed job row the execution model for an Assignment Analyst run: the upload
 * and ingest routes enqueue, the pipeline advances this row, and the ingestion state screen polls
 * it. This module is the only place that row is written.
 *
 * Two rules that are easy to move to the wrong layer:
 *
 * 1. **One active run per assignment is enforced by the database**, through the partial unique index
 *    `uq_ingestion_jobs_active`. `insertQueuedJob` therefore reports whether it won the race rather
 *    than asking a second question first; a check followed by an insert is a race, and the route
 *    would sometimes start two runs (trap T19's neighbours: the same reason `on conflict do nothing`
 *    is used without a target throughout this package).
 * 2. **A failure is a code plus a tutor-safe sentence**, never a driver message or a stack
 *    (`06` section 5.3). The caller supplies both; this module never formats an exception.
 */

import type { Executor } from './courses';

/** `ingestion_jobs.status` (`06` section 7.7.1; the `06` section 5.5.8 response union). */
export type IngestionJobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

/** The eight pipeline stages of `04` section 7. */
export type IngestionStage = 'S0' | 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6' | 'S7';

/** `04` section 7 lists eight stages; `06` section 5.5.8 returns the count to the client. */
export const INGESTION_TOTAL_STAGES = 8;

export interface IngestionJobRow {
  readonly id: string;
  readonly assignmentId: string;
  readonly status: IngestionJobStatus;
  readonly stage: IngestionStage | null;
  readonly completedStages: number;
  readonly totalStages: number;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
}

/**
 * Insert a `queued` job, or report that one is already active.
 *
 * The conflict target is the partial unique index, which is the only way to express "one active run
 * per assignment" without a read-then-write race. `on conflict do nothing` is targetless for the
 * reason `courses.ts` documents: which unique index Postgres reports first is not part of the
 * contract, and the targetless form absorbs all of them.
 */
export async function insertQueuedJob(
  ex: Executor,
  input: { readonly id: string; readonly assignmentId: string; readonly requestedByUserId: string },
): Promise<boolean> {
  const rows = await ex<{ id: string }[]>`
    insert into ingestion_jobs (id, assignment_id, requested_by_user_id, status, total_stages)
    values (${input.id}::uuid, ${input.assignmentId}::uuid, ${input.requestedByUserId}::uuid,
            'queued', ${INGESTION_TOTAL_STAGES})
    on conflict do nothing
    returning id
  `;
  return rows.length > 0;
}

/** Move a queued job to `running` at a stage. Returns false when the row is not in `queued`. */
export async function startJob(
  ex: Executor,
  jobId: string,
  stage: IngestionStage,
): Promise<boolean> {
  const rows = await ex<{ id: string }[]>`
    update ingestion_jobs
       set status = 'running', stage = ${stage}, started_at = now()
     where id = ${jobId}::uuid and status = 'queued'
    returning id
  `;
  return rows.length > 0;
}

/**
 * Record that a stage finished and which stage is next.
 *
 * `completedStages` is written rather than derived from `stage` so the client never has to know the
 * stage order, and so a retried stage that succeeds on the second attempt cannot double-count.
 */
export async function advanceJob(
  ex: Executor,
  jobId: string,
  input: { readonly completedStage: IngestionStage; readonly nextStage: IngestionStage | null },
): Promise<void> {
  const completedStages = Number(input.completedStage.slice(1)) + 1;
  await ex`
    update ingestion_jobs
       set stage = ${input.nextStage},
           completed_stages = greatest(completed_stages, ${completedStages})
     where id = ${jobId}::uuid and status = 'running'
  `;
}

/** Mark a run succeeded. `ck_ingestion_jobs_succeeded_stage` requires it to be at S7. */
export async function succeedJob(ex: Executor, jobId: string): Promise<void> {
  await ex`
    update ingestion_jobs
       set status = 'succeeded', stage = 'S7', completed_stages = ${INGESTION_TOTAL_STAGES},
           finished_at = now(), error_code = null, error_message = null
     where id = ${jobId}::uuid
  `;
}

/**
 * Mark a run failed with a code and a sentence a tutor can read.
 *
 * A terminal failure is recorded even for a job that never left `queued`, so the polling screen
 * always reaches a state instead of spinning on a row nobody will ever advance.
 */
export async function failJob(
  ex: Executor,
  jobId: string,
  input: { readonly errorCode: string; readonly errorMessage: string },
): Promise<void> {
  await ex`
    update ingestion_jobs
       set status = 'failed',
           finished_at = now(),
           error_code = ${input.errorCode.slice(0, 64)},
           error_message = ${input.errorMessage.slice(0, 500)}
     where id = ${jobId}::uuid and status in ('queued','running')
  `;
}

function toRow(row: {
  id: string;
  assignment_id: string;
  status: string;
  stage: string | null;
  completed_stages: number;
  total_stages: number;
  started_at: Date | string | null;
  finished_at: Date | string | null;
  error_code: string | null;
  error_message: string | null;
}): IngestionJobRow {
  return {
    id: row.id,
    assignmentId: row.assignment_id,
    status: row.status as IngestionJobStatus,
    stage: row.stage as IngestionStage | null,
    completedStages: row.completed_stages,
    totalStages: row.total_stages,
    startedAt: isoOrNull(row.started_at),
    finishedAt: isoOrNull(row.finished_at),
    errorCode: row.error_code,
    errorMessage: row.error_message,
  };
}

/** The newest run for an assignment, or null when none has ever been requested. */
export async function findLatestJob(
  ex: Executor,
  assignmentId: string,
): Promise<IngestionJobRow | null> {
  const rows = await ex<Parameters<typeof toRow>[0][]>`
    select id, assignment_id, status, stage, completed_stages, total_stages,
           started_at, finished_at, error_code, error_message
      from ingestion_jobs
     where assignment_id = ${assignmentId}::uuid
     order by created_at desc
     limit 1
  `;
  const first = rows[0];
  return first === undefined ? null : toRow(first);
}

/** One run by id, or null. Used when a caller already holds the job id it just created. */
export async function findJobById(ex: Executor, jobId: string): Promise<IngestionJobRow | null> {
  const rows = await ex<Parameters<typeof toRow>[0][]>`
    select id, assignment_id, status, stage, completed_stages, total_stages,
           started_at, finished_at, error_code, error_message
      from ingestion_jobs
     where id = ${jobId}::uuid
     limit 1
  `;
  const first = rows[0];
  return first === undefined ? null : toRow(first);
}

/** True when a queued-or-running job exists for the assignment. Used by the ingest route's gate. */
export async function hasActiveJob(ex: Executor, assignmentId: string): Promise<boolean> {
  const rows = await ex<{ id: string }[]>`
    select id from ingestion_jobs
     where assignment_id = ${assignmentId}::uuid and status in ('queued','running')
     limit 1
  `;
  return rows.length > 0;
}

function isoOrNull(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}
