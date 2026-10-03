/**
 * Session and role resolution for server components and route handlers (`04` S9.1, WP-03).
 *
 * **The rule this file enforces:** the authoritative role comes from the `users` row on every
 * request. The role claim inside the signed cookie is a convenience for the middleware's cheap
 * presence check; it is never an authorisation. `getSession` therefore verifies the token's
 * signature, then re-reads the account and refuses the session when the account is missing or
 * `is_active = false`. A role changed in the database, or an account deactivated, takes effect
 * on the very next request with no revocation store (`06` S7.1.1, D79).
 *
 * **Route handlers repeat the check.** `04` S9.1: "A server-side guard per route group. Route
 * handlers repeat the check; a layout-level check is convenience, not authorisation."
 */

import type { NextRequest } from 'next/server';

import type { ErrorCode } from '@/lib/api/errors';
import { clearSessionCookie, readSessionCookie, verifySessionToken, type SessionRole } from './session';
import {
  findUserProfileById,
  listCourseMemberships,
  type AuthUserProfile,
  type CourseMembership,
} from './user-repository';
import {
  LOGIN_PATH,
  STUDENT_LANDING_PATH,
  TUTOR_LANDING_PATH,
} from './_shared';

import { getConfig } from '@/lib/config';

export type Role = SessionRole;

/**
 * The fields of `06` S5.5.1 `SessionResponse`, reproduced field for field.
 *
 * The shape is deliberately duplicated from the doc rather than approximated: `06` S5.5.1 is
 * the contract, and this is the one place in `app/` that materialises it.
 */
export interface SessionUser {
  id: string;
  displayName: string;
  role: Role;
}

export interface SessionCourse {
  id: string;
  code: string;
  title: string;
  roleInCourse: Role;
}

export interface SessionResponse {
  user: SessionUser;
  courses: SessionCourse[];
  /** Role-appropriate landing path (`06` S5.5.1; `07` S3.1). */
  redirectTo: string;
}

/** A resolved, server-verified session. */
export interface SessionContext {
  /** The `users.id`. */
  userId: string;
  /** The role read from the `users` row on this request, never from the token. */
  role: Role;
  profile: AuthUserProfile;
  courses: CourseMembership[];
  /** Epoch milliseconds at which the token expires. */
  expiresAt: number;
}

/**
 * The landing path for a role. Exported because the login route and the middleware both need
 * it and neither may reach into the other.
 */
export function landingPathForRole(role: Role): string {
  return role === 'tutor' ? TUTOR_LANDING_PATH : STUDENT_LANDING_PATH;
}

/** The login path with a `?next=` hint (`07` S3.2). Empty or null `next` yields a bare path. */
export function loginPathWithNext(next: string | null | undefined): string {
  if (next === undefined || next === null || next === '' || !next.startsWith('/')) return LOGIN_PATH;
  if (next.startsWith('//')) return LOGIN_PATH;
  return `${LOGIN_PATH}?next=${encodeURIComponent(next)}`;
}

/**
 * A refusal a caller can turn into the house error envelope.
 *
 * `code` is one of the three codes WP-03's routes can return, so a route handler can map it
 * straight into `apiError` with no translation table.
 */
export class AuthError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

/** `AUTH_SECRET`, or a throw. Read through `config.ts`, the only `process.env` reader (WP-01). */
function authSecret(): string {
  const secret = getConfig().authSecret;
  if (secret === null || secret === '') {
    // `config.ts` marks a missing AUTH_SECRET fatal, so `getConfig()` has already thrown in
    // that case. This is the belt-and-braces refusal for an empty-but-present value.
    throw new Error('AUTH_SECRET is not configured');
  }
  return secret;
}

/**
 * Resolve the session for a request, **without throwing**.
 *
 * Returns `null` for every failure: no cookie, a tampered or expired token, an unknown user, an
 * inactive user, or an unreachable database. A caller that needs to distinguish "no session"
 * from "the database is down" must read `getConfig().databaseUrl` itself; this function
 * deliberately refuses to guess, because a guess here would be an authentication bypass.
 */
export async function getSession(request: NextRequest): Promise<SessionContext | null> {
  const { databaseUrl } = getConfig();
  let secret: string;
  try {
    secret = authSecret();
  } catch {
    return null;
  }

  const token = readSessionCookie(request);
  if (token === null) return null;

  const payload = verifySessionToken(token, secret);
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
    // An unreachable database is not an authenticated request. Refuse, and let the caller
    // decide how to report it.
    return null;
  }
}

/**
 * Resolve the session or raise `AuthError('UNAUTHENTICATED')`.
 *
 * For a route handler: catch the `AuthError` and return `apiError('UNAUTHENTICATED', ...)`.
 * For a server component: catch it and `redirect(loginPathWithNext(path))`.
 */
export async function requireSession(request: NextRequest): Promise<SessionContext> {
  const session = await getSession(request);
  if (session === null) {
    throw new AuthError('UNAUTHENTICATED', 'No valid session for this request.');
  }
  return session;
}

/**
 * Resolve the session and require one of the permitted roles.
 *
 * `requireRole('tutor', request)` throws `AuthError('UNAUTHENTICATED')` when there is no valid
 * session and `AuthError('FORBIDDEN_ROLE')` when the session is valid but the role is wrong
 * (`06` S5.2 rule 3). The role compared is `session.role`, which `getSession` read from the
 * `users` row on this request, never the cookie's claim.
 */
export async function requireRole(role: Role, request: NextRequest): Promise<SessionContext> {
  const session = await requireSession(request);
  if (session.role !== role) {
    throw new AuthError('FORBIDDEN_ROLE', 'The session does not hold the role this route requires.');
  }
  return session;
}

/** Build the `06` S5.5.1 payload for a signed-in user. Every field comes from the database. */
export function buildSessionResponse(context: SessionContext): SessionResponse {
  return {
    user: {
      id: context.profile.id,
      displayName: context.profile.displayName,
      role: context.profile.role,
    },
    courses: context.courses.map((course) => ({
      id: course.id,
      code: course.code,
      title: course.title,
      roleInCourse: course.roleInCourse,
    })),
    redirectTo: landingPathForRole(context.profile.role),
  };
}

/**
 * Drop the session cookie from a response.
 *
 * The token is not revoked -- there is no store to revoke it in (D79) -- it is only removed
 * from the browser. A cookie that was captured before sign-out remains valid until it expires.
 * That limitation is stated here rather than papered over.
 */
export function expireSessionCookie(response: Parameters<typeof clearSessionCookie>[0]): void {
  clearSessionCookie(response, { secure: getConfig().nodeEnv === 'production' });
}
