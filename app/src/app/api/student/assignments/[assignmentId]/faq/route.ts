import { NextResponse, type NextRequest } from 'next/server';

import { resolveRequestId, withRequestId, type ApiErrorBody } from '@/lib/api/errors';
import type { FaqEntryListResponse } from '@/lib/api/types';
import { guardStudentVisibleAssignment } from '@/lib/auth/guards';
import { withTransaction } from '@/lib/db/transaction';
import { buildStudentFaq } from '@/features/faq/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/student/assignments/{assignmentId}/faq` (`06` section 5.4).
 *
 * The cohort-visible FAQ. **`PUBLISHED` only, filtered in the query layer** (D99): the read is
 * `listPublishedFaqEntries`, so an `APPROVED` entry is invisible here even though a tutor has approved it.
 * Gate rule G1 also applies -- an unpublished assignment is `NOT_FOUND` before the FAQ is read -- and the
 * same function backs the Discussions tab's `officialFaq`, so the two surfaces cannot show different sets.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ assignmentId: string }> },
): Promise<NextResponse<FaqEntryListResponse | ApiErrorBody>> {
  const requestId = resolveRequestId(request);
  const { assignmentId } = await context.params;

  const guarded = await guardStudentVisibleAssignment(request, requestId, assignmentId);
  if (!guarded.ok) return guarded.response;

  const items = await withTransaction((tx) =>
    buildStudentFaq(tx, guarded.value.scope.assignmentId),
  );
  return withRequestId(NextResponse.json({ items }, { status: 200 }), requestId);
}
