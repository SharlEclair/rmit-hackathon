import { NextResponse, type NextRequest } from 'next/server';

import {
  PLATFORM_ERROR_MESSAGES,
  apiError,
  resolveRequestId,
  withRequestId,
  type ApiErrorBody,
} from '@/lib/api/errors';
import type { ReviewCountsResponse } from '@/lib/api/types';
import { guardTutorAssignment } from '@/lib/auth/guards';
import { withTransaction } from '@/lib/db/transaction';
import { approveAllReviewable, readPublicationCounts } from '@/lib/db/queries/review';
import { findCurrentStructureId } from '@/lib/db/queries/review';
import { insertAuditLog } from '@/lib/db/queries/audit';
import { randomUUID } from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `POST /api/tutor/assignments/{assignmentId}/approve` (`06` section 5.4).
 *
 * Transition 4/5 in bulk: every artifact of the current structure that is `NEEDS_REVIEW` or `EDITED`
 * becomes `APPROVED`, and the assignment stays `in_review`. Approving is **not** publishing -- gate
 * rule G1 makes `PUBLISHED` the only student-visible status (`06` section 3.4, D99), so this route
 * changes nothing a student can see. That separation is the whole point of the two-step lifecycle
 * (D21) and the reason `counts` is returned rather than a boolean.
 *
 * The SQL filters on status, so an already-approved artifact is simply not selected: `07` section 7.3
 * rule 7 asks the UI to report what it skipped, and reporting a zero-move is more honest than
 * refusing the whole call because one card was already approved.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ assignmentId: string }> },
): Promise<NextResponse<ReviewCountsResponse | ApiErrorBody>> {
  const requestId = resolveRequestId(request);
  const { assignmentId } = await context.params;

  const guarded = await guardTutorAssignment(request, requestId, assignmentId);
  if (!guarded.ok) return guarded.response;
  const { session } = guarded.value;

  const result = await withTransaction(async (tx) => {
    const structureId = await findCurrentStructureId(tx, assignmentId);
    if (structureId === null) return null;

    const { moved } = await approveAllReviewable(tx, {
      assignmentId,
      structureId,
      actorUserId: session.userId,
    });
    if (moved > 0) {
      // One audit row for the bulk action (`06` section 3.5 rule 4). The alternative -- a row per
      // artifact -- would bury the tutor's single decision among forty identical rows.
      await insertAuditLog(tx, {
        id: randomUUID(),
        actorUserId: session.userId,
        actorRole: 'tutor',
        action: 'artifact.approved_all',
        targetTable: 'assignment_structures',
        targetId: structureId,
        before: null,
        after: { transition: 4, approvedArtifacts: moved },
        requestId,
      });
    }

    const counts = await readPublicationCounts(tx, assignmentId, structureId);
    return { moved, counts };
  });

  if (result === null) {
    return apiError('NOT_FOUND', PLATFORM_ERROR_MESSAGES.notFound, requestId);
  }

  const body: ReviewCountsResponse = {
    counts: result.counts,
    approved: result.moved,
    // Nothing is skipped by a status filter that simply does not match; the number exists so the UI
    // can say "approved 12, 3 already approved" without a second request.
    skipped: 0,
  };
  return withRequestId(NextResponse.json(body, { status: 200 }), requestId);
}
