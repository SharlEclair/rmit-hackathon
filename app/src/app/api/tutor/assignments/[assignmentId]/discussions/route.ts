import { NextResponse, type NextRequest } from 'next/server';

import { PLATFORM_ERROR_MESSAGES, apiError, resolveRequestId, withRequestId, type ApiErrorBody } from '@/lib/api/errors';
import type { TutorDiscussionResponse } from '@/lib/api/types';
import { guardTutorAssignment } from '@/lib/auth/guards';
import { withTransaction } from '@/lib/db/transaction';
import { buildTutorDiscussion } from '@/features/discussion/service';
import { viewerFor } from '@/features/discussion/routes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/tutor/assignments/{assignmentId}/discussions` (`06` section 5.4, 5.5.13).
 *
 * The tutor's Discussions tab: the same threads a student sees, plus the **moderation queue**. Two
 * differences from the student read, and both are the anonymity contract rather than a presentation
 * choice:
 *
 *   1. A `hidden_pending_review` post keeps its body for a tutor. `07` section 6.4's tutor view is
 *      "Full post plus the flag reason and severity, with `Approve`, `Remove`" -- the queue cannot ask a
 *      tutor to judge a post whose text they cannot read.
 *   2. The queue carries no reporter. `06` section 5.5.14 has no reporter field and D54 stores the
 *      reporter as the flagger's anonymous identity, so the queue is structurally unable to resolve who
 *      flagged anything (`06` section 4.4).
 *
 * **The gate is the tutor enrolment on the assignment's course, and it answers `404`.** A student
 * calling this path gets `FORBIDDEN_ROLE` from `guardTutorAssignment`'s role check (`06` section 5.2
 * rule 3), and a tutor on another course gets `NOT_FOUND` -- they cannot distinguish a foreign
 * assignment from an absent one.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ assignmentId: string }> },
): Promise<NextResponse<TutorDiscussionResponse | ApiErrorBody>> {
  const requestId = resolveRequestId(request);
  const { assignmentId } = await context.params;

  const guarded = await guardTutorAssignment(request, requestId, assignmentId);
  if (!guarded.ok) return guarded.response;

  const viewer = viewerFor(guarded.value, 'tutor');
  if (viewer === null) return apiError('INTERNAL', PLATFORM_ERROR_MESSAGES.internal, requestId);

  const discussion = await withTransaction((tx) =>
    buildTutorDiscussion(tx, { assignmentId }, viewer),
  );
  return withRequestId(NextResponse.json(discussion, { status: 200 }), requestId);
}
