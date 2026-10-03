import { NextResponse, type NextRequest } from 'next/server';

import { PLATFORM_ERROR_MESSAGES, apiError, resolveRequestId, withRequestId, type ApiErrorBody } from '@/lib/api/errors';
import type { ChecklistProgressResponse } from '@/lib/api/types';
import { guardStudentVisibleAssignment } from '@/lib/auth/guards';
import { getConfig } from '@/lib/config';
import { findChecklistItemAssignmentId } from '@/lib/db/queries/student-workspace';
import { withTransaction } from '@/lib/db/transaction';
import { applyChecklistTransition } from '@/features/workspace/checklist-transitions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `POST /api/student/checklist-items/{itemId}/complete` (`06` section 5.4, 5.1.1).
 *
 * Closes the interval. **D48**: `completed_at` and `elapsed_seconds` are the FIRST completion and are
 * never overwritten, so a completion after a reopen is a no-op inside the query (`completed_at is
 * null` guard) and the standing interval survives. `08` section 4.1 requires the interval Postgres
 * computes, not one the caller supplies -- which is why there is no body and no duration field.
 *
 * Completing an item that was never started is `INVALID_STATE_TRANSITION` rather than a write that
 * would ask the schema to close an interval with no beginning.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ itemId: string }> },
): Promise<NextResponse<ChecklistProgressResponse | ApiErrorBody>> {
  const requestId = resolveRequestId(request);
  const { itemId } = await context.params;

  const assignmentId = await withTransaction((tx) => findChecklistItemAssignmentId(tx, itemId));
  if (assignmentId === null) {
    return apiError('NOT_FOUND', PLATFORM_ERROR_MESSAGES.notFound, requestId);
  }

  const guarded = await guardStudentVisibleAssignment(request, requestId, assignmentId);
  if (!guarded.ok) return guarded.response;

  const anonIdSecret = readAnonIdSecret();
  if (anonIdSecret === null) {
    return apiError('INTERNAL', PLATFORM_ERROR_MESSAGES.internal, requestId);
  }

  const outcome = await applyChecklistTransition({
    transition: 'complete',
    scope: guarded.value.scope,
    session: guarded.value.session,
    itemId,
    anonIdSecret,
    now: new Date(),
  });
  if (!outcome.ok) return apiError(outcome.code, outcome.message, requestId);

  return withRequestId(NextResponse.json(outcome.body, { status: 200 }), requestId);
}

/** A missing `ANON_ID_SECRET` is a configuration fault; the value itself is never reported (C7). */
function readAnonIdSecret(): string | null {
  try {
    return getConfig().anonIdSecret;
  } catch {
    return null;
  }
}
