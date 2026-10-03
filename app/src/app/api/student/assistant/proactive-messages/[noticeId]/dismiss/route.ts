/**
 * `POST /api/student/assistant/proactive-messages/{noticeId}/dismiss` -- dismissal, once
 * (`06-DATA-MODEL.md` sections 5.4, 7.3.5; `07-UI-UX-SPEC.md` section 4.7.1 rule 5).
 *
 * **How this path still runs the student guard.** The route has no assignment id, and every student
 * route must pass `guardStudentVisibleAssignment` (`06` section 5.2, trap T3). So the notice is
 * resolved first and the assignment id is taken from it -- the same shape `guardTutorArtifact` uses,
 * and the only version in which the guard is not weakened to keep a URL convenient. The notice's own
 * `student_id` is then compared against the session, so another student's notice id is
 * indistinguishable from an absent one.
 *
 * A second dismissal is `409 INVALID_STATE_TRANSITION`, not a silent success: the transcript keeps
 * one `dismissed_at`, and pretending to set it twice would hide a client bug.
 */

import { NextResponse, type NextRequest } from 'next/server';

import { PLATFORM_ERROR_MESSAGES, apiError, resolveRequestId, withRequestId, type ApiErrorBody } from '@/lib/api/errors';
import type { ProactiveMessageResponse } from '@/lib/api/types';
import { guardStudentVisibleAssignment } from '@/lib/auth/guards';
import { findProactiveNoticeContext } from '@/lib/db/queries/assistant';
import { withTransaction } from '@/lib/db/transaction';
import { dismissNotice, resolveMilestone } from '@/features/assistant/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ noticeId: string }> },
): Promise<NextResponse<ProactiveMessageResponse | ApiErrorBody>> {
  const requestId = resolveRequestId(request);
  const { noticeId } = await context.params;

  // Resolve first, because the assignment id lives on the notice's student-assignment row.
  const located = await withTransaction((tx) => findProactiveNoticeContext(tx, noticeId));
  if (located === null) {
    return apiError('NOT_FOUND', PLATFORM_ERROR_MESSAGES.notFound, requestId);
  }

  const guarded = await guardStudentVisibleAssignment(request, requestId, located.assignmentId);
  if (!guarded.ok) return guarded.response;

  // The notice's owner must be the caller. Same answer as a missing notice (`06` section 5.2 rule 2).
  if (located.studentId !== guarded.value.session.userId) {
    return apiError('NOT_FOUND', PLATFORM_ERROR_MESSAGES.notFound, requestId);
  }

  const milestone = await withTransaction((tx) =>
    resolveMilestone(tx, guarded.value.scope, located.notice.milestoneId),
  );
  if (milestone === null) {
    // The milestone is no longer published, so the notice is not student-visible either (G1).
    return apiError('NOT_FOUND', PLATFORM_ERROR_MESSAGES.notFound, requestId);
  }

  const payload = await withTransaction((tx) => dismissNotice(tx, noticeId, milestone.title));
  if (payload === null) {
    return apiError(
      'INVALID_STATE_TRANSITION',
      'That notice has already been dismissed.',
      requestId,
    );
  }

  return withRequestId(NextResponse.json(payload, { status: 200 }), requestId);
}
