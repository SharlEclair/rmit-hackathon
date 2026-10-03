import { NextResponse, type NextRequest } from 'next/server';

import { resolveRequestId, withRequestId, type ApiErrorBody } from '@/lib/api/errors';
import type { ChecklistResponse } from '@/lib/api/types';
import { guardStudentVisibleAssignment } from '@/lib/auth/guards';
import { withTransaction } from '@/lib/db/transaction';
import { buildChecklistResponse } from '@/features/workspace/bundle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/student/assignments/{assignmentId}/checklist` (`06` section 5.4, 5.5.6).
 *
 * The published Milestones and Checklist items with **this student's own** progress. `07` section 4.6
 * rule 2: "the progress header shows completed over total and the resolution rate, both computed from
 * published items only" -- which is why the denominator is the published item count rather than the
 * assignment's item count.
 *
 * It returns an empty `milestones` array for a published assignment with nothing published inside it
 * rather than a `404`: the assignment itself is visible, so its Checklist tab exists and shows its own
 * empty state (`07` section 4.1 rule 3: "A tab with nothing published yet is still present and shows
 * its empty state. Tabs are never hidden"). The `404` belongs to the assignment, and the guard
 * already answered it.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ assignmentId: string }> },
): Promise<NextResponse<ChecklistResponse | ApiErrorBody>> {
  const requestId = resolveRequestId(request);
  const { assignmentId } = await context.params;

  const guarded = await guardStudentVisibleAssignment(request, requestId, assignmentId);
  if (!guarded.ok) return guarded.response;

  const checklist = await withTransaction((tx) =>
    buildChecklistResponse(tx, guarded.value.scope, guarded.value.session.userId),
  );
  return withRequestId(NextResponse.json(checklist, { status: 200 }), requestId);
}
