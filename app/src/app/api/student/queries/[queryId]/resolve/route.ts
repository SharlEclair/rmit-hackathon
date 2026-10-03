import { NextResponse, type NextRequest } from 'next/server';

import { PLATFORM_ERROR_MESSAGES, apiError, resolveRequestId, withRequestId, type ApiErrorBody } from '@/lib/api/errors';
import type { QueryThreadResponse } from '@/lib/api/types';
import { guardStudentVisibleAssignment } from '@/lib/auth/guards';
import type { Executor } from '@/lib/db/queries/courses';
import { findQueryScope } from '@/lib/db/queries/query-threads';
import { withTransaction } from '@/lib/db/transaction';
import { ownsQuery, resolveOwnQuery } from '@/features/queries/service';
import { queryViewerFor } from '@/features/queries/routes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `POST /api/student/queries/{queryId}/resolve` (`06` section 5.4, `07` section 5.4).
 *
 * **The student's own conclusion, and the only actor who can reach it.** `06` section 5.4 places
 * `resolve` on the student's path and `07` section 5.4's control is the asker's, because only they know
 * whether the answer worked; a tutor closing a question would record the tutor's view of their own
 * answer. The service refuses anything but `answered`, so a question no tutor has replied to cannot be
 * marked resolved.
 */
export async function POST(
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

  const outcome = await withTransaction(async (tx: Executor) => {
    if (!(await ownsQuery(tx, queryId, viewer))) return null;
    return resolveOwnQuery(tx, { queryId, viewer, now: new Date() });
  });
  if (outcome === null) return apiError('NOT_FOUND', PLATFORM_ERROR_MESSAGES.notFound, requestId);
  if (!outcome.ok) return apiError(outcome.code, outcome.message, requestId);

  return withRequestId(NextResponse.json(outcome.value, { status: 200 }), requestId);
}
