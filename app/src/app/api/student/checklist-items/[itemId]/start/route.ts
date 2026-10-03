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
 * `POST /api/student/checklist-items/{itemId}/start` (`06` section 5.4, 5.1.1).
 *
 * Records the first start. Idempotent: a repeat returns the standing state with `200` and does not
 * reset `started_at` (`06` section 5.1, `08` section 4.2).
 *
 * **Order: resolve the item's own assignment, then gate G1, then write.** The path addresses the item
 * and not its assignment, so trusting an assignment id from the client would let a student pair their
 * own assignment with a foreign item id -- the same defect `guardTutorArtifact` exists to prevent on
 * the tutor side. The item's assignment is read first, the gate runs against that, and
 * `applyChecklistTransition` checks the item is in the resolved scope again before writing.
 *
 * **There is no request body, and that is deliberate.** The only inputs are the item id and the
 * session; a body would be a second place a client could name the student or the assignment.
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
    transition: 'start',
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
