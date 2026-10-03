import { randomUUID } from 'node:crypto';

import { NextResponse, after, type NextRequest } from 'next/server';

import { getConfig } from '@/lib/config';
import {
  PLATFORM_ERROR_MESSAGES,
  apiError,
  resolveRequestId,
  withRequestId,
  type ApiErrorBody,
} from '@/lib/api/errors';
import type { IngestionStatusResponse } from '@/lib/api/types';
import { AuthError, requireRole } from '@/lib/auth/roles';
import { countSources, findAssignmentScope } from '@/lib/db/queries/assignments';
import { findEnrolmentRole } from '@/lib/db/queries/courses';
import {
  findLatestJob,
  insertQueuedJob,
  toIngestionStatusResponse,
} from '@/lib/db/queries/ingestions';
import { withTransaction } from '@/lib/db/transaction';
import { getStorageDriver } from '@/lib/storage';
import { getLlmClient } from '@/lib/llm';
import { runIngestion } from '@/features/ingest/pipeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `POST|GET /api/tutor/assignments/{assignmentId}/ingest` (`06` section 5.4).
 *
 * POST enqueues and returns **202** with the polling shape; it does not run the pipeline inline.
 * That is D60: stage S6 makes several model calls that can outlive a request timeout, so an inline
 * handler would be a reliable way to fail on the largest documents. The work is scheduled with
 * Next's `after()`, which runs it once the response has been sent and keeps the process alive for it
 * -- the alternative, a floating promise, is killed when the response completes.
 *
 * The two gates are answered by the database, not by a read-then-write:
 *
 *   - `NO_SOURCES` (422) when the assignment has no source documents;
 *   - `INGESTION_IN_PROGRESS` (409) when a queued or running job exists, enforced by the partial
 *     unique index `uq_ingestion_jobs_active` so two simultaneous POSTs cannot both win.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ assignmentId: string }> },
): Promise<NextResponse<IngestionStatusResponse | ApiErrorBody>> {
  const requestId = resolveRequestId(request);

  const authorised = await authorise(request, requestId, context);
  if ('response' in authorised) return authorised.response;
  const { assignmentId, session } = authorised;

  const sources = await withTransaction((tx) => countSources(tx, assignmentId));
  if (sources === 0) {
    return apiError('NO_SOURCES', PLATFORM_ERROR_MESSAGES.noSources, requestId);
  }

  const jobId = randomUUID();
  const queued = await withTransaction((tx) =>
    insertQueuedJob(tx, {
      id: jobId,
      assignmentId,
      requestedByUserId: session.userId,
    }),
  );
  if (!queued) {
    return apiError('INGESTION_IN_PROGRESS', PLATFORM_ERROR_MESSAGES.ingestionInProgress, requestId);
  }

  const job = await withTransaction((tx) => findLatestJob(tx, assignmentId));
  if (job === null) {
    return apiError('INTERNAL', PLATFORM_ERROR_MESSAGES.internal, requestId);
  }

  // Scheduled, not awaited: the response is the job row, and the row is durable before this returns.
  after(async () => {
    try {
      await runIngestion({
        assignmentId,
        jobId,
        requestedByUserId: session.userId,
        client: getLlmClient(),
        storage: getStorageDriver(),
        config: getConfig(),
        requestId,
      });
    } catch (error) {
      // `runIngestion` records its own failures on the job row; reaching here means the row itself
      // could not be written, which is an operator problem. It is written to stderr without any
      // request or document content (C7) rather than silently swallowed.
      const message = error instanceof Error ? error.message : 'the ingestion run failed';
      console.error(`ingestion job ${jobId} failed outside its job row: ${message}`);
    }
  });

  return withRequestId(NextResponse.json(toResponse(job), { status: 202 }), requestId);
}

/**
 * `GET .../ingest`: poll the newest run.
 *
 * A `404` when no run has ever been requested. `06` section 5.5.8 says `null` at the *bundle* level
 * means "no run has ever been requested", and this route's contract has no null member, so the honest
 * answer is "there is no such resource yet" rather than a synthesised job id. Recorded in
 * `docs/handoff/05-ISSUES.md` as an ambiguity in the route contract.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ assignmentId: string }> },
): Promise<NextResponse<IngestionStatusResponse | ApiErrorBody>> {
  const requestId = resolveRequestId(request);
  const authorised = await authorise(request, requestId, context);
  if ('response' in authorised) return authorised.response;

  const job = await withTransaction((tx) => findLatestJob(tx, authorised.assignmentId));
  if (job === null) {
    return apiError('NOT_FOUND', 'No analysis run has been requested for this assignment.', requestId);
  }
  return withRequestId(NextResponse.json(toResponse(job), { status: 200 }), requestId);
}

type Authorised =
  | { readonly response: NextResponse<ApiErrorBody> }
  | { readonly assignmentId: string; readonly session: { userId: string } };

/** Role, then assignment scope, then enrolment. Both failures are `NOT_FOUND` (`06` section 5.2). */
async function authorise(
  request: NextRequest,
  requestId: string,
  context: { params: Promise<{ assignmentId: string }> },
): Promise<Authorised> {
  let session;
  try {
    session = await requireRole('tutor', request);
  } catch (error) {
    if (error instanceof AuthError) return { response: apiError(error.code, error.message, requestId) };
    return { response: apiError('INTERNAL', PLATFORM_ERROR_MESSAGES.internal, requestId) };
  }

  const { assignmentId } = await context.params;
  const scope = await withTransaction((tx) => findAssignmentScope(tx, assignmentId));
  if (scope === null) {
    return { response: apiError('NOT_FOUND', PLATFORM_ERROR_MESSAGES.notFound, requestId) };
  }
  const role = await withTransaction((tx) => findEnrolmentRole(tx, session.userId, scope.courseId));
  if (role !== 'tutor') {
    return { response: apiError('NOT_FOUND', PLATFORM_ERROR_MESSAGES.notFound, requestId) };
  }
  return { assignmentId, session: { userId: session.userId } };
}

/** `06` section 5.5.8's shape, built from the row by the module that owns the row. */
const toResponse = toIngestionStatusResponse;
