import { NextResponse, type NextRequest } from 'next/server';

import { resolveRequestId, withRequestId, type ApiErrorBody } from '@/lib/api/errors';
import type { AssignmentHealthResponse } from '@/lib/api/types';
import { guardTutorAssignment } from '@/lib/auth/guards';
import { withTransaction } from '@/lib/db/transaction';
import { buildAssignmentHealth } from '@/features/analytics/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/tutor/assignments/{assignmentId}/analytics` (`06` section 5.4 line 604, 5.5.11).
 *
 * The route is named `analytics` and returns `AssignmentHealthResponse` -- `06` section 5.4's own pairing
 * ("Assignment Health: headline, milestone metrics, potential difficulty areas"). `/api/health` is a
 * different route entirely: it is the **public** liveness check of `06` section 5.5.15, defined by D76 and
 * built in Phase 1, and it reports nothing about a cohort. Coding this at `/health` would have collided
 * with it and exposed the analytics gate on a public path.
 *
 * **The gate is the tutor enrolment, and it answers `404`**: a student calling this path gets
 * `FORBIDDEN_ROLE` from the role check (`06` section 5.2 rule 3), and a tutor on another course gets
 * `NOT_FOUND`.
 *
 * **C5 and D31 hold by construction rather than by filtering.** The response is built from
 * `milestone_metrics`, whose every row satisfies `contributor_count >= 5` (a `having` in the build query
 * and `ck_milestone_metrics_contributor_count` as a constraint), so no per-student figure can reach this
 * payload -- there is none in the type it reads. A milestone below the floor is reported with
 * `dataState: 'insufficient_data'` and every metric `null`, and `06` section 4.7.2 item 4 makes that
 * absence uniform: a reader cannot distinguish a bucket of 0 students from a bucket of 4.
 *
 * The build reads `analytics_events` and writes the two read models, then returns a read-back of what was
 * stored, so the response is the persisted aggregate and not a second, private computation.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ assignmentId: string }> },
): Promise<NextResponse<AssignmentHealthResponse | ApiErrorBody>> {
  const requestId = resolveRequestId(request);
  const { assignmentId } = await context.params;

  const guarded = await guardTutorAssignment(request, requestId, assignmentId);
  if (!guarded.ok) return guarded.response;

  const health = await withTransaction((tx) =>
    buildAssignmentHealth(tx, { assignmentId, now: new Date() }),
  );
  return withRequestId(NextResponse.json(health, { status: 200 }), requestId);
}
