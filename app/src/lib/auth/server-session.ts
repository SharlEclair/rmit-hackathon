/**
 * Session resolution for **server components**.
 *
 * **Why this module has to exist.** `src/lib/auth/roles.ts` resolves a session from a `NextRequest`,
 * which a server component does not have: it has `cookies()` and no request object. The middleware's
 * presence check is explicitly not authorisation (`_shared.ts`: "a layout-level check is convenience,
 * not authorisation"), so the student pages need a real server-side resolver. Without one, a page would
 * either trust the middleware -- which `04` section 9.1 forbids -- or hand-roll the cookie read and
 * token verify, which is where a subtle difference from the route-handler path would become an
 * authentication bypass.
 *
 * **It resolves the session the same way the routes do, minus the request plumbing.** The order is
 * `readSessionCookie` -> `verifySessionToken` -> `findUserProfileById` -> `listCourseMemberships`, which
 * is exactly `getSession`'s order in `roles.ts`. The role comes from the `users` row on this request,
 * never from the token's claim, so a deactivated account or a changed role takes effect immediately
 * (`04` section 9.1).
 *
 * **Every failure returns `null`**, like `getSession`: no cookie, a tampered or expired token, an
 * unknown or inactive user, a missing `AUTH_SECRET`, or an unreachable database. A caller decides
 * whether to redirect or to render an error, and there is no path by which a failure reads as an
 * authenticated session.
 */

import { cookies } from 'next/headers';

import type { SessionContext } from '@/lib/auth/roles';
import { SESSION_COOKIE_NAME } from '@/lib/auth/_shared';
import { verifySessionToken } from '@/lib/auth/session';
import { findUserProfileById, listCourseMemberships } from '@/lib/auth/user-repository';
import { getConfigRead } from '@/lib/config';

/** The cookie value, or `null`. `cookies()` is async in this Next version. */
export async function readServerSessionToken(): Promise<string | null> {
  const jar = await cookies();
  const cookie = jar.get(SESSION_COOKIE_NAME);
  if (cookie === undefined || cookie.value === '') return null;
  return cookie.value;
}

/**
 * The session for this request, or `null`. Never throws, for the reason in this module's header.
 */
export async function getServerSession(): Promise<SessionContext | null> {
  // `getConfigRead`, not `getConfig`: the latter throws on a fatal problem, and a page that throws
  // inside a server component renders a stack rather than a login form. A missing secret is a `null`
  // session here -- `getSession` in `roles.ts` makes the same choice for the same reason.
  const { databaseUrl, authSecret } = getConfigRead().config;
  if (authSecret === null || authSecret === '') return null;

  const token = await readServerSessionToken();
  if (token === null) return null;

  const payload = verifySessionToken(token, authSecret);
  if (payload === null) return null;

  try {
    const profile = await findUserProfileById(databaseUrl, payload.sub);
    if (profile === null || !profile.isActive) return null;
    const courses = await listCourseMemberships(databaseUrl, profile.id);
    return {
      userId: profile.id,
      role: profile.role,
      profile,
      courses,
      expiresAt: payload.exp,
    };
  } catch {
    // An unreachable database is not an authenticated request. The caller chooses how to report it.
    return null;
  }
}

/**
 * The session for a **student** page, or `null`.
 *
 * A tutor who navigates to a student path gets `null` rather than their own session, so a page cannot
 * accidentally render student content for the wrong role. The route handlers answer
 * `FORBIDDEN_ROLE` in the same situation (`06` section 5.2 rule 3); a page redirects, because a
 * browser cannot render an error envelope.
 */
export async function getStudentServerSession(): Promise<SessionContext | null> {
  const session = await getServerSession();
  if (session === null || session.role !== 'student') return null;
  return session;
}
