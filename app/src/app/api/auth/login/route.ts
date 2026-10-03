import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { getConfig } from '@/lib/config';
import {
  AUTH_ERROR_MESSAGES,
  apiError,
  resolveRequestId,
  withRequestId,
  withRetryAfter,
  type ApiErrorBody,
} from '@/lib/auth/api-errors';
import { checkLoginRateLimit, callerKeyFor } from '@/lib/auth/rate-limit';
import { buildSessionResponse, type SessionResponse } from '@/lib/auth/roles';
import {
  PASSWORD_MAX_LENGTH,
  hashPassword,
  verifyPassword,
} from '@/lib/auth/password';
import { SESSION_LIFETIME_MS, setSessionCookie, signSessionToken } from '@/lib/auth/session';
import { findUserByEmail, listCourseMemberships, touchLastLoginAt, type AuthUser } from '@/lib/auth/user-repository';

// `@node-rs/argon2` and the `postgres` driver both need Node, not the edge runtime.
export const runtime = 'nodejs';

// A sign-in response carries a session decision; it is never cacheable (`06` S5.1).
export const dynamic = 'force-dynamic';

/**
 * `POST /api/auth/login` (`06` S5.4: public; 200 `SessionResponse`; failure codes
 * `VALIDATION_FAILED`, `UNAUTHENTICATED`, `RATE_LIMITED`).
 *
 * Order of operations, which is fixed by the contract and must not be rearranged:
 *   1. rate limit (before the password comparison -- `06` S5.6),
 *   2. body validation (`VALIDATION_FAILED`),
 *   3. account lookup + argon2id verification,
 *   4. `is_active` check (a false value fails with `UNAUTHENTICATED`, `06` S7.1.1),
 *   5. session issue.
 *
 * **Anti-enumeration (`07` S3.1):** an unknown email, a wrong password and a deactivated account
 * all produce the same 401 and the same message, so the response never confirms which addresses
 * exist. Two details serve that goal and must not be "optimised" away: when the account is
 * unknown the comparison runs against a dummy hash, and a deactivated account still has its real
 * password verified before the `is_active` check refuses it. Both keep the work (and therefore
 * the timing) of the three paths alike.
 *
 * **C7:** no password, hash, or secret is logged or returned. The success body is exactly
 * `06` S5.5.1's `SessionResponse`, which has no field that could carry a hash.
 */

const LoginRequestSchema = z.object({
  // The `users` table stores `email = lower(email)` with `UNIQUE (lower(email))` (`06` S7.1.1),
  // so the address is normalised here rather than compared case-sensitively.
  email: z
    .string()
    .trim()
    .min(3)
    .max(320)
    .transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

/**
 * A real argon2id hash of a throwaway value, used only to equalise the work done on the
 * unknown-email path. It is not a credential: it verifies nothing that can be signed in with,
 * and no seeded account has it. Generated at module load so the cost is paid once.
 *
 * Pre-computed at load rather than stored as a literal, so no hash-shaped string is committed
 * to the repository (C7 hygiene: a committed hash looks like a credential even when it is not).
 */
const DUMMY_PASSWORD_HASH = await hashPassword('not-a-real-password-placeholder');

export async function POST(request: NextRequest): Promise<NextResponse<SessionResponse | ApiErrorBody>> {
  const requestId = resolveRequestId(request);

  // 1. Rate limit, before anything touches the body or a hash (`06` S5.6).
  const decision = checkLoginRateLimit(callerKeyFor(request));
  if (!decision.allowed) {
    return withRetryAfter(
      apiError('RATE_LIMITED', AUTH_ERROR_MESSAGES.rateLimited, requestId),
      decision.retryAfterSeconds,
    );
  }

  // 2. Body validation. An unreadable body is a validation problem, not a 500.
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return apiError('VALIDATION_FAILED', AUTH_ERROR_MESSAGES.invalidBody, requestId, {
      fields: ['email', 'password'],
    });
  }
  const parsed = LoginRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError('VALIDATION_FAILED', 'The email or password field is missing or out of range.', requestId, {
      fields: parsed.error.issues.map((issue) => issue.path.join('.')),
    });
  }
  const { email, password } = parsed.data;

  const { databaseUrl, nodeEnv, authSecret } = getConfig();
  if (databaseUrl === null) {
    // `DATABASE_URL` absent is a degraded configuration, not a credential problem (D77): there is
    // no account to check, so the sign-in cannot succeed and must say so rather than 401.
    return apiError('INTERNAL', AUTH_ERROR_MESSAGES.internal, requestId);
  }

  // 3. Lookup + verification. Both failure shapes below return the identical 401.
  let user: AuthUser | null;
  try {
    user = await findUserByEmail(databaseUrl, email);
  } catch {
    // An unreachable database is not a wrong password. Reporting it as 401 would tell the user to
    // re-check credentials that were never compared.
    return apiError('INTERNAL', AUTH_ERROR_MESSAGES.internal, requestId);
  }

  const storedHash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
  const passwordMatches = await verifyPassword(storedHash, password);
  if (user === null || !passwordMatches) {
    return apiError('UNAUTHENTICATED', AUTH_ERROR_MESSAGES.unauthenticated, requestId);
  }

  // 4. `is_active = false` fails login with UNAUTHENTICATED (`06` S7.1.1), with the same body.
  if (!user.isActive) {
    return apiError('UNAUTHENTICATED', AUTH_ERROR_MESSAGES.unauthenticated, requestId);
  }

  // 5. Issue the session. The payload's role is a convenience for the middleware's cheap check;
  // `roles.ts` re-reads the role from the `users` row on every later request (`04` S9.1).
  const secret = authSecret;
  if (secret === null || secret === '') {
    throw new Error('AUTH_SECRET is not configured');
  }
  const now = Date.now();
  let courses;
  try {
    courses = await listCourseMemberships(databaseUrl, user.id);
  } catch {
    // The credential was valid; the enrolment read was not. That is not a login failure.
    return apiError('INTERNAL', AUTH_ERROR_MESSAGES.internal, requestId);
  }
  const token = signSessionToken(
    {
      v: 1,
      sub: user.id,
      role: user.role,
      iat: now,
      exp: now + SESSION_LIFETIME_MS,
    },
    secret,
    now,
  );

  const body: SessionResponse = buildSessionResponse({
    userId: user.id,
    role: user.role,
    profile: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      isActive: user.isActive,
    },
    courses,
    expiresAt: now + SESSION_LIFETIME_MS,
  });

  const response = NextResponse.json(body, { status: 200 });
  setSessionCookie(response, token, { secure: nodeEnv === 'production' });

  // Informational and best effort; it cannot fail the sign-in (see the repository comment).
  await touchLastLoginAt(databaseUrl, user.id, new Date(now));

  return withRequestId(response, requestId);
}
