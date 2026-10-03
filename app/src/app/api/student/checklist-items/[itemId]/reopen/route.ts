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
 * `POST /api/student/checklist-items/{itemId}/reopen` (`06` section 5.4, 5.1.1).
 *
 * **D48, in full.** `06` section 7.3.2: "Re-opening a completed item sets `state = 'in_progress'`,
 * increments `reopen_count`, and changes `last_state_changed_at`; it does not clear `completed_at` and
 * does not add to `elapsed_seconds`." The first interval therefore survives, and `07` section 4.6 rule
 * 6's row shows it beside `Reopened <n> time(s)` -- the UI state the API calls `reopened`, derived
 * from `reopenCount` (see `uiStateOf`).
 *
 * **The optional `expectedReopenCount` is the optimistic-concurrency token.** Two tabs reopening the
 * same item once must not produce `reopenCount = 2`; the second call sends the count it saw, the
 * `reopen_count = <expected>` guard refuses it, and the route answers `INVALID_STATE_TRANSITION` so the
 * client reloads. Omitting the field means "use the current count", which is correct for a single
 * caller and is what makes the transition idempotent for a script that does not track it.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ itemId: string }> },
): Promise<NextResponse<ChecklistProgressResponse | ApiErrorBody>> {
  const requestId = resolveRequestId(request);
  const { itemId } = await context.params;

  let expectedReopenCount: number | undefined;
  try {
    const raw: unknown = await request.json();
    if (raw !== null && typeof raw === 'object') {
      const value = (raw as Record<string, unknown>)['expectedReopenCount'];
      if (value !== undefined) {
        if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
          return apiError('VALIDATION_FAILED', PLATFORM_ERROR_MESSAGES.invalidBody, requestId, {
            expectedReopenCount: 'must be a non-negative integer',
          });
        }
        expectedReopenCount = value;
      }
    }
  } catch {
    // No body at all is valid: the field is optional, and an absent body means "use the current
    // count". A malformed body is treated the same way rather than as a failure, because the
    // transition needs nothing from it to be correct.
  }

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
    transition: 'reopen',
    scope: guarded.value.scope,
    session: guarded.value.session,
    itemId,
    anonIdSecret,
    now: new Date(),
    ...(expectedReopenCount === undefined ? {} : { expectedReopenCount }),
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
