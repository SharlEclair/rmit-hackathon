import { NextResponse, type NextRequest } from 'next/server';

import { PLATFORM_ERROR_MESSAGES, apiError, resolveRequestId, withRequestId, type ApiErrorBody } from '@/lib/api/errors';
import type { QueryThreadResponse } from '@/lib/api/types';
import { guardTutorAssignment } from '@/lib/auth/guards';
import { findQueryScope } from '@/lib/db/queries/query-threads';
import { withTransaction } from '@/lib/db/transaction';
import { buildQueryThread } from '@/features/queries/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/tutor/queries/{queryId}` (`06` section 5.4, 5.5.12).
 *
 * One thread with its messages. **A tutor sees the asking student's display name**, because a private
 * Query is always attributed (D24, D50) -- that is the whole difference between this and a Discussion,
 * and it is why the thread response carries `authorDisplayName` with no `isAnonymised` beside it.
 *
 * The assignment is resolved from the thread and then gated, so a tutor on another course receives
 * `NOT_FOUND` rather than a refusal that would confirm the thread exists.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ queryId: string }> },
): Promise<NextResponse<QueryThreadResponse | ApiErrorBody>> {
  const requestId = resolveRequestId(request);
  const { queryId } = await context.params;

  const located = await withTransaction((tx) => findQueryScope(tx, queryId));
  if (located === null) {
    return apiError('NOT_FOUND', PLATFORM_ERROR_MESSAGES.notFound, requestId);
  }

  const guarded = await guardTutorAssignment(request, requestId, located.assignmentId);
  if (!guarded.ok) return guarded.response;

  const thread = await withTransaction((tx) => buildQueryThread(tx, queryId));
  if (thread === null) return apiError('NOT_FOUND', PLATFORM_ERROR_MESSAGES.notFound, requestId);

  return withRequestId(NextResponse.json(thread, { status: 200 }), requestId);
}
