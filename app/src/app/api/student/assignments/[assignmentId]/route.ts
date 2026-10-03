import { NextResponse, type NextRequest } from 'next/server';

import { PLATFORM_ERROR_MESSAGES, apiError, resolveRequestId, withRequestId, type ApiErrorBody } from '@/lib/api/errors';
import type { StudentWorkspaceResponse } from '@/lib/api/types';
import { guardStudentVisibleAssignment } from '@/lib/auth/guards';
import { withTransaction } from '@/lib/db/transaction';
import { buildStudentWorkspace } from '@/features/workspace/bundle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/student/assignments/{assignmentId}` (`06` section 5.4, 5.5.3).
 *
 * The workspace bootstrap: the assignment header, the published document manifest, the Map, the
 * Checklist with this student's own progress, the AI Usage Policy, the official-FAQ count and the five
 * counts the tab strip renders.
 *
 * **`404`, never an empty shell** (`06` section 3.4, trap T3). `guardStudentVisibleAssignment` resolves
 * gate rule G1 and enrolment, and both answer `NOT_FOUND`, so a `draft`, `ingesting`, `in_review` or
 * `archived` assignment -- and another course's assignment -- are indistinguishable from an absent one.
 *
 * **One transaction for the whole bundle.** The five reads describe one instant; a student who
 * completes an item while this runs must not see a completed count from before it beside a Map from
 * after it.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ assignmentId: string }> },
): Promise<NextResponse<StudentWorkspaceResponse | ApiErrorBody>> {
  const requestId = resolveRequestId(request);
  const { assignmentId } = await context.params;

  const guarded = await guardStudentVisibleAssignment(request, requestId, assignmentId);
  if (!guarded.ok) return guarded.response;

  const bundle = await withTransaction((tx) =>
    buildStudentWorkspace(tx, guarded.value.scope, guarded.value.session.userId),
  );
  if (bundle === null) {
    // Unreachable while the guard holds a VisibleScope: it only returns a scope for a published
    // assignment, and `readWorkspaceHeader` asks for the same condition. It is a `404` rather than an
    // assertion so the route has one branch and a future widening of the gate fails closed.
    return apiError('NOT_FOUND', PLATFORM_ERROR_MESSAGES.notFound, requestId);
  }

  return withRequestId(NextResponse.json(bundle, { status: 200 }), requestId);
}
