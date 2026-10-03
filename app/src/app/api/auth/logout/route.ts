import { NextResponse, type NextRequest } from 'next/server';

import {
  AUTH_ERROR_MESSAGES,
  apiError,
  resolveRequestId,
  withRequestId,
} from '@/lib/api/errors';
import { getSession } from '@/lib/auth/roles';
import { clearSessionCookie } from '@/lib/auth/session';
import { getConfig } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `POST /api/auth/logout` (`06` S5.4: **authenticated**; 204; failure `UNAUTHENTICATED`).
 *
 * This is one of the few places `getSession` is used directly rather than through `requireRole`:
 * the route needs *any* valid session, not a specific role, because `06` S5.4 types its role as
 * `authenticated` ("any valid session cookie, either role" -- `06` S5.2).
 *
 * The cookie is cleared, not revoked: there is no revocation store (D79), so a copy of the token
 * captured before sign-out stays valid until it expires. This route must not claim otherwise.
 */
export async function POST(request: NextRequest): Promise<NextResponse<unknown>> {
  const requestId = resolveRequestId(request);

  const session = await getSession(request);
  if (session === null) {
    return apiError('UNAUTHENTICATED', AUTH_ERROR_MESSAGES.noSession, requestId);
  }

  // 204 with no body: `06` S5.4 fixes the success status, and a body would have nowhere to go.
  const response = new NextResponse(null, { status: 204 });
  clearSessionCookie(response, { secure: getConfig().nodeEnv === 'production' });
  return withRequestId(response, requestId);
}
