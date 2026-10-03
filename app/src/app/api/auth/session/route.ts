import { NextResponse, type NextRequest } from 'next/server';

import {
  AUTH_ERROR_MESSAGES,
  apiError,
  resolveRequestId,
  withRequestId,
  type ApiErrorBody,
} from '@/lib/api/errors';
import { buildSessionResponse, getSession, type SessionResponse } from '@/lib/auth/roles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/auth/session` (`06` S5.4: public; 200 `SessionResponse`; failure `UNAUTHENTICATED`).
 *
 * Public means "no session required to call it", not "answers without one": when the caller has
 * no valid session the response is the `UNAUTHENTICATED` envelope with 401, which is how the
 * shell decides to send the visitor to `/login` (`07` S3.1).
 *
 * Every field comes from the `users` and `enrollments` rows read on this request, so the role and
 * the course list are current even though the cookie's claims may be older (`04` S9.1).
 */
export async function GET(request: NextRequest): Promise<NextResponse<SessionResponse | ApiErrorBody>> {
  const requestId = resolveRequestId(request);
  const session = await getSession(request);
  if (session === null) {
    return apiError('UNAUTHENTICATED', AUTH_ERROR_MESSAGES.noSession, requestId);
  }
  return withRequestId(NextResponse.json(buildSessionResponse(session), { status: 200 }), requestId);
}
