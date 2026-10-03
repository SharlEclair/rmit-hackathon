import { NextResponse, type NextRequest } from 'next/server';

import { resolveRequestId, withRequestId, type ApiErrorBody } from '@/lib/api/errors';
import type { TutorQueryGroupListResponse } from '@/lib/api/types';
import { guardTutorAssignment } from '@/lib/auth/guards';
import { withTransaction } from '@/lib/db/transaction';
import { buildTutorQueryGroups } from '@/features/queries/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/tutor/assignments/{assignmentId}/queries` (`06` section 5.4, 5.5.12).
 *
 * The tutor's queue, **grouped by approved Milestone**. `06` section 5.5.12 fixes `grouping` at
 * `'milestone'` because topic clustering is out of scope in the MVP (`02` section 2.4), so the reserved
 * `topic_label` columns on `queries` are never read here; the group label is the tutor-approved Milestone
 * title and therefore T3, with `labelSource: 'milestone'` as a literal.
 *
 * **The gate is the tutor enrolment on the assignment's course, and it answers `404`.** A student calling
 * this path gets `FORBIDDEN_ROLE` from the role check (`06` section 5.2 rule 3); a tutor on another
 * course gets `NOT_FOUND`, so they cannot distinguish a foreign assignment from an absent one.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ assignmentId: string }> },
): Promise<NextResponse<TutorQueryGroupListResponse | ApiErrorBody>> {
  const requestId = resolveRequestId(request);
  const { assignmentId } = await context.params;

  const guarded = await guardTutorAssignment(request, requestId, assignmentId);
  if (!guarded.ok) return guarded.response;

  const groups = await withTransaction((tx) => buildTutorQueryGroups(tx, assignmentId));
  return withRequestId(NextResponse.json(groups, { status: 200 }), requestId);
}
