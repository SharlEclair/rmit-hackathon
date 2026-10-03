import { NextResponse, type NextRequest } from 'next/server';

import { PLATFORM_ERROR_MESSAGES, apiError, resolveRequestId, withRequestId, type ApiErrorBody } from '@/lib/api/errors';
import type { ReviewBundleResponse } from '@/lib/api/types';
import { guardTutorAssignment } from '@/lib/auth/guards';
import { withTransaction } from '@/lib/db/transaction';
import { buildReviewBundle } from '@/features/review/bundle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/tutor/assignments/{assignmentId}/review` (`06` section 5.4, 5.5.8).
 *
 * The review screen's whole state in one response: the assignment header, the ingestion job (or
 * `null` when no run has ever been requested -- I-39), the sources beside the artifacts, the
 * per-status counts, every artifact with its **recomputed** validation, the ambiguity findings, and
 * the gate flags the Publish control reads.
 *
 * Read-only. Every write is a named transition on a named artifact, which is what makes the audit
 * trail a trail rather than a log of saves.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ assignmentId: string }> },
): Promise<NextResponse<ReviewBundleResponse | ApiErrorBody>> {
  const requestId = resolveRequestId(request);
  const { assignmentId } = await context.params;

  const guarded = await guardTutorAssignment(request, requestId, assignmentId);
  if (!guarded.ok) return guarded.response;

  const bundle = await withTransaction((tx) => buildReviewBundle(tx, assignmentId));
  if (bundle === null) {
    return apiError('NOT_FOUND', PLATFORM_ERROR_MESSAGES.notFound, requestId);
  }

  return withRequestId(NextResponse.json(bundle, { status: 200 }), requestId);
}
