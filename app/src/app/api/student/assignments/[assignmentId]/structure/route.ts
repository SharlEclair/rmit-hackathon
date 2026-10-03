import { NextResponse, type NextRequest } from 'next/server';

import { PLATFORM_ERROR_MESSAGES, apiError, resolveRequestId, withRequestId, type ApiErrorBody } from '@/lib/api/errors';
import type { AssignmentMapResponse } from '@/lib/api/types';
import { guardStudentVisibleAssignment } from '@/lib/auth/guards';
import { withTransaction } from '@/lib/db/transaction';
import { buildAssignmentMap } from '@/features/structure/map';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/student/assignments/{assignmentId}/structure` (`06` section 5.4, 5.5.5).
 *
 * **This route exists in Phase 4 to make gate rule G1 verifiable over HTTP.** WP-06's verification
 * gate asks for a student request against content that is not student-visible and expects `404`,
 * repeated after publication and expecting `200`; `06` section 10 item 17 names this path and
 * `.../assignments/{assignmentId}` as the two places that assertion lands, because an unapproved
 * milestone is deliberately not addressable on its own. Phase 5 (WP-07) owns the rest of the
 * workspace.
 *
 * **`404`, never an empty shell** (`06` section 3.4, trap T3). The guard resolves gate rule G1 in the
 * query layer and the enrolment check; both answer `NOT_FOUND`, so a student cannot distinguish "this
 * assignment is not published" from "this course is not mine" -- and an assignment that is
 * `in_review`, `draft`, `ingesting` or `archived` is indistinguishable from one that does not exist.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ assignmentId: string }> },
): Promise<NextResponse<AssignmentMapResponse | ApiErrorBody>> {
  const requestId = resolveRequestId(request);
  const { assignmentId } = await context.params;

  const guarded = await guardStudentVisibleAssignment(request, requestId, assignmentId);
  if (!guarded.ok) return guarded.response;

  const map = await withTransaction((tx) => buildAssignmentMap(tx, guarded.value.scope));
  if (map.nodes.length === 0 && map.edges.length === 0) {
    // A published assignment with nothing published inside it is a state publish's blockers are
    // supposed to prevent (`NO_MILESTONE`, `NO_POLICY_RULE_APPROVED`). Returning the empty map would
    // be the "empty shell" T3 forbids, so it is reported as a missing resource -- which is also what
    // the tutor would see: nothing has been approved yet.
    return apiError('NOT_FOUND', PLATFORM_ERROR_MESSAGES.notFound, requestId);
  }

  return withRequestId(NextResponse.json(map, { status: 200 }), requestId);
}
