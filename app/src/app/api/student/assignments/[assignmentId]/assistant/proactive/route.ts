/**
 * `GET /api/student/assignments/{assignmentId}/assistant/proactive` -- the one permitted proactive
 * notice for a milestone, or `null` (`06-DATA-MODEL.md` sections 5.4, 7.3.5; O2).
 *
 * **`null` is a real answer, not a 404.** No published milestone, a dismissed notice, or published
 * content that cannot support a single bullet all mean "no notice is due", and `06` section 5.4 gives
 * this route `null` for exactly that. `07` section 4.7.1 rule 3 forbids padding a notice to three
 * bullets with advice, and this route never invents one to avoid an empty response.
 *
 * **`?milestoneId=` selects the milestone.** `07` section 4.7.1's notice is per milestone and the
 * client knows which one it opened; with no parameter the first published milestone is used, so a
 * caller that has not been updated still gets the documented behaviour rather than an error.
 */

import { NextResponse, type NextRequest } from 'next/server';

import { PLATFORM_ERROR_MESSAGES, apiError, resolveRequestId, withRequestId, type ApiErrorBody } from '@/lib/api/errors';
import type { ProactiveMessageResponse } from '@/lib/api/types';
import { guardStudentVisibleAssignment } from '@/lib/auth/guards';
import { getConfig } from '@/lib/config';
import { deriveSubjectRef } from '@/lib/db/queries/analytics';
import { withTransaction } from '@/lib/db/transaction';
import { loadOrCreateProactiveNotice } from '@/features/assistant/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ assignmentId: string }> },
): Promise<NextResponse<ProactiveMessageResponse | null | ApiErrorBody>> {
  const requestId = resolveRequestId(request);
  const { assignmentId } = await context.params;

  const guarded = await guardStudentVisibleAssignment(request, requestId, assignmentId);
  if (!guarded.ok) return guarded.response;
  const { session, scope } = guarded.value;

  let config: ReturnType<typeof getConfig>;
  try {
    config = getConfig();
  } catch {
    return apiError('INTERNAL', PLATFORM_ERROR_MESSAGES.internal, requestId);
  }
  const anonIdSecret = config.anonIdSecret;
  if (anonIdSecret === null) {
    return apiError('INTERNAL', PLATFORM_ERROR_MESSAGES.internal, requestId);
  }

  const subjectRef = deriveSubjectRef(anonIdSecret, session.userId, scope.assignmentId);
  const milestoneParam = request.nextUrl.searchParams.get('milestoneId');
  const milestoneId = milestoneParam === null || milestoneParam === '' ? null : milestoneParam;

  const payload = await withTransaction((tx) =>
    loadOrCreateProactiveNotice(tx, {
      context: { session, scope },
      subjectRef,
      anonIdSecret,
      milestoneId,
      occurredAt: new Date(),
    }),
  );

  return withRequestId(NextResponse.json(payload, { status: 200 }), requestId);
}
