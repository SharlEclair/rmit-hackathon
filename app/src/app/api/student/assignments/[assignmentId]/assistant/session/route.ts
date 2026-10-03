/**
 * `GET /api/student/assignments/{assignmentId}/assistant/session` -- the transcript
 * (`06-DATA-MODEL.md` sections 5.4, 5.5.9).
 *
 * Same guard as every student route: role, gate rule G1, enrolment, all three answering `NOT_FOUND`
 * (trap T3). The session row is created here too, because `06` section 7.3.3 creates it "on the
 * first request", and a first visit must show an empty transcript rather than a 404.
 *
 * The response never contains an upload's original filename, its storage key or its extracted text:
 * the student turn carries `uploadIds` and nothing else (`06` section 7.3.6).
 */

import { NextResponse, type NextRequest } from 'next/server';

import { PLATFORM_ERROR_MESSAGES, apiError, resolveRequestId, withRequestId, type ApiErrorBody } from '@/lib/api/errors';
import type { AssistantSessionResponse } from '@/lib/api/types';
import { guardStudentVisibleAssignment } from '@/lib/auth/guards';
import { getConfig } from '@/lib/config';
import { deriveSubjectRef } from '@/lib/db/queries/analytics';
import { withTransaction } from '@/lib/db/transaction';
import { buildSessionResponse, ensureAssistantSession } from '@/features/assistant/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ assignmentId: string }> },
): Promise<NextResponse<AssistantSessionResponse | ApiErrorBody>> {
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
  if (config.anonIdSecret === null) {
    return apiError('INTERNAL', PLATFORM_ERROR_MESSAGES.internal, requestId);
  }

  const subjectRef = deriveSubjectRef(config.anonIdSecret, session.userId, scope.assignmentId);
  const payload = await withTransaction(async (tx) => {
    const assistantSession = await ensureAssistantSession(tx, { session, scope }, subjectRef);
    return buildSessionResponse(tx, assistantSession.id, scope.assignmentId);
  });

  return withRequestId(NextResponse.json(payload, { status: 200 }), requestId);
}
