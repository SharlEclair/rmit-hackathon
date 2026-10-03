import { NextResponse, type NextRequest } from 'next/server';

import { PLATFORM_ERROR_MESSAGES, apiError, resolveRequestId, withRequestId, type ApiErrorBody } from '@/lib/api/errors';
import type { StudentDiscussionResponse } from '@/lib/api/types';
import { guardStudentVisibleAssignment } from '@/lib/auth/guards';
import { withTransaction } from '@/lib/db/transaction';
import { buildStudentDiscussion } from '@/features/discussion/service';
import { viewerFor } from '@/features/discussion/routes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/student/assignments/{assignmentId}/discussions` (`06` section 5.4, 5.5.13).
 *
 * The Discussions tab: the published official FAQ (T2) plus every live thread (T4), each post labelled
 * through `discussion_author_display` and carrying no author id (`06` section 4.4).
 *
 * **Gate rule G1 decides, and it answers `404`.** The guard resolves the published scope and the
 * enrolment before any read, so an unpublished assignment and another course's assignment are the same
 * `NOT_FOUND` (`06` section 3.4, trap **T3**). The FAQ is read through `listVisibleFaqEntries` with that
 * same scope, so the T2 half cannot arrive from an assignment the caller cannot see.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ assignmentId: string }> },
): Promise<NextResponse<StudentDiscussionResponse | ApiErrorBody>> {
  const requestId = resolveRequestId(request);
  const { assignmentId } = await context.params;

  const guarded = await guardStudentVisibleAssignment(request, requestId, assignmentId);
  if (!guarded.ok) return guarded.response;

  const viewer = viewerFor(guarded.value, 'student');
  if (viewer === null) return apiError('INTERNAL', PLATFORM_ERROR_MESSAGES.internal, requestId);

  const discussion = await withTransaction((tx) =>
    buildStudentDiscussion(tx, guarded.value.scope, viewer),
  );
  return withRequestId(NextResponse.json(discussion, { status: 200 }), requestId);
}
