import { NextResponse, type NextRequest } from 'next/server';

import { PLATFORM_ERROR_MESSAGES, apiError, resolveRequestId, withRequestId, type ApiErrorBody } from '@/lib/api/errors';
import type { QueryThreadResponse } from '@/lib/api/types';
import { guardStudentVisibleAssignment } from '@/lib/auth/guards';
import type { Executor } from '@/lib/db/queries/courses';
import { findQueryScope } from '@/lib/db/queries/query-threads';
import { withTransaction } from '@/lib/db/transaction';
import { buildQueryThread, ownsQuery } from '@/features/queries/service';
import { queryViewerFor } from '@/features/queries/routes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/student/queries/{queryId}` (`06` section 5.4, 5.5.12).
 *
 * **The student's own thread only, and another student's is `NOT_FOUND`.** The route resolves the
 * thread's assignment first, then runs the *student visibility* guard on it, then checks ownership
 * inside the feature -- so an unpublished assignment, a foreign course's assignment and another student's
 * thread are three failures the caller cannot tell apart. That is `06` section 5.2 rule 3's scope for
 * `FORBIDDEN_ROLE` (a wrong *role*) and `06` section 9.2's T-12 (a peer's resource is `NOT_FOUND`).
 *
 * **Why the write methods are absent.** `06` section 5.4 puts `POST .../queries/{queryId}/messages` at
 * `.../{queryId}/messages`, not here, so a `POST` to this path is not an operation the contract defines
 * and Next answers `405` by itself.
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

  const guarded = await guardStudentVisibleAssignment(request, requestId, located.assignmentId);
  if (!guarded.ok) return guarded.response;

  const viewer = queryViewerFor(guarded.value.session);
  if (viewer === null) return apiError('INTERNAL', PLATFORM_ERROR_MESSAGES.internal, requestId);

  const thread = await withTransaction(async (tx: Executor) => {
    if (!(await ownsQuery(tx, queryId, viewer))) return null;
    return buildQueryThread(tx, queryId);
  });
  if (thread === null) return apiError('NOT_FOUND', PLATFORM_ERROR_MESSAGES.notFound, requestId);

  return withRequestId(NextResponse.json(thread, { status: 200 }), requestId);
}
