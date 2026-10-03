import { NextResponse, type NextRequest } from 'next/server';

import { resolveRequestId, withRequestId, type ApiErrorBody } from '@/lib/api/errors';
import type { AiPolicyResponse } from '@/lib/api/types';
import { guardStudentVisibleAssignment } from '@/lib/auth/guards';
import { withTransaction } from '@/lib/db/transaction';
import { buildAiPolicyResponse } from '@/features/workspace/bundle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/student/assignments/{assignmentId}/policy` (`06` section 5.4, 5.5.7).
 *
 * The published AI Usage Policy, verbatim. `07` section 4.2.1: the card is present only when at least
 * one rule is `PUBLISHED`, each rule is "shown verbatim, exactly as the tutor approved it", and the
 * interface "never summarises, merges, or rewords a rule".
 *
 * **`available: false` is a state, not an absence** (D47). When no rule is published the guardrail
 * returns `REFUSE` with reason code `POL_ABSENT` and makes no model call, and the Assistant renders as
 * the unavailable variant rather than as an empty but usable box. `06` section 5.5.7 states there is
 * "no permissive fallback", so this route reports the state instead of 404ing, which is what lets the
 * UI show the unavailable copy with its `Ask your tutor privately` control.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ assignmentId: string }> },
): Promise<NextResponse<AiPolicyResponse | ApiErrorBody>> {
  const requestId = resolveRequestId(request);
  const { assignmentId } = await context.params;

  const guarded = await guardStudentVisibleAssignment(request, requestId, assignmentId);
  if (!guarded.ok) return guarded.response;

  const policy = await withTransaction((tx) => buildAiPolicyResponse(tx, guarded.value.scope));
  return withRequestId(NextResponse.json(policy, { status: 200 }), requestId);
}
